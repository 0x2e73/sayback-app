import type { Meeting } from '../../../shared/contracts';

export interface DetailNotice {
  key: 'action' | 'analysis' | 'meeting';
  tone: 'danger' | 'warning';
  message: string;
  detail: string | null;
  retry: boolean;
}

export function detailNotices(
  meeting: Pick<Meeting, 'status' | 'error'>,
  actionError: string,
  analyzing: boolean,
): DetailNotice[] {
  const failed = meeting.status === 'error' && !analyzing;
  const notices: DetailNotice[] = [];
  // A failed retry reports its reason twice: from the call and on the restored meeting.
  if (actionError && !(failed && actionError === meeting.error)) {
    notices.push({
      key: 'action',
      tone: 'danger',
      message: actionError,
      detail: null,
      retry: false,
    });
  }
  if (failed) {
    notices.push({
      key: 'analysis',
      tone: 'warning',
      message: 'L’analyse n’a pas abouti.',
      detail: meeting.error,
      retry: true,
    });
  } else if (meeting.error && !analyzing) {
    notices.push({
      key: 'meeting',
      tone: 'warning',
      message: meeting.error,
      detail: null,
      retry: false,
    });
  }
  return notices;
}
