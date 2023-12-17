import {retry} from '@lifeomic/attempt';
import {HumanMessage, SystemMessage} from 'langchain/schema';
import {expect} from '@playwright/test';
import {
  parseSite,
  preprocessJsonInput,
  appendToTestFile,
} from '../util/index.js';

const AsyncFunction = async function () {}.constructor;

export async function interactWithPage(chatApi, page, task, options) {
  const code = await getPlayWrightCode(page, chatApi, task);

  if (options.outputFilePath) {
    appendToTestFile(task, code, options.outputFilePath);
  }

  return execPlayWrightCode(page, code);
}

async function queryGPT(chatApi, messages) {
  const completion = await retry(async () => chatApi.call(messages));
  console.log('Commands to be executed'.green);
  let cleanedCommands = null;
  try {
    cleanedCommands = preprocessJsonInput(completion.text);
    console.log(cleanedCommands);
  } catch (e) {
    console.log('No code found'.red);
  }

  console.log('EOF'.green);

  return cleanedCommands;
}

async function getPlayWrightCode(page, chatApi, task) {
  const systemPrompt = `
You are a programmer and your job is to write code. You are working on a playwright file. You will write the commands necessary to execute the given input.

Context:
Your computer is a mac. Cmd is the meta key, META.
The browser is already open.
Current page url is ${await page.evaluate('location.href')}.
Current page title is ${await page.evaluate('document.title')}.

Here is the overview of the site. Format is in html:
\`\`\`
${await parseSite(page)}
\`\`\`

Your output should just be the code that is valid for PlayWright page api.

If the content is inside nested iframes, use 'frameLocator' function to select each layer starting from the top level page.

User: click on show hn link
Assistant:
\`\`\`
const articleByText = 'Show HN';
await page.getByText(articleByText, { exact: true }).click(articleByText);
\`\`\`

`;

  return await queryGPT(chatApi, [
    new SystemMessage(systemPrompt),
    new HumanMessage(task),
  ]);
}

async function execPlayWrightCode(page, code) {
  const dependencies = [
    {param: 'page', value: page},
    {param: 'expect', value: expect},
  ];

  try {
    const func = AsyncFunction(...dependencies.map((d) => d.param), code);
    const args = dependencies.map((d) => d.value);

    return await func(...args);
  } catch (e) {
    console.log(e);
    return e;
  }
}
