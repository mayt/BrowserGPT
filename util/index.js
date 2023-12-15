import fs from 'fs';

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
  const indentation = 1;
  let formattedCode = `\t// ${userInput}\n`;

  // Split the code into lines and format each line
  const lines = generatedCode.split('\n');
  for (const line of lines) {
    formattedCode += formatCodeLine(line, indentation);
  }

  fs.appendFileSync(filePath, formattedCode, 'utf8');
}

export function completeTestFile(filePath) {
  fs.appendFileSync(filePath, '});', 'utf8');
}

function formatCodeLine(codeLine, indentation) {
  return `${'\t'.repeat(indentation)}${codeLine}\n`;
}
