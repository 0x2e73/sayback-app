import { useEffect, useRef, type RefObject } from 'react';
import type { DesktopApi } from '../../../shared/contracts';
import { Dialog, Notice } from '../../components/ui';
import { AnalysisOption } from './AnalysisOption';
import { MeetingSource } from './MeetingSource';
import { NewMeetingFooter } from './NewMeetingFooter';
import { SourceChips } from './SourceChips';
import { SourceNotices } from './SourceNotices';
import type { StartMeeting } from './start-meeting';
import { useNewMeeting } from './use-new-meeting';
import { useSourcePanel } from './use-source-panel';
import { useSubmitShortcut } from './use-submit-shortcut';

interface NewMeetingDialogProps {
  api: DesktopApi;
  onClose(): void;
  onStart: StartMeeting;
  /** « Configurer » : closes the dialog and opens the settings. */
  onConfigure(): void;
}

const FORM_ID = 'new-meeting';

// The form is disabled until the habits are read, and a disabled field cannot take the focus.
function useFocusWhenReady(ready: boolean, field: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const active = document.activeElement;
    const lost = !active || active === document.body || active.tagName === 'DIALOG';
    if (ready && lost) field.current?.focus();
  }, [ready, field]);
}

export function NewMeetingDialog({ api, onClose, onStart, onConfigure }: NewMeetingDialogProps) {
  const form = useNewMeeting(api, onStart);
  const panel = useSourcePanel();
  const titleField = useRef<HTMLInputElement>(null);
  useSubmitShortcut(FORM_ID);
  useFocusWhenReady(form.ready, titleField);

  // A folded list must not come back open with another list, or with the screen.
  function withoutScreen(): void {
    panel.reset();
    form.withoutScreen();
  }
  function reload(): void {
    panel.reset();
    form.reloadSources();
  }

  return (
    <Dialog
      title="Nouvelle réunion"
      busy={form.busy}
      initialFocus={titleField}
      onEscape={() => panel.escape(form.selection.screen && form.sources.status === 'ready')}
      onClose={onClose}
      footer={
        <NewMeetingFooter
          busy={form.busy}
          canStart={form.canStart}
          formId={FORM_ID}
          onCancel={onClose}
        />
      }
    >
      <form id={FORM_ID} onSubmit={(event) => void form.submit(event)}>
        <fieldset className="new-meeting-form" disabled={form.busy || !form.ready}>
          {form.error && <Notice>{form.error}</Notice>}
          <label className="field">
            Titre
            <input
              ref={titleField}
              maxLength={160}
              value={form.title}
              onChange={(event) => form.setTitle(event.target.value)}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <SourceChips
            selection={form.selection}
            microphoneBlocked={form.microphoneBlocked}
            onToggle={(key) => {
              if (key === 'screen') panel.reset();
              form.toggle(key);
            }}
          />
          <SourceNotices
            screenBlocked={form.screenBlocked}
            microphoneBlocked={form.microphoneBlocked}
            noAudio={form.ready && !form.hasAudio}
            onOpenSettings={(kind) => void form.openSettings(kind)}
            onWithoutScreen={withoutScreen}
          />
          <MeetingSource
            screen={form.selection.screen}
            sources={form.sources}
            source={form.source}
            sourceId={form.sourceId}
            panel={panel}
            onSource={form.chooseSource}
            onReload={reload}
            onWithoutScreen={withoutScreen}
          />
          <AnalysisOption
            settings={form.settings}
            configured={form.analysisReady}
            checked={form.autoAnalyze}
            onChange={form.chooseAnalysis}
            onConfigure={onConfigure}
          />
        </fieldset>
      </form>
    </Dialog>
  );
}
