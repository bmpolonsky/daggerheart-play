import { test, expect } from 'vitest';
import { characterRosterPlayerCaption } from '../../src/ui/vtt/playerView/sharedTools/characterRosterPresentation';

test('roster distinguishes assigned players without repeating the character name or guessing assignment', () => {
  expect(characterRosterPlayerCaption('QA — Серафим', ' QA — СЕРАФИМ ')).toBeUndefined();
  expect(characterRosterPlayerCaption('QA — Серафим', 'Ольга')).toBe('Игрок: Ольга');
  expect(characterRosterPlayerCaption('QA — Серафим', null)).toBe('Игрок не назначен');
  expect(characterRosterPlayerCaption('QA — Серафим', '')).toBe('Игрок без имени');
});
