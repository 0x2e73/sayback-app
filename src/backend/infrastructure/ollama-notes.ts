import type { Meeting, NoteItem, Notes } from '../../shared/contracts';
import type { AiMedia } from './openai-intelligence';
import { groundedNotes, parseGroundedNotes, UngroundedNotesError } from './notes-context';
import { mergeFormat, sliceFormat } from './notes-format';
import { concatenateItems } from './notes-lists';
import {
  type Condensed,
  citedIds,
  condensed,
  groundedCondensed,
  groupPartials,
  partialInstruction,
  reduceContext,
  reduceInstruction,
  sliceInstruction,
} from './notes-reduce';
import { type NotesSlice, planSlices, sliceContext, sliceSourceIds } from './notes-slicing';
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
 * a longer one is read slice by slice (map). Decisions and actions of the slices are concatenated by
 * code; only summary, key points and questions are merged by the model (reduce).
 */
export class OllamaNotes {
  private readonly client: OllamaClient;

  constructor(
    private readonly model: () => string,
    private readonly media: AiMedia,
    request: typeof fetch = fetch,
    private readonly warn: (message: string) => void = console.warn,
  ) {
    this.client = new OllamaClient(request);
  }

  async summarize(meeting: Meeting): Promise<Notes> {
    const model = this.model();
    await this.client.verifyLocalModel(model, meeting.frames.length > 0);
    const slices = planSlices(meeting, estimateTokens(partialInstruction));
    const [only] = slices;
    if (only && slices.length === 1) {
      const text = await this.ask(model, meeting, only, sliceInstruction);
      return readable(() => parseGroundedNotes(text, meeting));
    }
    const partials: Notes[] = [];
    for (const slice of slices) {
      const sources = new Set(sliceSourceIds(slice));
      const text = await this.ask(model, meeting, slice, partialInstruction);
      partials.push(readable(() => groundedNotes(text, sources)));
    }
    const merged = await this.reduce(model, meeting, partials.map(condensed));
    const notes: Notes = {
      ...merged,
      decisions: this.concatenated(
        'decisions',
        partials.map((partial) => partial.decisions),
      ),
      actions: this.concatenated(
        'actions',
        partials.map((partial) => partial.actions),
      ),
    };
    return readable(() => parseGroundedNotes(JSON.stringify(notes), meeting));
  }

  // Count only, never text: the in-app hint about a cut list is a separate ticket (SAY-8).
  private concatenated(list: string, lists: NoteItem[][]): NoteItem[] {
    return concatenateItems(lists, (dropped) =>
      this.warn(`[ollama-notes] ${list} cut at the contract maximum: ${dropped} dropped`),
    );
  }

  private async reduce(model: string, meeting: Meeting, partials: Condensed[]): Promise<Condensed> {
    let level = partials;
    for (let round = 0; round < MAX_REDUCE_ROUNDS; round += 1) {
      const groups = groupPartials(meeting.title, level);
      const [last] = groups;
      if (last && groups.length === 1) return this.merge(model, meeting, last);
      const merged: Condensed[] = [];
      for (const group of groups) {
        const [alone] = group;
        merged.push(alone && group.length === 1 ? alone : await this.merge(model, meeting, group));
      }
      level = merged;
    }
    throw new Error(
      'Cette réunion est trop longue pour ce modèle Ollama. Choisissez un modèle ou un fournisseur à plus grande capacité.',
    );
  }

  // Grounded on the ids the group cites, not the whole meeting: the merge never saw the transcript.
  private async merge(model: string, meeting: Meeting, group: Condensed[]): Promise<Condensed> {
    const sources = citedIds(group);
    const text = await this.client.chat({
      model,
      system: reduceInstruction,
      user: reduceContext(meeting.title, group),
      images: [],
      format: mergeFormat([...sources]),
    });
    return readable(() => groundedCondensed(text, sources));
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
    const ids = sliceSourceIds(slice);
    return this.client.chat({
      model,
      system,
      user: sliceContext(meeting.title, slice),
      images,
      format: sliceFormat(ids.length ? ids : undefined),
    });
  }
}
