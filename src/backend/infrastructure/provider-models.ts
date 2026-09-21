import { z } from 'zod';
import type { NotesProvider } from '../../shared/contracts';
import { compatibleBaseUrl } from '../../shared/compatible-url';

const modelPageSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
  has_more: z.boolean().optional(),
  last_id: z.string().nullable().optional(),
});
const localModelsSchema = z.object({
  models: z.array(z.object({ name: z.string(), remote_host: z.string().optional() })),
});
const geminiModelsSchema = z.object({
  models: z.array(
    z.object({ name: z.string(), supportedGenerationMethods: z.array(z.string()).optional() }),
  ),
  nextPageToken: z.string().optional(),
});

export class ProviderModels {
  constructor(
    private readonly openai: { list(): Promise<string[]> },
    private readonly anthropicKey: () => string,
    private readonly request: typeof fetch = fetch,
    private readonly geminiKey: () => string = () => '',
    private readonly compatible: () => { key: string; baseUrl: string } = () => ({
      key: '',
      baseUrl: '',
    }),
  ) {}

  async list(provider: NotesProvider): Promise<string[]> {
    if (provider === 'openai') return this.openai.list();
    if (provider === 'anthropic') return this.listAnthropic();
    if (provider === 'gemini') return this.listGemini();
    if (provider === 'compatible') return this.listCompatible();
    return this.listOllama();
  }

  private async listGemini(): Promise<string[]> {
    const models: string[] = [];
    let pageToken = '';
    const seen = new Set<string>();
    do {
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      let response: Response;
      try {
        response = await this.request(url, {
          headers: { 'x-goog-api-key': this.geminiKey() },
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new Error('Impossible de charger les modèles Gemini. Vérifiez votre connexion.');
      }
      if (response.status === 401 || response.status === 403)
        throw new Error('Clé Gemini invalide.');
      if (!response.ok) throw new Error('Impossible de charger les modèles Gemini.');
      const page = geminiModelsSchema.parse(await response.json());
      models.push(
        ...page.models
          .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
          .map((model) => model.name.replace(/^models\//, '')),
      );
      pageToken = page.nextPageToken ?? '';
      if (pageToken && seen.has(pageToken)) throw new Error('Liste des modèles Gemini incomplète.');
      if (pageToken) seen.add(pageToken);
    } while (pageToken);
    return [...new Set(models)].sort();
  }

  private async listCompatible(): Promise<string[]> {
    const { key, baseUrl } = this.compatible();
    let response: Response;
    try {
      response = await this.request(`${compatibleBaseUrl(baseUrl)}/models`, {
        headers: key ? { authorization: `Bearer ${key}` } : {},
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error(
        'Impossible de charger les modèles de cette API. Saisissez leur ID manuellement.',
      );
    }
    if (!response.ok)
      throw new Error(
        'Cette API ne fournit pas sa liste de modèles. Saisissez un ID manuellement.',
      );
    const data = modelPageSchema.pick({ data: true }).parse(await response.json());
    return [...new Set(data.data.map((model) => model.id))].sort();
  }

  private async listAnthropic(): Promise<string[]> {
    const key = this.anthropicKey();
    const models: string[] = [];
    const cursors = new Set<string>();
    let after = '';
    do {
      const url = new URL('https://api.anthropic.com/v1/models');
      url.searchParams.set('limit', '1000');
      if (after) url.searchParams.set('after_id', after);
      let response: Response;
      try {
        response = await this.request(url, {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new Error('Impossible de charger les modèles Claude. Vérifiez votre connexion.');
      }
      if (response.status === 401) throw new Error('Clé Claude invalide.');
      if (!response.ok) throw new Error('Impossible de charger les modèles Claude.');
      const page = modelPageSchema.parse(await response.json());
      models.push(...page.data.map((model) => model.id));
      after = page.has_more ? (page.last_id ?? '') : '';
      if (page.has_more && (!after || cursors.has(after))) {
        throw new Error('Liste des modèles Claude incomplète. Réessayez.');
      }
      if (after) cursors.add(after);
    } while (after);
    return models;
  }

  private async listOllama(): Promise<string[]> {
    let response: Response;
    try {
      response = await this.request('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error('Ollama est inaccessible. Démarrez Ollama sur cet ordinateur.');
    }
    if (!response.ok) throw new Error('Impossible de charger les modèles Ollama.');
    const result = localModelsSchema.parse(await response.json());
    return result.models
      .filter((model) => !model.remote_host && !model.name.endsWith(':cloud'))
      .map((model) => model.name)
      .sort((a, b) => a.localeCompare(b));
  }
}
