import type { Intelligence, MeetingRepository } from './ports';
import type { Meeting } from '../domain/meeting';
import { randomUUID } from 'node:crypto';
import {
  assertDuration,
  assertEditable,
  assertRecording,
  normalizeTitle,
  validateClarification,
} from '../domain/meeting-rules';

export class MeetingService {
  constructor(
    private readonly repository: MeetingRepository,
    private readonly intelligence: Intelligence | (() => Intelligence),
  ) {}
  create(title: string): Meeting {
    if (this.list().some((meeting) => meeting.status === 'recording'))
      throw new Error('Un enregistrement est déjà en cours.');
    const meeting: Meeting = {
      id: randomUUID(),
      title: normalizeTitle(title),
      createdAt: new Date().toISOString(),
      status: 'recording',
      duration: 0,
      hasVideo: false,
      audioChunks: [],
      frames: [],
      transcript: [],
      notes: null,
      clarifications: [],
      error: null,
    };
    this.repository.save(meeting);
    return meeting;
  }
  get(id: string): Meeting {
    const meeting = this.repository.get(id);
    if (!meeting) throw new Error('Réunion introuvable.');
    return meeting;
  }
  list(): Meeting[] {
    return this.repository.list();
  }
  private recording(id: string): Meeting {
    const meeting = this.get(id);
    assertRecording(meeting);
    return meeting;
  }
  finish(id: string, duration: number): Meeting {
    const meeting = this.recording(id);
    assertDuration(duration);
    meeting.duration = duration;
    meeting.status = 'recorded';
    this.repository.save(meeting);
    return meeting;
  }
  addAudio(id: string, index: number, start: number, duration: number): void {
    const meeting = this.recording(id);
    if (meeting.audioChunks.some((chunk) => chunk.index === index))
      throw new Error('Segment audio déjà enregistré.');
    meeting.audioChunks.push({ index, start, duration, transcript: null });
    meeting.duration = Math.max(meeting.duration, start + duration);
    this.repository.save(meeting);
  }
  addFrame(id: string, index: number, at: number): void {
    const meeting = this.recording(id);
    if (!meeting.frames.some((frame) => frame.index === index)) meeting.frames.push({ index, at });
    this.repository.save(meeting);
  }
  markVideo(id: string): void {
    const meeting = this.recording(id);
    if (!meeting.hasVideo) {
      meeting.hasVideo = true;
      this.repository.save(meeting);
    }
  }
  async process(id: string): Promise<Meeting> {
    const meeting = this.get(id);
    if (meeting.status === 'processing') throw new Error('Une analyse est déjà en cours.');
    if (meeting.status === 'recording')
      throw new Error('Terminez l’enregistrement avant de lancer l’analyse.');
    if (!meeting.audioChunks.length) throw new Error('Aucun audio enregistré à analyser.');
    const intelligence =
      typeof this.intelligence === 'function' ? this.intelligence() : this.intelligence;
    meeting.status = 'processing';
    meeting.processingStartedAt = new Date().toISOString();
    meeting.error = null;
    this.repository.save(meeting);
    try {
      const pending = meeting.audioChunks
        .filter((chunk) => chunk.transcript === null)
        .sort((a, b) => a.index - b.index);
      const concurrency = intelligence.transcriptionConcurrency ?? 3;
      for (let index = 0; index < pending.length; index += concurrency) {
        const batch = pending.slice(index, index + concurrency);
        const results = await Promise.allSettled(
          batch.map(async (chunk) => {
            chunk.transcript = await intelligence.transcribe(id, chunk);
            meeting.transcript = meeting.audioChunks.flatMap((item) => item.transcript ?? []);
            this.repository.save(meeting);
          }),
        );
        const failed = results.find((result) => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
      }
      if (!meeting.transcript.length)
        throw new Error('Aucune parole détectée dans cet enregistrement.');
      meeting.notes = await intelligence.summarize(meeting);
      meeting.status = 'ready';
      meeting.processingStartedAt = undefined;
      this.repository.save(meeting);
      return meeting;
    } catch (error) {
      meeting.status = 'error';
      meeting.processingStartedAt = undefined;
      meeting.error = error instanceof Error ? error.message : 'Analyse interrompue.';
      this.repository.save(meeting);
      throw error;
    }
  }
  clarify(id: string, at: number, text: string): Meeting {
    const meeting = this.get(id);
    const normalized = validateClarification(meeting, at, text);
    meeting.clarifications.push({
      id: randomUUID(),
      at,
      text: normalized,
      createdAt: new Date().toISOString(),
    });
    this.repository.save(meeting);
    return meeting;
  }
  delete(id: string): void {
    const meeting = this.get(id);
    assertEditable(meeting);
    this.repository.delete(id);
  }
  recover(): void {
    for (const meeting of this.list()) {
      if (meeting.status !== 'recording' && meeting.status !== 'processing') continue;
      meeting.status = meeting.audioChunks.length ? 'recorded' : 'error';
      meeting.processingStartedAt = undefined;
      meeting.error = 'Session interrompue. Les fichiers sauvegardés sont conservés.';
      this.repository.save(meeting);
    }
  }
}
