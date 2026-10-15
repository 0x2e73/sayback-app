import { z } from 'zod';
import type { MediaUpload } from './contracts';

export const idSchema = z.string().uuid();
export const titleSchema = z.string().trim().min(1, 'Donnez un titre à cette réunion.').max(160);
export const folderNameSchema = z.string().trim().min(1, 'Donnez un nom au dossier.').max(80);
export const timeSchema = z.number().finite().min(0).max(7_205);
export const noteItemSchema = z.object({
  text: z.string().min(1).max(4_000),
  sourceIds: z.array(z.string()).min(1).max(20),
});
export const notesSchema = z.object({
  summary: z.string().min(1).max(8_000),
  keyPoints: z.array(noteItemSchema).max(30),
  decisions: z.array(noteItemSchema).max(30),
  actions: z.array(noteItemSchema).max(30),
  questions: z.array(noteItemSchema).max(30),
});
export const clarificationSchema = z.object({
  id: idSchema,
  at: timeSchema,
  text: z.string().trim().min(1).max(2_000),
});
export const appearanceSchema = z.enum(['system', 'light', 'dark']);
export const setupGuideSchema = z.enum(['whisper', 'ollama']);
export const settingsSchema = z.object({
  notesProvider: z.enum(['openai', 'anthropic', 'gemini', 'compatible', 'ollama']),
  transcriptionProvider: z.enum(['openai', 'gemini', 'local']),
  openAiKey: z.string().trim().max(512),
  anthropicKey: z.string().trim().max(512),
  geminiKey: z.string().trim().max(512),
  compatibleKey: z.string().trim().max(512),
  compatibleBaseUrl: z.string().trim().max(2048),
  whisperModelPath: z
    .string()
    .trim()
    .max(1_024)
    .refine((value) => !value.includes('\0')),
  model: z
    .string()
    .trim()
    .regex(/^$|^[a-zA-Z0-9._:/-]{1,120}$/),
});
const mediaSchema = z
  .object({
    meetingId: idSchema,
    kind: z.enum(['audio', 'video', 'frame']),
    index: z.number().int().min(0).max(20_000),
    at: timeSchema,
    duration: z.number().finite().min(0).max(180),
    bytes: z
      .instanceof(ArrayBuffer)
      .refine((bytes) => bytes.byteLength > 0 && bytes.byteLength <= 20 * 1024 * 1024),
  })
  .superRefine((value, ctx) => {
    if (
      value.kind === 'frame' &&
      (value.index >= 240 || value.bytes.byteLength > 2 * 1024 * 1024)
    ) {
      ctx.addIssue({ code: 'custom', message: 'Capture trop volumineuse.' });
    }
  });
export function validateMedia(input: unknown): MediaUpload {
  return mediaSchema.parse(input);
}
