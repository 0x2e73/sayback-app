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

const responseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

export class AnthropicNotes {
  constructor(
    private readonly key: () => string,
    private readonly model: () => string,
    private readonly media: AiMedia,
    private readonly request: typeof fetch = fetch,
  ) {}

  async summarize(meeting: Meeting): Promise<Notes> {
    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: meetingContext(meeting) },
    ];
    for (const frame of selectedFrames(meeting)) {
      content.push({ type: 'text', text: `Écran à ${frame.at.toFixed(1)} secondes.` });
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: (await this.media.readFrame(meeting.id, frame.index)).toString('base64'),
        },
      });
    }

    const key = this.key();
    let response: Response;
    try {
      response = await this.request('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model(),
          max_tokens: 4096,
          system: notesInstruction,
          messages: [{ role: 'user', content }],
        }),
        signal: AbortSignal.timeout(180_000),
      });
    } catch {
      throw new Error('Claude est inaccessible. Votre enregistrement est conservé.');
    }
    if (response.status === 401) throw new Error('Clé Claude invalide. Vérifiez les paramètres.');
    if (response.status === 429) throw new Error('Quota Claude atteint. Réessayez plus tard.');
    if (!response.ok) throw new Error('Claude n’a pas pu créer les notes. Réessayez.');

    try {
      const result = responseSchema.parse(await response.json());
      const text = result.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
      if (!text) throw new Error('Réponse Claude vide. Réessayez.');
      return parseGroundedNotes(text, meeting);
    } catch (error) {
      if (error instanceof UngroundedNotesError) throw error;
      throw new Error('Réponse Claude incomplète. Relancez l’analyse.');
    }
  }
}
