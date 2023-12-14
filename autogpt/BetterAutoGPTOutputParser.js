import {AutoGPTOutputParser} from 'langchain/experimental/autogpt';
import {preprocessJsonInput} from '../util/index.js';

export class BetterAutoGPTOutputParser extends AutoGPTOutputParser {
  async parse(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      const preprocessedText = preprocessJsonInput(text);
      try {
        parsed = JSON.parse(preprocessedText);
      } catch (error) {
        return {
          name: 'ERROR',
          args: {error: `Could not parse invalid json: ${text}`},
        };
      }
    }
    try {
      return {
        name: parsed.command.name,
        args: parsed.command.args,
      };
    } catch (error) {
      return {
        name: 'ERROR',
        args: {error: `Incomplete command args: ${parsed}`},
      };
    }
  }
}
