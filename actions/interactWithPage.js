import {retry} from '@lifeomic/attempt';
import {parseSite, preprocessJsonInput} from '../util/index.js';
import {HumanMessage, SystemMessage} from 'langchain/schema';
import {expect} from '@playwright/test';

const AsyncFunction = async function () {}.constructor;

export async function interactWithPage(chatApi, page, task) {
  const code = await getPlayWrightCode(page, chatApi, task);
  return execPlayWrightCode(page, code, expect);
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

  let code = '';
  try {
    code = await queryGPT(chatApi, [
      new SystemMessage(systemPrompt),
      new HumanMessage(task),
    ]);

    return code;
  } catch (e) {
    console.log(e.response.data.error);
    throw e;
  }
}

async function execPlayWrightCode(page, code, expect) {
  try {
    const func = AsyncFunction('page', 'expect', code);
    return await func(page, expect);
  } catch (e) {
    console.log(e);
    return e;
  }
}
