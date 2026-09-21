import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

interface ByteRange {
  start: number;
  end: number;
}

function parseRange(header: string | null, size: number): ByteRange | null {
  if (size === 0) return null;
  if (!header) return { start: 0, end: size - 1 };
  const match = /^bytes=(\d+)-(\d*)$/.exec(header);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) return null;
  return { start, end };
}

export async function rangeResponse(request: Request, path: string, contentType: string) {
  const { size } = await stat(path);
  const requestedRange = request.headers.get('range');
  const range = parseRange(requestedRange, size);
  if (!range) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(range.end - range.start + 1),
    'Cache-Control': 'no-store',
  };
  if (requestedRange) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
  const status = requestedRange ? 206 : 200;
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  const stream = Readable.toWeb(createReadStream(path, range)) as ReadableStream<Uint8Array>;
  return new Response(stream, { status, headers });
}
