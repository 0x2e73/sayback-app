import { LIVE_SAMPLE_RATE } from '../../shared/live';

/** Every length is counted in 20 ms frames. Starting values, tuned on a real meeting (P3). */
export interface SegmenterConfig {
  frameSamples: number;
  /** Root mean square on a 0 to 1 scale above which a frame is speech. */
  speechRms: number;
  /** Consecutive speech frames that open an utterance. */
  openFrames: number;
  /** Frames kept before the first speech frame, so no word starts cut. */
  preRollFrames: number;
  /** Consecutive silent frames that close an utterance. */
  closeFrames: number;
  /** Silent frames kept after the last speech frame. */
  tailFrames: number;
  /** Below this much speech an utterance is noise and dropped. */
  minSpeechFrames: number;
  maxFrames: number;
  /** A capped utterance is cut at the quietest frame of this many last frames. */
  cutSearchFrames: number;
  partialEveryFrames: number;
}

export const DEFAULT_SEGMENTER: SegmenterConfig = {
  frameSamples: 320,
  speechRms: 0.015,
  openFrames: 3,
  preRollFrames: 10,
  closeFrames: 30,
  tailFrames: 10,
  minSpeechFrames: 15,
  maxFrames: 750,
  cutSearchFrames: 150,
  partialEveryFrames: 100,
};

interface Frame {
  samples: Int16Array;
  energy: number;
  speech: boolean;
}

interface OpenUtterance {
  id: number;
  /** Track frame where the utterance starts. */
  startFrame: number;
  frames: readonly Frame[];
  speechFrames: number;
  silentRun: number;
  /** Index in `frames` of the last speech frame, -1 without any. */
  lastSpeech: number;
  /** Length of `frames` at the last partial. */
  partialAt: number;
  partialSent: boolean;
}

export interface SegmenterState {
  /** Frames consumed: the clock of the track, pauses excluded. */
  frameIndex: number;
  /** Samples short of a whole frame, waiting for the next block. */
  remainder: Int16Array;
  /** While closed: the last frames, pre-roll of the next utterance. */
  recent: readonly Frame[];
  speechRun: number;
  open: OpenUtterance | null;
  nextId: number;
}

/** The audio of one utterance; times in seconds of the track. */
export interface UtteranceAudio {
  id: number;
  start: number;
  end: number;
  samples: Int16Array;
}

/** `partial`: the open utterance so far, decoded again; `final`: closed, decoded once more. */
export type SegmenterEvent = { kind: 'partial' | 'final' } & UtteranceAudio;

export interface SegmenterStep {
  state: SegmenterState;
  events: SegmenterEvent[];
}

export function initialSegmenter(): SegmenterState {
  return {
    frameIndex: 0,
    remainder: new Int16Array(0),
    recent: [],
    speechRun: 0,
    open: null,
    nextId: 0,
  };
}

function rms(samples: Int16Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length) / 32_768;
}

function toFrame(samples: Int16Array, config: SegmenterConfig): Frame {
  const energy = rms(samples);
  return { samples, energy, speech: energy >= config.speechRms };
}

function joined(frames: readonly Frame[]): Int16Array {
  const total = new Int16Array(frames.reduce((length, frame) => length + frame.samples.length, 0));
  let offset = 0;
  for (const frame of frames) {
    total.set(frame.samples, offset);
    offset += frame.samples.length;
  }
  return total;
}

function audioOf(
  open: OpenUtterance,
  frames: readonly Frame[],
  config: SegmenterConfig,
): UtteranceAudio {
  const seconds = (frame: number) => (frame * config.frameSamples) / LIVE_SAMPLE_RATE;
  return {
    id: open.id,
    start: seconds(open.startFrame),
    end: seconds(open.startFrame + frames.length),
    samples: joined(frames),
  };
}

function lastSpeechIn(frames: readonly Frame[]): number {
  return frames.findLastIndex((frame) => frame.speech);
}

function opened(id: number, startFrame: number, frames: readonly Frame[]): OpenUtterance {
  const lastSpeech = lastSpeechIn(frames);
  return {
    id,
    startFrame,
    frames,
    speechFrames: frames.filter((frame) => frame.speech).length,
    silentRun: frames.length - 1 - lastSpeech,
    lastSpeech,
    partialAt: 0,
    partialSent: false,
  };
}

