import { Button, Notice } from '../../components/ui';
import type { DetailNotice } from './detail-notices';

interface DetailNoticesProps {
  notices: DetailNotice[];
  canRetry: boolean;
  onRetry(): void;
}

interface NoticeDetailProps {
  notice: DetailNotice;
  canRetry: boolean;
}

function NoticeDetail({ notice, canRetry }: NoticeDetailProps) {
  return (
    <>
      {notice.detail && <span className="notice-detail">{notice.detail}</span>}
      {notice.retry && !canRetry && (
        <span className="notice-detail">Aucun audio n’a été enregistré.</span>
      )}
    </>
  );
}

export function DetailNotices({ notices, canRetry, onRetry }: DetailNoticesProps) {
  if (!notices.length) return null;
  return (
    <div className="detail-notices">
      {notices.map((notice) => (
        <Notice
          key={notice.key}
          tone={notice.tone}
          action={
            notice.retry ? (
              <Button variant="secondary" disabled={!canRetry} onClick={onRetry}>
                Réessayer l’analyse
              </Button>
            ) : undefined
          }
        >
          {notice.message}
          <NoticeDetail notice={notice} canRetry={canRetry} />
        </Notice>
      ))}
    </div>
  );
}
