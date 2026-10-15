import type { ReactNode } from 'react';
import { usePresence, type PresenceBinding } from './use-presence';

interface PresenceProps {
  open: boolean;
  children(binding: PresenceBinding): ReactNode;
}

/** Renders its content while open and during the exit transition that follows. */
export function Presence({ open, children }: PresenceProps) {
  const { mounted, state, ref } = usePresence(open);
  if (!mounted) return null;
  return children({ ref, state });
}
