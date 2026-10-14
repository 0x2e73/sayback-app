import { expect, it } from 'vitest';
import { platformOf } from './platform';

it.each([
  ['MacIntel', 'mac'],
  ['MacPPC', 'mac'],
  ['Win32', 'other'],
  ['Linux x86_64', 'other'],
  ['', 'other'],
])('%s is %s', (platform, expected) => {
  expect(platformOf(platform)).toBe(expected);
});
