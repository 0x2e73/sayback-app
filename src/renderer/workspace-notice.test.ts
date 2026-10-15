import { expect, it } from 'vitest';
import { LIST_ERROR, workspaceNotice } from './workspace-notice';

const none = { recording: '', analysis: '', library: '', folders: '', rowMenu: '', update: '' };

it.each([
  ['nothing when all is well', none, null],
  [
    'the recording failure first',
    { ...none, recording: 'Micro perdu', library: 'x' },
    { message: 'Micro perdu', retryList: false },
  ],
  [
    'the analysis failure next',
    { ...none, analysis: 'Clé refusée', folders: 'y' },
    { message: 'Clé refusée', retryList: false },
  ],
  [
    'a fixed sentence and a retry for the list',
    { ...none, library: 'SQLITE_BUSY', folders: 'y' },
    { message: LIST_ERROR, retryList: true },
  ],
  [
    'the folder failure last, without retry',
    { ...none, folders: 'Nom déjà pris' },
    { message: 'Nom déjà pris', retryList: false },
  ],
  [
    'the update failure after the others',
    { ...none, update: 'Le paquet est introuvable.' },
    { message: 'Le paquet est introuvable.', retryList: false },
  ],
])('shows %s', (_case, errors, expected) => {
  expect(workspaceNotice(errors)).toEqual(expected);
});
