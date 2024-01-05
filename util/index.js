import fs from 'fs';
// eslint-disable-next-line no-unused-vars
import colors from '@colors/colors';

const codeRegex = /```(.*)(\r\n|\r|\n)(?<code>[\w\W\n]+)(\r\n|\r|\n)```/;

export function preprocessJsonInput(text) {
  try {
    return text.match(codeRegex).groups.code.trim();
  } catch (e) {
    throw new Error('No code found');
  }
}
export {parseSite} from './page-parser.js';

export function createTestFile(filePath) {
  const boilerPlate = `import { test, expect } from '@playwright/test';

test('generated test', async ({ page }) => {
`;

  fs.writeFileSync(filePath, boilerPlate.trim() + '\n');
}

export function appendToTestFile(userInput, generatedCode, filePath) {
  let formattedCode = `\t// ${userInput}\n`;

  // Split the code into lines and format each line
  const lines = generatedCode.split('\n');
  for (const line of lines) {
    formattedCode += `\t${line.trim()}\n`;
  }

  fs.appendFileSync(filePath, `${formattedCode}\n`, 'utf8');
}

export function completeTestFile(filePath) {
  fs.appendFileSync(filePath, '});', 'utf8');
}

export function gracefulExit(options) {
  if (options.outputFilePath) {
    completeTestFile(options.outputFilePath);
  }

  console.log('Exiting'.red);
}

export async function logPageScreenshot(page) {
  const buffer = await page.screenshot();

  // Define the escape sequences for iTerm2
  const ESC = '\x1b';
  const BELL = '\x07';

  // Construct the iTerm2 Inline Images Protocol command
  const command = `${ESC}]1337;File=inline=1:${buffer.toString(
    'base64'
  )}${BELL}`;

  // Log the command to the console - this will display the image in iTerm2
  console.log(command);
}
