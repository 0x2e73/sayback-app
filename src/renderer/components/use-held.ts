import { useState } from 'react';

/** The last non-null value: what an exit transition keeps showing after the owner let go. */
export function useHeld<T>(value: T | null): T | null {
  const [held, setHeld] = useState(value);
  if (value !== null && value !== held) setHeld(value);
  return value ?? held;
}
