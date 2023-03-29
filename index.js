import {retry} from '@lifeomic/attempt';
import dotenv from 'dotenv';
import {OpenAIApi, Configuration} from 'openai';
import {chromium} from 'playwright';
import prompt from 'prompt';
// eslint-disable-next-line no-unused-vars
import colors from '@colors/colors';
import {parse} from 'node-html-parser';

import {Command} from 'commander';

dotenv.config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

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
];

const alwaysLog = ['a', 'input', 'button', 'li'];

function getStructure(node, reducedText = false) {
  const res = [];
  let indention = 0;
  function write(str) {
    res.push('-'.repeat(indention) + str);
  }
  function dfs(node) {
    let nodeModifier = '';
    const idStr = node.id ? `#${node.id}` : '';
    if (idStr) {
      nodeModifier += idStr;
    }
    const attrValue = node.getAttribute('value');
    if (attrValue) {
      nodeModifier += `[value="${attrValue}"]`;
    }
    const attrName = node.getAttribute('name');
    if (attrName) {
      nodeModifier += `[name="${attrName}"]`;
    }
    if (tagsToLog.includes(node.rawTagName)) {
      if (nodeModifier || alwaysLog.includes(node.rawTagName)) {
        write(`${node.rawTagName}${nodeModifier}`);
      }
    }

    indention++;
    node.childNodes.forEach((childNode) => {
      if (childNode.nodeType === 1) {
        dfs(childNode);
      } else if (childNode.nodeType === 3) {
        if (!childNode.isWhitespace) {
          if (reducedText) {
            if (alwaysLog.includes(node.rawTagName)) {
              write(childNode.text);
            }
          } else {
            write(childNode.text);
          }
        }
      }
    });
    indention--;
  }
  dfs(node);
  return res.join('\n');
}

const modelSiteTokenLimit = {
  'gpt-4': 7000, // official limit 8096,
  'gpt-4-32k': 31000, // official limit 32768,
  'gpt-3.5-turbo': 3000, // official limit 4097,
};

async function parseSite(page, options = {}) {
  const html = await (await page.locator('body', {timeout: 1000})).innerHTML();
  const root = parse(html, {
    blockTextElements: {
      script: false,
      noscript: false,
      style: false,
      pre: true, // keep text content when parsing
    },
  });
  let tokenLimit =
    modelSiteTokenLimit[options.model || 'gpt-3.5-turbo'] || Infinity;
  let structure = getStructure(root);
  // bad token count guess
  if (structure.length / 4 < tokenLimit) {
    return structure;
  }
  // shorten down the text and try again
  structure = getStructure(root, true);
  if (structure.length / 4 < tokenLimit) {
    console.log('Site too large, using chunking down the text body'.yellow);
    return structure;
  }

  // giving up on the site body
  console.log('Site too large, dropping the site content'.yellow);
  return '';
}

async function queryGPT(messages, options = {}) {
  const completion = await retry(async () =>
    openai.createChatCompletion({
      model: options.model || 'gpt-3.5-turbo',
      temperature: 0.1,
      messages,
    })
  );
  console.log('Comands to be executed'.green);
  const cleanedCommands = completion.data.choices[0].message.content
    .trim()
    .split('\n')
    .slice(1, -1)
    .join('\n');

  console.log(cleanedCommands);
  console.log('EOF'.green);

  return cleanedCommands;
}

async function doAction(page, task, options = {}) {
  const systemPrompt = `
You are a programmer and your job is to write code. You are working on a playwright file. You will write the commands necessary to execute the given input. 

Context:
Your computer is a mac. Cmd is the meta key, META.
You are on the website ${page.evaluate('location.href')}

Here is the overview of the site
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
    code = await queryGPT(
      [
        {role: 'system', content: systemPrompt},
        {role: 'user', content: task},
      ],
      options
    );
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
      await doAction(page, task, options);
    } catch (e) {
      console.log('Execution failed');
      console.log(e);
    }
  }
}

const program = new Command();

program
  .option('-u, --url <url>', 'url to start on', 'https://www.google.com')
  .option('-m, --model <model>', 'openai model to use', 'gpt-3.5-turbo');

program.parse();

main(program.opts());
