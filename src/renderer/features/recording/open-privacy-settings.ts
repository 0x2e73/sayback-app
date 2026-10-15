import { unwrap, type CapturePermissionKind, type DesktopApi } from '../../../shared/contracts';

/** Opens the macOS pane that holds the right; throws with the reason when it cannot. */
export async function openPrivacySettings(
  api: DesktopApi,
  kind: CapturePermissionKind,
): Promise<void> {
  unwrap(
    await (kind === 'screen' ? api.openScreenRecordingSettings() : api.openMicrophoneSettings()),
  );
}
