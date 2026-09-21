import type { MediaFiles } from '../backend/infrastructure/media-files';
import type { MeetingService } from '../backend/application/meetings';
import { idSchema } from '../shared/validation';
import { rangeResponse } from './range-response';

interface MediaAsset {
  path: string;
  contentType: string;
}

function resolveAsset(url: URL, media: MediaFiles, meetings: MeetingService): MediaAsset | null {
  const parts = url.pathname.split('/');
  const id = idSchema.parse(parts[1]);
  if (url.hostname !== 'local') return null;
  const meeting = meetings.get(id);
  if (parts[2] === 'video' && parts.length === 3 && meeting.hasVideo) {
    return { path: media.videoPath(id), contentType: 'video/webm' };
  }
  if (parts[2] !== 'audio' || parts.length !== 4 || !/^\d+$/.test(parts[3] ?? '')) return null;
  const index = Number(parts[3]);
  if (!meeting.audioChunks.some((chunk) => chunk.index === index)) return null;
  return { path: media.audioPath(id, index), contentType: 'audio/webm' };
}

export async function serveMedia(
  request: Request,
  media: MediaFiles,
  meetings: MeetingService,
): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  try {
    const asset = resolveAsset(new URL(request.url), media, meetings);
    if (!asset) return new Response(null, { status: 404 });
    return await rangeResponse(request, asset.path, asset.contentType);
  } catch {
    return new Response(null, { status: 404 });
  }
}
