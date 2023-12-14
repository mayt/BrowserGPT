import dotenv from 'dotenv';
import {chromium} from 'playwright';
import prompt from 'prompt';
// eslint-disable-next-line no-unused-vars
import colors from '@colors/colors';
import {Command} from 'commander';

import {ChatOpenAI} from 'langchain/chat_models/openai';
import {doActionWithAutoGPT} from './autogpt/index.js';
import {interactWithPage} from './actions/index.js';
import {createTestFile, completeTestFile} from './util/index.js';

dotenv.config();

async function main(options) {
  const url = options.url;
  const browser = await chromium.launch({headless: false});
  const browserContext = await browser.newContext();
  const page = await browserContext.newPage();
  await page.goto(url);

  prompt.message = 'BrowserGPT'.green;
  if (options.autogpt) {
    prompt.message += ' (+AutoGPT)'.green;
  }
  prompt.delimiter = '>'.green;

  prompt.start();

  const chatApi = new ChatOpenAI({
    temperature: 0.1,
    modelName: options.model ? options.model : 'gpt-4-1106-preview',
  });

  if (options.outputFilePath) {
    createTestFile(options.outputFilePath);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const {task} = await prompt.get({
      properties: {
        task: {
          message: ' Input a task\n',
          required: false,
        },
      },
    });

    if (task === '') {
      if (options.outputFilePath) {
        completeTestFile(options.outputFilePath);
      }

      console.log('Exiting'.red);
      process.exit(0);
    }

    try {
      if (options.autogpt) {
        await doActionWithAutoGPT(page, chatApi, task, options);
      } else {
        await interactWithPage(chatApi, page, task, options);
      }
    } catch (e) {
      console.log('Execution failed');
      console.log(e);
    }
  }
}

const program = new Command();

program
  .option('-u, --url <url>', 'url to start on', 'https://www.google.com')
  .option('-m, --model <model>', 'openai model to use', 'gpt-4-1106-preview')
  .option('-a, --autogpt', 'run with autogpt', false)
  .option('-o, --outputFilePath <outputFilePath>', 'path to store test code');

program.parse();

main(program.opts());
