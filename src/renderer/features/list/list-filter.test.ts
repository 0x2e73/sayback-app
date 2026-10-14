import { describe, expect, it } from 'vitest';
import type { Folder, Notes } from '../../../shared/contracts';
import {
  ALL_MEETINGS,
  UNFILED,
  emptyList,
  filterMeetings,
  normalizeSearch,
  resolveScope,
  type FolderScope,
} from './list-filter';

const notes = (summary: string): Notes => ({
  summary,
  keyPoints: [],
  decisions: [],
  actions: [],
  questions: [],
});
const meetings = [
  {
    id: 'm1',
    title: 'Revue produit',
    folderId: 'acme',
    notes: notes('Budget validé pour l’équipe.'),
  },
  { id: 'm2', title: 'Point hebdo', folderId: null, notes: null },
  { id: 'm3', title: 'Équipe Acme', folderId: 'acme', notes: null },
  { id: 'm4', title: 'Cœur de cible', folderId: 'interne', notes: null },
];
const folders: Folder[] = [
  { id: 'acme', name: 'Acme', createdAt: '' },
  { id: 'interne', name: 'Interne', createdAt: '' },
];
const acme: FolderScope = { kind: 'folder', id: 'acme' };
const ids = (scope: FolderScope, query: string) =>
  filterMeetings(meetings, scope, query).map((meeting) => meeting.id);

describe('normalizeSearch', () => {
  it.each([
    ['Équipe', 'equipe'],
    ['ÉQUIPE PRODUIT', 'equipe produit'],
    ['Cœur du sujet', 'coeur du sujet'],
    ['ŒUVRE Ægis', 'oeuvre aegis'],
    ['  revue   produit ', 'revue produit'],
    ['', ''],
    ['   ', ''],
    ['Naïve façade', 'naive facade'],
    ['Zürich', 'zurich'],
    ['e\u0301quipe', 'equipe'],
    ['Revue\nproduit\t2026', 'revue produit 2026'],
    ['Point d’équipe', "point d'equipe"],
    ['d‘équipe d\u02bcéquipe d`équipe d´équipe', "d'equipe d'equipe d'equipe d'equipe"],
    ['Straße', 'strasse'],
    ['Søren', 'soren'],
    ['Kick-off Kick\u2011off Kick–off', 'kick off kick off kick off'],
    ['ﬁnal', 'final'],
    ['Rendez-vous\ufe0f', 'rendez vous'],
  ])('%j reads as %j', (text, expected) => {
    expect(normalizeSearch(text)).toBe(expected);
  });
});

describe('filterMeetings', () => {
  it.each<[string, FolderScope, string, string[]]>([
    ['everything with no query', ALL_MEETINGS, '', ['m1', 'm2', 'm3', 'm4']],
    ['a blank query as no query', ALL_MEETINGS, '   ', ['m1', 'm2', 'm3', 'm4']],
    ['title and summary, without accents', ALL_MEETINGS, 'equipe', ['m1', 'm3']],
    ['the summary, case and accents ignored', ALL_MEETINGS, 'BUDGET VALIDE', ['m1']],
    ['a ligature typed as two letters', ALL_MEETINGS, 'coeur', ['m4']],
    ['inside the current folder only', acme, 'hebdo', []],
    ['the meetings without a folder', UNFILED, '', ['m2']],
    ['a folder and a query together', acme, 'acme', ['m3']],
    ['nothing for an unknown word', ALL_MEETINGS, 'zzz', []],
  ])('finds %s', (_case, scope, query, expected) => {
    expect(ids(scope, query)).toEqual(expected);
  });

  it.each<[string, string, string[]]>([
    ['an apostrophe typed straight', "d'equipe", ['m5']],
    ['a word with ß typed as ss', 'strasse', ['m6']],
    ['a hyphenated word typed with a space', 'kick off', ['m7']],
    ['a hyphen typed for a space', 'point-hebdo', ['m2']],
  ])('finds %s', (_case, query, expected) => {
    const more = [
      ...meetings,
      { id: 'm5', title: 'Point d’équipe', folderId: null, notes: null },
      { id: 'm6', title: 'Rue de la Straße', folderId: null, notes: null },
      { id: 'm7', title: 'Kick-off', folderId: null, notes: null },
    ];
    expect(filterMeetings(more, ALL_MEETINGS, query).map((meeting) => meeting.id)).toEqual(
      expected,
    );
  });

  it('does not match a phrase that straddles the title and the summary', () => {
    const straddling = [{ id: 'x', title: 'Revue', folderId: null, notes: notes('Budget validé') }];
    expect(filterMeetings(straddling, ALL_MEETINGS, 'revue budget')).toEqual([]);
    expect(filterMeetings(straddling, ALL_MEETINGS, 'revue')).toHaveLength(1);
    expect(filterMeetings(straddling, ALL_MEETINGS, 'budget')).toHaveLength(1);
  });

  it('returns nothing from an empty list', () => {
    expect(filterMeetings([], ALL_MEETINGS, 'revue')).toEqual([]);
  });
});

describe('resolveScope', () => {
  it.each<[string, FolderScope, FolderScope]>([
    ['keeps an existing folder', acme, acme],
    [
      'falls back to every meeting when the folder is gone',
      { kind: 'folder', id: 'gone' },
      ALL_MEETINGS,
    ],
    ['keeps « Sans dossier »', UNFILED, UNFILED],
    ['keeps « Tous »', ALL_MEETINGS, ALL_MEETINGS],
  ])('%s', (_case, scope, expected) => {
    expect(resolveScope(scope, folders)).toEqual(expected);
  });
});

describe('emptyList', () => {
  it.each<[string, number, FolderScope, string, string, boolean]>([
    ['no meeting at all', 0, ALL_MEETINGS, 'Budget', 'Aucune réunion', false],
    [
      'a search over everything',
      4,
      ALL_MEETINGS,
      'Budget',
      'Aucune réunion pour « Budget »',
      false,
    ],
    ['a search inside a folder', 4, acme, 'Budget', 'Aucune réunion pour « Budget »', true],
    ['a search without a folder', 4, UNFILED, 'Budget', 'Aucune réunion pour « Budget »', true],
    [
      'a query with stray spaces',
      4,
      ALL_MEETINGS,
      '  budget   annuel ',
      'Aucune réunion pour « budget annuel »',
      false,
    ],
    ['an empty folder', 4, acme, '', 'Aucune réunion dans « Acme »', false],
    ['nothing without a folder', 4, UNFILED, ' ', 'Aucune réunion sans dossier', false],
    ['a folder deleted meanwhile', 4, { kind: 'folder', id: 'gone' }, '', 'Aucune réunion', false],
  ])('says so for %s', (_case, total, scope, query, message, searchEverywhere) => {
    expect(emptyList({ total, scope, query, folders })).toEqual({ message, searchEverywhere });
  });
});
