import { useRef, useState } from 'react';
import type { IslandReadyState, IslandRequest, IslandScreen } from '../../shared/island';
import { useReadyEscape } from './use-ready-escape';
import type { ReadyStart } from './use-ready-start';
import { useScreenPicker } from './use-screen-picker';

/**
 * The screen the picker checked last, until main's state names another one: a start sent
 * before main has answered the pick records the screen the person sees checked.
 */
export function usePickedScreen(ready: IslandReadyState) {
  const [picked, setPicked] = useState<string | null>(null);
  const [named, setNamed] = useState(ready.screen?.id);
  if (named !== ready.screen?.id) {
    setNamed(ready.screen?.id);
    setPicked(null);
  }
  const screen: IslandScreen | null =
    ready.screens.find((item) => item.id === picked) ?? ready.screen;
  return { screen, pick: setPicked };
}

interface ReadyPickerOptions {
  ready: IslandReadyState;
  start: ReadyStart;
  screen: IslandScreen | null;
  pick(screenId: string): void;
  /** Open and not handing over to the recording. */
  reachable: boolean;
  onRequest(request: IslandRequest): void;
}

/** The ready island's picker, its keyboard and the button that opens it. */
export function useReadyPicker({
  ready,
  start,
  screen,
  pick,
  reachable,
  onRequest,
}: ReadyPickerOptions) {
  const change = useRef<HTMLButtonElement>(null);
  // A start closes the picker, as does the island folding or a screen going.
  const picker = useScreenPicker({
    active: reachable && !start.busy && ready.screens.length >= 2,
    current: screen?.id ?? null,
    onPick: (screenId) => {
      pick(screenId);
      start.request({ type: 'select-screen', screenId });
    },
  });
  useReadyEscape({
    active: reachable,
    pickerOpen: picker.open,
    closePicker: picker.close,
    onRequest,
    trigger: change,
  });
  return { picker, change };
}
