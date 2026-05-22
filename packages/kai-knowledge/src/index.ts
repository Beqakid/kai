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

export const kaiKnowledgeSources: KaiKnowledgeSource[] = [
  {
    id: "carehia_overview",
    app: "carehia",
    language: "en",
    title: "Carehia overview",
    path: "knowledge/carehia/en/overview.md",
    summary: "Carehia platform overview and Kai's caregiver-search onboarding role.",
    enabled: true,
  },
  {
    id: "carehia_finding_caregivers",
    app: "carehia",
    language: "en",
    title: "Finding caregivers",
    path: "knowledge/carehia/en/finding-caregivers.md",
    summary: "Guidance fields for preparing a caregiver-search brief.",
    enabled: true,
  },
  {
    id: "carehia_onboarding",
    app: "carehia",
    language: "en",
    title: "Carehia onboarding",
    path: "knowledge/carehia/en/onboarding.md",
    summary: "Carehia onboarding should feel like a guided personal assistant flow.",
    enabled: true,
  },
  {
    id: "carehia_safety_boundaries",
    app: "carehia",
    language: "en",
    title: "Carehia safety boundaries",
    path: "knowledge/carehia/en/safety-boundaries.md",
    summary: "Carehia safety limits for medical, caregiver approval, booking, and payment decisions.",
    enabled: true,
  },
  {
    id: "carehia_faq",
    app: "carehia",
    language: "en",
    title: "Carehia FAQ",
    path: "knowledge/carehia/en/faq.md",
    summary: "Initial FAQ for Kai as a Carehia onboarding assistant.",
    enabled: true,
  },
  {
    id: "carehia_privacy_summary",
    app: "carehia",
    language: "en",
    title: "Carehia privacy summary",
    path: "knowledge/carehia/en/privacy-summary.md",
    summary: "Privacy-oriented summary for handling care-search details.",
    enabled: true,
  },
  {
    id: "carehia_overview_es",
    app: "carehia",
    language: "es",
    title: "Resumen de Carehia",
    path: "knowledge/carehia/es/overview.md",
    summary: "Resumen inicial de Carehia para soporte multilingue.",
    enabled: true,
  },
  {
    id: "carehia_overview_fj",
    app: "carehia",
    language: "fj",
    title: "Carehia overview",
    path: "knowledge/carehia/fj/overview.md",
    summary: "Initial Fijian Carehia overview for multilingual routing.",
    enabled: true,
  },
];
