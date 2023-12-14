const codeRegex = /```(.*)(\r\n|\r|\n)(?<code>[\w\W\n]+)(\r\n|\r|\n)```/;

export function preprocessJsonInput(text) {
  try {
    return text.match(codeRegex).groups.code.trim();
  } catch (e) {
    throw new Error('No code found');
  }
}
export {parseSite} from './page-parser.js';
