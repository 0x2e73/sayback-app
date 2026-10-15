import { useRef } from 'react';
import type { DesktopApi } from '../../../shared/contracts';
import { Button, Dialog, Notice } from '../../components/ui';
import { AnalysisOption } from './AnalysisOption';
import { MeetingSource } from './MeetingSource';
import { SourceChips } from './SourceChips';
import { SourceNotices } from './SourceNotices';
import { useNewMeeting, type StartMeeting } from './use-new-meeting';
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

export function NewMeetingDialog({ api, onClose, onStart, onConfigure }: NewMeetingDialogProps) {
  const form = useNewMeeting(api, onStart);
  const panel = useSourcePanel();
  const titleField = useRef<HTMLInputElement>(null);
  useSubmitShortcut(FORM_ID);

  return (
    <Dialog
      title="Nouvelle réunion"
      busy={form.busy}
      initialFocus={titleField}
      onEscape={panel.escape}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" disabled={form.busy} onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form={FORM_ID} busy={form.busy} disabled={!form.canStart}>
            Démarrer l’enregistrement
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(event) => void form.submit(event)}>
        <fieldset className="new-meeting-form" disabled={form.busy}>
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
            onToggle={form.toggle}
          />
          <SourceNotices
            screenBlocked={form.screenBlocked}
            microphoneBlocked={form.microphoneBlocked}
            noAudio={form.ready && !form.hasAudio}
            onOpenSettings={(kind) => void form.openSettings(kind)}
            onWithoutScreen={form.withoutScreen}
          />
          <MeetingSource
            screen={form.selection.screen}
            sources={form.sources}
            source={form.source}
            sourceId={form.sourceId}
            panel={panel}
            onSource={form.chooseSource}
            onReload={form.reloadSources}
            onWithoutScreen={form.withoutScreen}
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
