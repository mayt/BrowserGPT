import {OpenAIEmbeddings} from 'langchain/embeddings/openai';

export class TruncatedOpenAIEmbeddings extends OpenAIEmbeddings {
  async embedQuery(text) {
    return super.embedQuery(text.slice(0, 8000));
  }

  async embedDocuments(documents) {
    return super.embedDocuments(
      documents.map((document) => document.slice(0, 8000))
    );
  }
}
