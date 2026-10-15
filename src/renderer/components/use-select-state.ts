import { useState } from 'react';
import { opensUpward, selectedIndex, type SelectOption } from './select-options';

/** What the open list remembers: the search, the highlighted option and where it unfolds. */
export function useSelectState() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [upward, setUpward] = useState(false);

  function show(options: readonly SelectOption[], value: string, trigger: HTMLElement | null) {
    setQuery('');
    setUpward(opensUpward(trigger));
    setActive(selectedIndex(options, value));
    setOpen(true);
  }

  function search(text: string) {
    setQuery(text);
    setActive(0);
  }

  return { open, setOpen, query, active, setActive, upward, show, search };
}
