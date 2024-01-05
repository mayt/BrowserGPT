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
You are a Senior SDET tasked with writing Playwright code for testing purposes. Your role involves implementing specific task-based code segments within a larger test file, following the instructions provided closely. Assume that common imports like 'test' and 'expect' from '@playwright/test' are already at the top of the file.

Context:
- Your computer is a Mac. Cmd is the meta key, META.
- The browser is already open.
- Current page URL: ${await page.evaluate('location.href')}.
- Current page title: ${await page.evaluate('document.title')}.
- Overview of the site in HTML format:
\`\`\`
${await parseSite(page)}
\`\`\`

Key Points:
- Start directly with Playwright actions as described in the user task, without adding extraneous steps or assertions.
- Include assertions like 'expect' statements or wait functions such as 'waitForLoadState' only when they are specifically requested in the user task.
- Minimal, relevant comments should be used to clarify complex actions or essential aspects of the test's purpose.
- Apply 'frameLocator' for content in nested iframes, as needed based on the task requirements.

User Task: [Insert the specific user task here, including any detailed instructions related to the execution, waiting for specific conditions, or explicit requests for assertions and waits.]

Expected Code Format:
\`\`\`
// [Insert Playwright code based on the task description. Begin with necessary actions directly, and include 'waitForLoadState', assertions, or 'expect' statements only if explicitly requested in the task. Comments should be concise and pertinent, especially for complex actions or decisions.]
\`\`\`

The objective is to create Playwright code that is efficient, precise, and perfectly aligned with the task's requirements, integrating seamlessly into the larger test file. All actions and comments should be relevant and necessary, catering to a senior-level professional's understanding of the testing scenario.`;

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

  const func = AsyncFunction(...dependencies.map((d) => d.param), code);
  const args = dependencies.map((d) => d.value);
  return await func(...args);
}
