import {parseSite} from '../util/index.js';
import {retry} from '@lifeomic/attempt';
import {HumanMessage, SystemMessage} from 'langchain/schema';

export async function findInPage(page, chatApi, task) {
  const systemPrompt = `
You are a programmer and your job is to pick out information in code to a pm. You are working on an html file. You will extract the necessary content asked from the information provided. 

Context:
Your computer is a mac. Cmd is the meta key, META.
The browser is already open. 
Current page url is ${await page.evaluate('location.href')}.
Current page title is ${await page.evaluate('document.title')}.

Here is the overview of the site. Format is in html:
\`\`\`
${await parseSite(page)}
\`\`\`

`;

  const completion = await retry(async () =>
    chatApi.call([new SystemMessage(systemPrompt), new HumanMessage(task)])
  );
  console.log('Found on page'.green);
  console.log(completion.text);
  console.log('EOF'.green);
  return completion.text;
}
