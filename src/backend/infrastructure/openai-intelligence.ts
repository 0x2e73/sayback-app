import OpenAI, { toFile } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { Intelligence } from '../application/ports';
import type { AudioChunk, Meeting, Notes, Segment } from '../../shared/contracts';
import { notesSchema } from '../../shared/validation';
import {
  meetingContext,
  notesInstruction,
  parseGroundedNotes,
  selectedFrames,
} from './notes-context';

export interface AiMedia {
  readAudio(id: string, index: number): Promise<Buffer>;
  readFrame(id: string, index: number): Promise<Buffer>;
}
export class OpenAiIntelligence implements Intelligence {
  constructor(
    private readonly client: () => OpenAI,
    private readonly media: AiMedia,
    private readonly model: () => string,
  ) {}
  async transcribe(meetingId: string, chunk: AudioChunk): Promise<Segment[]> {
    try {
      const file = await toFile(await this.media.readAudio(meetingId, chunk.index), 'audio.webm', {
        type: 'audio/webm',
      });
      const result = await this.client().audio.transcriptions.create({
        file,
        model: 'gpt-4o-transcribe-diarize',
        response_format: 'diarized_json',
        chunking_strategy: 'auto',
      });
      const parsed = z
        .object({
          segments: z.array(
            z.object({
              start: z.number().min(0),
              end: z.number().min(0),
              text: z.string(),
              speaker: z.string().min(1).max(40),
            }),
          ),
        })
        .parse(result);
      return parsed.segments
        .filter((segment) => segment.text.trim() && segment.start < chunk.duration)
        .map((segment, index) => ({
          id: `${chunk.index}-${index}`,
          start: chunk.start + segment.start,
          end: chunk.start + Math.min(chunk.duration, Math.max(segment.start, segment.end)),
          text: segment.text.trim(),
          speaker: segment.speaker,
        }));
    } catch (error) {
      throw providerError(error);
    }
  }
  async summarize(meeting: Meeting): Promise<Notes> {
    try {
      const selected = selectedFrames(meeting);
      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        {
          type: 'text',
          text: meetingContext(meeting),
        },
      ];
      for (const frame of selected) {
        content.push({ type: 'text', text: `Écran à ${frame.at.toFixed(1)} secondes.` });
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${(await this.media.readFrame(meeting.id, frame.index)).toString('base64')}`,
            detail: 'low',
          },
        });
      }
      const response = await this.client().chat.completions.create({
        model: this.model(),
        response_format: zodResponseFormat(notesSchema, 'meeting_notes'),
        messages: [
          {
            role: 'system',
            content: notesInstruction,
          },
          { role: 'user', content },
        ],
      });
      const text = response.choices[0]?.message.content;
      if (!text) throw new Error('Les notes n’ont pas pu être générées. Réessayez.');
      return parseGroundedNotes(text, meeting);
    } catch (error) {
      throw providerError(error);
    }
  }
}

function providerError(error: unknown): Error {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) return new Error('Clé OpenAI invalide. Vérifiez les paramètres.');
    if (error.status === 429)
      return new Error('Quota OpenAI atteint. Vérifiez vos crédits puis réessayez.');
    return new Error('OpenAI est indisponible. Votre enregistrement est conservé. Réessayez.');
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return new Error('Réponse OpenAI incomplète. Relancez l’analyse.');
  return error instanceof Error ? error : new Error('Analyse interrompue. Réessayez.');
}
