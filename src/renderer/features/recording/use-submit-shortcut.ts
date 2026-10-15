import { useEffect } from 'react';

/** Cmd+Enter (Ctrl+Enter elsewhere) submits the form, wherever the focus is in the dialog. */
export function useSubmitShortcut(formId: string): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
      const form = document.getElementById(formId);
      if (!(form instanceof HTMLFormElement)) return;
      event.preventDefault();
      form.requestSubmit();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [formId]);
}
