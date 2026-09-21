import { z } from 'zod';
import type { Meeting, Notes } from '../../shared/contracts';
import type { AiMedia } from './openai-intelligence';
import {
  meetingContext,
  notesInstruction,
  parseGroundedNotes,
  selectedFrames,
  UngroundedNotesError,
} from './notes-context';

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })),
});
const capabilitySchema = z.object({
  capabilities: z.array(z.string()),
  remote_host: z.string().optional(),
  remote_model: z.string().optional(),
});

export class OllamaNotes {
  constructor(
    private readonly model: () => string,
    private readonly media: AiMedia,
    private readonly request: typeof fetch = fetch,
  ) {}

  async summarize(meeting: Meeting): Promise<Notes> {
    const model = this.model();
    const frames = selectedFrames(meeting);
    await this.verifyLocalModel(model, Boolean(frames.length));

    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: meetingContext(meeting) },
    ];
    for (const frame of frames) {
      content.push({ type: 'text', text: `Écran à ${frame.at.toFixed(1)} secondes.` });
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${(await this.media.readFrame(meeting.id, frame.index)).toString('base64')}`,
        },
      });
    }

    const response = await this.call('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: notesInstruction },
          { role: 'user', content },
        ],
      }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok)
      throw new Error('Ollama n’a pas pu créer les notes. Vérifiez le modèle choisi.');
    try {
      const result = completionSchema.parse(await response.json());
      const text = result.choices[0]?.message.content;
      if (!text) throw new Error('Réponse Ollama vide.');
      return parseGroundedNotes(text, meeting);
    } catch (error) {
      if (error instanceof UngroundedNotesError) throw error;
      throw new Error('Réponse Ollama incomplète. Essayez un autre modèle de vision.');
    }
  }

  private async verifyLocalModel(model: string, needsVision: boolean): Promise<void> {
    if (model.endsWith(':cloud')) {
      throw new Error('Ce modèle Ollama utilise le cloud. Choisissez un modèle local.');
    }
    const response = await this.call('http://127.0.0.1:11434/api/show', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error('Modèle Ollama introuvable. Téléchargez-le puis réessayez.');
    const details = capabilitySchema.parse(await response.json());
    if (details.remote_host || details.remote_model) {
      throw new Error('Ce modèle Ollama utilise le cloud. Choisissez un modèle local.');
    }
    if (needsVision && !details.capabilities.includes('vision')) {
      throw new Error('Ce modèle Ollama ne lit pas les images. Choisissez un modèle de vision.');
    }
  }

  private async call(url: string, options: RequestInit): Promise<Response> {
    try {
      return await this.request(url, options);
    } catch {
      throw new Error('Ollama est inaccessible. Démarrez Ollama sur cet ordinateur.');
    }
  }
}
