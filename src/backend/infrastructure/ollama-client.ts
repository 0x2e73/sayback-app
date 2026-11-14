import { z } from 'zod';
import { CONTEXT_TOKENS, OUTPUT_TOKENS, REQUEST_TIMEOUT_MS } from './ollama-budget';

const baseUrl = 'http://127.0.0.1:11434';
const replySchema = z.object({
  message: z.object({ content: z.string() }),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().optional(),
});
const capabilitySchema = z.object({
  capabilities: z.array(z.string()),
  remote_host: z.string().optional(),
  remote_model: z.string().optional(),
});

export interface ChatInput {
  model: string;
  system: string;
  user: string;
  images: Buffer[];
  /** JSON schema of the answer. */
  format: object;
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/** Ollama's native API: the only one that pins the window (`num_ctx`) and turns thinking off. */
export class OllamaClient {
  constructor(private readonly request: typeof fetch) {}

  async verifyLocalModel(model: string, needsVision: boolean): Promise<void> {
    if (/[:-]cloud$/.test(model)) {
      throw new Error('Ce modèle Ollama utilise le cloud. Choisissez un modèle local.');
    }
    const response = await this.post('/api/show', { model }, 20_000);
    if (!response.ok) throw new Error('Modèle Ollama introuvable. Téléchargez-le puis réessayez.');
    const details = capabilitySchema.parse(await response.json());
    if (details.remote_host || details.remote_model) {
      throw new Error('Ce modèle Ollama utilise le cloud. Choisissez un modèle local.');
    }
    if (needsVision && !details.capabilities.includes('vision')) {
      throw new Error('Ce modèle Ollama ne lit pas les images. Choisissez un modèle de vision.');
    }
  }

  /** The JSON text of the model's answer; every failure says what really happened. */
  async chat(input: ChatInput): Promise<string> {
    const response = await this.post(
      '/api/chat',
      {
        model: input.model,
        stream: false,
        // A thinking model would spend the whole window on reasoning and answer nothing.
        think: false,
        format: input.format,
        options: { num_ctx: CONTEXT_TOKENS, num_predict: OUTPUT_TOKENS },
        messages: [
          { role: 'system', content: input.system },
          {
            role: 'user',
            content: input.user,
            ...(input.images.length
              ? { images: input.images.map((image) => image.toString('base64')) }
              : {}),
          },
        ],
      },
      REQUEST_TIMEOUT_MS,
    );
    if (!response.ok) {
      throw new Error(
        `Ollama a refusé la demande (code ${response.status}). Vérifiez le modèle choisi, puis relancez l’analyse.`,
      );
    }
    const reply = replySchema.safeParse(await this.json(response));
    if (!reply.success)
      throw new Error('Ollama a renvoyé une réponse illisible. Relancez l’analyse.');
    const content = reply.data.message.content;
    // Dense text or a tall frame can cost more than estimated and leave the answer no room. An answer
    // that ended on its own and parses is kept; a cut or unreadable one is this cause, and retrying
    // cannot change it.
    const tight = (reply.data.prompt_eval_count ?? 0) + OUTPUT_TOKENS > CONTEXT_TOKENS;
    if (tight && (reply.data.done_reason === 'length' || !isJson(content))) {
      throw new Error(
        'Cette partie de la réunion est trop dense pour la fenêtre du modèle Ollama. Réessayer ne changera rien : utilisez un fournisseur à plus grande capacité dans les réglages.',
      );
    }
    if (reply.data.done_reason === 'length') {
      throw new Error('Ollama a coupé sa réponse avant la fin. Relancez l’analyse.');
    }
    if (!content.trim()) {
      throw new Error('Ollama a renvoyé une réponse vide. Relancez l’analyse.');
    }
    return content;
  }

  private async json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      if (isTimeout(error)) throw this.tooSlow();
      return null;
    }
  }

  private tooSlow(): Error {
    return new Error('Ollama a mis trop de temps à répondre. Relancez l’analyse.');
  }

  private async post(path: string, body: unknown, timeout: number): Promise<Response> {
    try {
      return await this.request(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      if (isTimeout(error)) throw this.tooSlow();
      throw new Error('Ollama est inaccessible. Démarrez Ollama sur cet ordinateur.');
    }
  }
}
