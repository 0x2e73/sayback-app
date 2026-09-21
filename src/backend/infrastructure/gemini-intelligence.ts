import { z } from 'zod';
import type { AudioChunk, Meeting, Notes, Segment } from '../../shared/contracts';
import type { AiMedia } from './openai-intelligence';
import {
  meetingContext,
  notesInstruction,
  parseGroundedNotes,
  selectedFrames,
  UngroundedNotesError,
} from './notes-context';

const responseSchema = z.object({
  candidates: z.array(
    z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }) }),
  ),
});
const segmentsSchema = z.object({
  segments: z.array(
    z.object({ start: z.number().min(0), end: z.number().min(0), text: z.string() }),
  ),
});

export class GeminiIntelligence {
  constructor(
    private readonly key: () => string,
    private readonly model: () => string,
    private readonly media: AiMedia,
    private readonly request: typeof fetch = fetch,
  ) {}

  async transcribe(meetingId: string, chunk: AudioChunk): Promise<Segment[]> {
    const audio = await this.media.readAudio(meetingId, chunk.index);
    const prompt =
      'Transcris fidèlement cet audio. Réponds uniquement en JSON : {"segments":[{"start":0,"end":1,"text":"..."}]}. start et end sont les secondes relatives au début de cet extrait. Conserve la langue parlée et tous les passages audibles. Ne devine pas les mots inaudibles.';
    const text = await this.generate('gemini-2.5-flash', [
      { text: prompt },
      { inlineData: { mimeType: 'audio/webm', data: audio.toString('base64') } },
    ]);
    let parsed: z.infer<typeof segmentsSchema>;
    try {
      parsed = segmentsSchema.parse(JSON.parse(text));
    } catch {
      throw new Error('Transcription Gemini incomplète. Relancez l’analyse.');
    }
    return parsed.segments
      .filter((part) => part.text.trim() && part.start < chunk.duration)
      .map((part, index) => ({
        id: `${chunk.index}-${index}`,
        start: chunk.start + part.start,
        end: chunk.start + Math.min(chunk.duration, Math.max(part.start, part.end)),
        text: part.text.trim(),
      }));
  }

  async summarize(meeting: Meeting): Promise<Notes> {
    const parts: Array<Record<string, unknown>> = [
      { text: notesInstruction },
      { text: meetingContext(meeting) },
    ];
    for (const frame of selectedFrames(meeting)) {
      parts.push({ text: `Écran à ${frame.at.toFixed(1)} secondes.` });
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: (await this.media.readFrame(meeting.id, frame.index)).toString('base64'),
        },
      });
    }
    const text = await this.generate(this.model(), parts);
    try {
      return parseGroundedNotes(text, meeting);
    } catch (error) {
      if (error instanceof UngroundedNotesError) throw error;
      throw new Error('Réponse Gemini incomplète. Essayez un autre modèle.');
    }
  }

  private async generate(model: string, parts: Array<Record<string, unknown>>): Promise<string> {
    let response: Response;
    try {
      response = await this.request(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.key() },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(180_000),
        },
      );
    } catch {
      throw new Error('Gemini est inaccessible. Votre enregistrement est conservé.');
    }
    if (response.status === 400 || response.status === 413)
      throw new Error(
        'Gemini a refusé ce modèle ou cet extrait audio. Vérifiez le modèle et réessayez.',
      );
    if (response.status === 401 || response.status === 403)
      throw new Error('Clé Gemini invalide ou accès refusé.');
    if (response.status === 429) throw new Error('Quota Gemini atteint. Réessayez plus tard.');
    if (!response.ok)
      throw new Error('Gemini est indisponible. Votre enregistrement est conservé.');
    try {
      const result = responseSchema.parse(await response.json());
      const text = result.candidates[0]?.content.parts.map((part) => part.text ?? '').join('');
      if (!text) throw new Error('Réponse vide.');
      return text;
    } catch {
      throw new Error('Réponse Gemini illisible. Relancez l’analyse.');
    }
  }
}
