export interface KaiKnowledgeSource {
  id: string;
  app: string;
  language: string;
  title: string;
  path: string;
  summary?: string;
  enabled: boolean;
}

export interface KaiKnowledgeQuery {
  app: string;
  language: string;
  query: string;
}

export interface KaiKnowledgeLoader {
  listSources(app: string, language: string): Promise<KaiKnowledgeSource[]>;
  loadRelevantMarkdown(query: KaiKnowledgeQuery): Promise<string[]>;
}

export class StaticKaiKnowledgeLoader implements KaiKnowledgeLoader {
  constructor(private readonly sources: KaiKnowledgeSource[]) {}

  async listSources(app: string, language: string): Promise<KaiKnowledgeSource[]> {
    return this.sources.filter((source) => source.app === app && source.language === language && source.enabled);
  }

  async loadRelevantMarkdown(query: KaiKnowledgeQuery): Promise<string[]> {
    const sources = await this.listSources(query.app, query.language);
    return sources.map((source) => `${source.title}\n${source.summary ?? source.path}`);
  }
}

export const futureKnowledgeArchitecture = {
  vectorize: "Future semantic retrieval and embeddings",
  rag: "Future retrieval augmented response generation",
  mixedLanguage: "Future mixed English/Fijian routing",
} as const;
