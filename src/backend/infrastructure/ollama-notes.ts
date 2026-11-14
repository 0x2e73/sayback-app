import type { Meeting, Notes } from '../../shared/contracts';
import type { AiMedia } from './openai-intelligence';
import {
  groundedNotes,
  notesInstruction,
  parseGroundedNotes,
  UngroundedNotesError,
} from './notes-context';
import {
  citedIds,
  groupPartials,
  partialInstruction,
  reduceContext,
  reduceInstruction,
} from './notes-reduce';
import { type NotesSlice, planSlices, sliceContext } from './notes-slicing';
import { MAX_REDUCE_ROUNDS, estimateTokens } from './ollama-budget';
import { OllamaClient } from './ollama-client';

// Notes the model wrote but that do not parse: the cause is the answer, not the model's vision.
function readable<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof UngroundedNotesError) throw error;
    throw new Error(
      'Ollama a renvoyé des notes illisibles. Relancez l’analyse ou choisissez un autre modèle.',
    );
  }
}

/**
 * Notes by a local Ollama model whose window is 4096 tokens: a meeting that fits goes in one call,
 * a longer one is read slice by slice (map) and the partial notes are merged (reduce).
 */
export class OllamaNotes {
  private readonly client: OllamaClient;

  constructor(
    private readonly model: () => string,
    private readonly media: AiMedia,
    request: typeof fetch = fetch,
  ) {
    this.client = new OllamaClient(request);
  }

  async summarize(meeting: Meeting): Promise<Notes> {
    const model = this.model();
    await this.client.verifyLocalModel(model, meeting.frames.length > 0);
    const slices = planSlices(meeting, estimateTokens(partialInstruction));
    const [only] = slices;
    if (only && slices.length === 1) {
      const text = await this.ask(model, meeting, only, notesInstruction);
      return readable(() => parseGroundedNotes(text, meeting));
    }
    const partials: Notes[] = [];
    for (const slice of slices) {
      const sources = new Set([
        ...slice.blocks.map((block) => block.id),
        ...slice.clarifications.map((item) => item.id),
      ]);
      const text = await this.ask(model, meeting, slice, partialInstruction);
      partials.push(readable(() => groundedNotes(text, sources)));
    }
    return this.reduce(model, meeting, partials);
  }

  private async reduce(model: string, meeting: Meeting, partials: Notes[]): Promise<Notes> {
    let level = partials;
    for (let round = 0; round < MAX_REDUCE_ROUNDS; round += 1) {
      const groups = groupPartials(meeting.title, level);
      const [last] = groups;
      if (last && groups.length === 1) {
        const text = await this.merge(model, meeting, last);
        return readable(() => parseGroundedNotes(text, meeting));
      }
      const merged: Notes[] = [];
      for (const group of groups) {
        const [alone] = group;
        if (alone && group.length === 1) {
          merged.push(alone);
          continue;
        }
        const text = await this.merge(model, meeting, group);
        merged.push(readable(() => groundedNotes(text, citedIds(group))));
      }
      level = merged;
    }
    throw new Error(
      'Cette réunion est trop longue pour ce modèle Ollama. Choisissez un modèle ou un fournisseur à plus grande capacité.',
    );
  }

  private merge(model: string, meeting: Meeting, group: Notes[]): Promise<string> {
    return this.client.chat({
      model,
      system: reduceInstruction,
      user: reduceContext(meeting.title, group),
      images: [],
    });
  }

  private async ask(
    model: string,
    meeting: Meeting,
    slice: NotesSlice,
    system: string,
  ): Promise<string> {
    const images: Buffer[] = [];
    for (const frame of slice.frames) {
      images.push(await this.media.readFrame(meeting.id, frame.index));
    }
    return this.client.chat({ model, system, user: sliceContext(meeting.title, slice), images });
  }
}