// A draft already shown is always closed by a final, even when it turns out to be noise.
function closing(open: OpenUtterance, config: SegmenterConfig): SegmenterEvent[] {
  if (open.speechFrames < config.minSpeechFrames && !open.partialSent) return [];
  const end = Math.min(open.lastSpeech + 1 + config.tailFrames, open.frames.length);
  return [{ kind: 'final', ...audioOf(open, open.frames.slice(0, end), config) }];
}

/** The quietest frame of the search window, the latest on a tie. */
function quietestCut(frames: readonly Frame[], config: SegmenterConfig): number {
  // The head keeps at least one frame.
  const from = Math.max(1, frames.length - config.cutSearchFrames);
  let cut = frames.length - 1;
  for (let index = cut; index >= from; index -= 1) {
    if (frames[index]!.energy < frames[cut]!.energy) cut = index;
  }
  return cut;
}

function stepClosed(state: SegmenterState, frame: Frame, config: SegmenterConfig): void {
  state.recent = [...state.recent, frame].slice(-(config.preRollFrames + config.openFrames));
  state.speechRun = frame.speech ? state.speechRun + 1 : 0;
  if (state.speechRun < config.openFrames) return;
  const startFrame = state.frameIndex + 1 - state.recent.length;
  state.open = opened(state.nextId, startFrame, state.recent);
  state.nextId += 1;
  state.recent = [];
  state.speechRun = 0;
}

function grown(open: OpenUtterance, frame: Frame): OpenUtterance {
  const frames = [...open.frames, frame];
  if (!frame.speech) return { ...open, frames, silentRun: open.silentRun + 1 };
  const speechFrames = open.speechFrames + 1;
  return { ...open, frames, speechFrames, silentRun: 0, lastSpeech: frames.length - 1 };
}

function stepOpen(state: SegmenterState, frame: Frame, config: SegmenterConfig): SegmenterEvent[] {
  const open = grown(state.open!, frame);
  state.open = open;
  if (open.silentRun >= config.closeFrames) {
    state.open = null;
    state.recent = open.frames.slice(-(config.preRollFrames + config.openFrames));
    return closing(open, config);
  }
  if (open.frames.length >= config.maxFrames) {
    const cut = quietestCut(open.frames, config);
    const head = opened(open.id, open.startFrame, open.frames.slice(0, cut));
    state.open = opened(state.nextId, open.startFrame + cut, open.frames.slice(cut));
    state.nextId += 1;
    return closing({ ...head, partialSent: open.partialSent }, config);
  }
  const due = open.frames.length - open.partialAt >= config.partialEveryFrames;
  if (!due || open.speechFrames < config.minSpeechFrames) return [];
  state.open = { ...open, partialAt: open.frames.length, partialSent: true };
  return [{ kind: 'partial', ...audioOf(open, open.frames, config) }];
}

/** Feeds samples of one track. Pure: neither the state nor the samples are modified. */
export function segment(
  previous: SegmenterState,
  samples: Int16Array,
  config: SegmenterConfig = DEFAULT_SEGMENTER,
): SegmenterStep {
  const state: SegmenterState = { ...previous };
  const pending = new Int16Array(previous.remainder.length + samples.length);
  pending.set(previous.remainder);
  pending.set(samples, previous.remainder.length);
  const events: SegmenterEvent[] = [];
  let offset = 0;
  for (; offset + config.frameSamples <= pending.length; offset += config.frameSamples) {
    const frame = toFrame(pending.slice(offset, offset + config.frameSamples), config);
    if (state.open) events.push(...stepOpen(state, frame, config));
    else stepClosed(state, frame, config);
    state.frameIndex += 1;
  }
  state.remainder = pending.slice(offset);
  return { state, events };
}

/** On pause or stop: the open utterance is closed and the audio is no longer continuous. */
export function flushSegmenter(
  previous: SegmenterState,
  config: SegmenterConfig = DEFAULT_SEGMENTER,
): SegmenterStep {
  const events = previous.open ? closing(previous.open, config) : [];
  const state: SegmenterState = {
    ...initialSegmenter(),
    frameIndex: previous.frameIndex,
    nextId: previous.nextId,
  };
  return { state, events };
}
