import { z } from 'zod';
import type { Meeting, Notes } from '../../shared/contracts';
import { compatibleBaseUrl } from '../../shared/compatible-url';
import type { AiMedia } from './openai-intelligence';
import {
  meetingContext,
  notesInstruction,
  parseGroundedNotes,
  selectedFrames,
  UngroundedNotesError,
} from './notes-context';

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })),
});

function requestHeaders(key: string): Record<string, string> {
  return key
    ? { 'content-type': 'application/json', authorization: `Bearer ${key}` }
    : { 'content-type': 'application/json' };
}

export class CompatibleNotes {
  constructor(
    private readonly baseUrl: () => string,
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
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${(await this.media.readFrame(meeting.id, frame.index)).toString('base64')}`,
        },
      });
    }
    let response: Response;
    try {
      response = await this.request(`${compatibleBaseUrl(this.baseUrl())}/chat/completions`, {
        method: 'POST',
        headers: requestHeaders(this.key()),
        body: JSON.stringify({
          model: this.model(),
          messages: [
            { role: 'system', content: notesInstruction },
            { role: 'user', content },
          ],
        }),
        signal: AbortSignal.timeout(180_000),
      });
    } catch {
      throw new Error('API compatible inaccessible. Vérifiez son URL et votre connexion.');
    }
    if (response.status === 401 || response.status === 403)
      throw new Error('Clé de l’API compatible invalide ou accès refusé.');
    if (response.status === 429) throw new Error('Quota de l’API compatible atteint.');
    if (!response.ok)
      throw new Error(
        'Ce modèle ne peut pas créer les notes. Vérifiez la vision et le modèle choisi.',
      );
    try {
      const result = responseSchema.parse(await response.json());
      const text = result.choices[0]?.message.content;
      if (!text) throw new Error('Réponse vide.');
      return parseGroundedNotes(text, meeting);
    } catch (error) {
      if (error instanceof UngroundedNotesError) throw error;
      throw new Error('Réponse de l’API compatible incomplète. Essayez un autre modèle.');
    }
  }
}
