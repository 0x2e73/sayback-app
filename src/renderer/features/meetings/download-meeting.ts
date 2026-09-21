import type { Meeting } from '../../../shared/contracts';
import { meetingMarkdown } from './meeting-format';

export function downloadMeeting(meeting: Meeting): void {
  const blob = new Blob([meetingMarkdown(meeting)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const filename = meeting.title.replace(/[^\p{L}\p{N} _-]/gu, '') || 'reunion';
  link.href = url;
  link.download = `${filename}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
