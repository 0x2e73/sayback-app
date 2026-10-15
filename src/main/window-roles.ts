export type WindowRole = 'main' | 'island';

/** What an IPC event says about who sent it. */
export interface IpcSender {
  sender: unknown;
  senderFrame: unknown;
}

interface RoleWindow {
  webContents: { mainFrame: unknown };
}

export interface WindowRoles {
  /** True when the event comes from the top frame of a window holding one of these roles. */
  allows(event: IpcSender, roles: readonly WindowRole[]): boolean;
}

// A getter returns null once its window is closed or destroyed.
export function createWindowRoles(
  windows: Record<WindowRole, () => RoleWindow | null>,
): WindowRoles {
  return {
    allows(event, roles) {
      return roles.some((role) => {
        const contents = windows[role]()?.webContents;
        return (
          contents !== undefined &&
          event.sender === contents &&
          event.senderFrame === contents.mainFrame
        );
      });
    },
  };
}
