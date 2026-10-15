import { useState } from 'react';

/** True once the value differs from the one the component first rendered with. */
export function useChanged<T>(value: T): boolean {
  const [first] = useState(value);
  return value !== first;
}
