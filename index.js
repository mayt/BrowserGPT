import {retry} from '@lifeomic/attempt';
import dotenv from 'dotenv';
import {chromium} from 'playwright';
import prompt from 'prompt';
// eslint-disable-next-line no-unused-vars
import colors from '@colors/colors';
import {parse} from 'node-html-parser';
import {Command} from 'commander';

import {ChatOpenAI} from 'langchain/chat_models/openai';
import {HumanMessage, SystemMessage} from 'langchain/schema';

import {JSDOM} from 'jsdom';

const {document} = new JSDOM(`...`).window;

dotenv.config();

const AsyncFunction = async function () {}.constructor;

const tagsToLog = [
  'a',
  'p',
  'span',
  'div',
  'button',
  'label',
  'input',
  'textarea',
  'section',
  'select',
  'option',
  'table',
  'td',
  'th',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'iframe',
];

function createElement(node) {
  const elem = document.createElement(node.tagName);

  const dataAttributes = Object.entries(node.attributes).filter(
    (a) =>
      (tagsToLog.includes(node.tagName) &&
        (a[0].startsWith('name') ||
          a[0].startsWith('value') ||
          a[0].startsWith('data-component') ||
          a[0].startsWith('data-name') ||
          a[0].startsWith('aria-') ||
          a[0] === 'class' ||
          a[0] === 'type' ||
          a[0] === 'role')) ||
      // always log these
      a[0] === 'href' ||
      a[0] === 'id'
  );
  dataAttributes.forEach(([attr, value]) => {
    elem.setAttribute(attr, value);
  });

  return elem;
}

function createTextNode(text) {
  return document.createTextNode(text);
}

function isAdsIframe(node) {
  const style = node.getAttribute('style') || '';
  const id = node.getAttribute('id') || '';
  return (
    node.getAttribute('height') === 0 ||
    style.includes('display: none') ||
    id.startsWith('google_ads_iframe')
  );
}

async function dfs(node, parentElem, childFrames = []) {
  for (const childNode of node.childNodes) {
    if (childNode.nodeType === 1) {
      if (childNode.tagName === 'IFRAME') {
        // optimize for performance later
        for (let {childFrame, attributes} of childFrames) {
          if (
            Object.entries(attributes).every(
              ([attr, value]) => childNode.getAttribute(attr) === value
            )
          ) {
            // skip blocks that look like ads
            if (isAdsIframe(childNode)) {
              continue;
            }

            const childElem = createElement(childNode);
            parentElem.appendChild(childElem);
            const newChildFrame = await toChildFramesWithAttributes(childFrame);
            const bodyNode = await childFrame.locator('body', {timeout: 1000});
            const bodyHtml = await bodyNode.innerHTML();
            await dfs(parseFrame(bodyHtml), childElem, newChildFrame);

            // ignore other matches that might be the same parent
            break;
          }
        }
      } else {
        const childElem = createElement(childNode);
        parentElem.appendChild(childElem);
        await dfs(childNode, childElem, childFrames);
      }
    } else if (childNode.nodeType === 3) {
      if (!childNode.isWhitespace) {
        const textElem = createTextNode(childNode);
        parentElem.appendChild(textElem);
      }
    }
  }
}

async function toChildFramesWithAttributes(frame) {
  const childFramesWithAttributes = [];
  for (let childFrame of frame.childFrames()) {
    const childFrameElement = await childFrame.frameElement();
    const attributes = await childFrameElement.evaluate((node) => {
      const attrs = {};
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        attrs[attr.name] = attr.value;
      }
      return attrs;
    });
    childFramesWithAttributes.push({childFrame, attributes});
  }
  return childFramesWithAttributes;
}

async function getStructure(frame) {
  const bodyNode = await frame.locator('body', {timeout: 1000});
  const bodyHtml = await bodyNode.innerHTML();
  const node = parseFrame(bodyHtml);

  const rootElem = createElement(node);
  await dfs(node, rootElem, await toChildFramesWithAttributes(frame));
  return rootElem;
}

function parseFrame(html) {
  return parse(html, {
    blockTextElements: {
      script: false,
      noscript: false,
      style: false,
      pre: true, // keep text content when parsing
    },
  });
}

async function parseSite(page) {
  let mainFrame = page.mainFrame();
  const structure = await getStructure(mainFrame);
  return structure.innerHTML;
}

async function queryGPT(chatApi, messages) {
  const completion = await retry(async () => chatApi.call(messages));
  console.log('Commands to be executed'.green);
  let cleanedCommands = null;
  try {
    const codeRegex = /```(.*)(\r\n|\r|\n)(?<code>[\w\W\n]+)(\r\n|\r|\n)```/;
    cleanedCommands = completion.text.match(codeRegex).groups.code.trim();

    console.log(cleanedCommands);
  } catch (e) {
    console.log('No code found'.red);
  }

  console.log('EOF'.green);

  return cleanedCommands;
}

async function doAction(chatApi, page, task, options = {}) {
  const systemPrompt = `
You are a programmer and your job is to write code. You are working on a playwright file. You will write the commands necessary to execute the given input. 

Context:
Your computer is a mac. Cmd is the meta key, META.
The browser is already open. 
Current page url is ${await page.evaluate('location.href')}.
Current page title is ${await page.evaluate('document.title')}.

Here is the overview of the site. Format is in html:
${await parseSite(page, options)}

Your output should just be the code that is valid for PlayWright page api. When given the option to use a timeout option, use 1s. Except when using page.goto() use 10s. For actions like click, use the force option to click on hidden elements.

User: click on show hn link
Assistant:
\`\`\`
const articleByText = 'Show HN';
await page.getByText(articleByText, { exact: true }).click(articleByText, {force: true, hidden: true});
\`\`\`
`;
  let code = '';
  try {
    code = await queryGPT(chatApi, [
      new SystemMessage(systemPrompt),
      new HumanMessage(task),
    ]);
  } catch (e) {
    console.log(e.response.data.error);
  }
  try {
    const func = AsyncFunction('page', code);
    await func(page);
  } catch (e) {
    console.log(e);
  }
}

async function main(options) {
  const url = options.url;
  const browser = await chromium.launch({headless: false});
  const browserContext = await browser.newContext();
  const page = await browserContext.newPage();
  await page.goto(url);

  prompt.message = 'BrowserGPT'.green;
  prompt.delimiter = '>'.green;
  prompt.start();

  const chatApi = new ChatOpenAI({
    temperature: 0.1,
    modelName: options.model ? options.model : 'gpt-4-1106-preview',
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const {task} = await prompt.get({
      properties: {
        task: {
          message: ' Input a task\n',
          required: true,
        },
      },
    });
    try {
      await doAction(chatApi, page, task, options);
    } catch (e) {
      console.log('Execution failed');
      console.log(e);
    }
  }
}

const program = new Command();

program
  .option('-u, --url <url>', 'url to start on', 'https://www.google.com')
  .option('-m, --model <model>', 'openai model to use', 'gpt-4-1106-preview');

program.parse();

main(program.opts());
