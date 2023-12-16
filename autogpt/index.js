import {NodeFileStore} from 'langchain/stores/file/node';
import {HNSWLib} from 'langchain/vectorstores/hnswlib';
import {TruncatedOpenAIEmbeddings} from './TruncatedOpenAIEmbeddings.js';
import {DynamicTool, ReadFileTool, WriteFileTool} from 'langchain/tools';
import {AutoGPT} from 'langchain/experimental/autogpt';
import {BetterAutoGPTOutputParser} from './BetterAutoGPTOutputParser.js';
import {findInPage, goToLink, interactWithPage} from '../actions/index.js';

export async function doActionWithAutoGPT(page, chatApi, task, options) {
  const store = new NodeFileStore();
  // need a way to truncate long responses that is over 4096 tokens
  const vectorStore = new HNSWLib(new TruncatedOpenAIEmbeddings(), {
    space: 'cosine',
    numDimensions: 1536,
  });
  const tools = [
    new ReadFileTool({store}),
    new WriteFileTool({store}),
    new DynamicTool({
      name: 'interact with the page',
      description:
        'perform an action on the current page. Returns success after the interaction is successful or an error message if the interaction failed. the task should be written as a directive what the browser should do.',
      func: async (task) => {
        try {
          await interactWithPage(chatApi, page, task, options);
          return 'Success';
        } catch (e) {
          console.log(e);
          return 'Error:' + e.toString();
        }
      },
    }),
    new DynamicTool({
      name: 'find in current page',
      description:
        'find something in the html body content of the current webpage. use this content to figure out your next step. the task should be written question explaining what you want to find.',
      func: async (task) => {
        try {
          const found = await findInPage(page, chatApi, task);
          return 'Success: ' + found;
        } catch (e) {
          console.log(e);
          return 'Error:' + e.toString();
        }
      },
    }),
    new DynamicTool({
      name: 'go to url',
      description:
        'go to a specific url. Returns the page content of the new page or an error message if the goto failed.',
      func: async (link) => {
        try {
          await goToLink(page, link);
          return 'Success';
        } catch (e) {
          console.log(e);
          return 'Error:' + e.toString();
        }
      },
    }),
  ];
  const autogpt = AutoGPT.fromLLMAndTools(chatApi, tools, {
    memory: vectorStore.asRetriever(),
    aiName: 'Developer Digest Assistant',
    aiRole: 'Assistant',
    humanInTheLoop: false,
    outputParser: new BetterAutoGPTOutputParser(),
    //maxIterations: 4,
  });

  try {
    await autogpt.run([task]);
  } catch (e) {
    console.log(e);
  }
}
