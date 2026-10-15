export type WindowRole = 'main' | 'island';

/** What an IPC event says about who sent it. */
export interface IpcSender {
  sender: unknown;
  senderFrame: unknown;
}

interface RoleWindow {
  isDestroyed(): boolean;
  webContents: { mainFrame: unknown };
}

export interface WindowRoles {
  /** True when the event comes from the top frame of a live window holding one of these roles. */
  allows(event: IpcSender, roles: readonly WindowRole[]): boolean;
}

function holds(window: RoleWindow | null, event: IpcSender): boolean {
  if (!window || window.isDestroyed()) return false;
  const contents = window.webContents;
  return event.sender === contents && event.senderFrame === contents.mainFrame;
}

// A getter returns null once its window is closed; a destroyed or unreadable one refuses too.
export function createWindowRoles(
  windows: Record<WindowRole, () => RoleWindow | null>,
): WindowRoles {
  return {
    allows(event, roles) {
      return roles.some((role) => {
        try {
          return holds(windows[role](), event);
        } catch {
          return false;
        }
      });
    },
  };
}
