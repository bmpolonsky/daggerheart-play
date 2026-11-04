import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { cleanMarkdownText } from '../../src/core/utils/markdownText';

interface CorpusText {
  key: string;
  value: string;
}

const LINK = /(?<!!)\[([^\]]+)\]\([^)]+\)/g;
const IMAGE = /!\[([^\]]*)\]\([^)]+\)/g;
const HAS_LINK = /(?<!!)\[[^\]]+\]\([^)]+\)/;
const HAS_IMAGE = /!\[[^\]]*\]\([^)]+\)/;

function corpusTexts(): CorpusText[] {
  const directory = fileURLToPath(new URL('../../public/data/', import.meta.url));
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json') && file !== 'manifest.json')
    .sort()
    .flatMap((file) => enumerate(JSON.parse(readFileSync(`${directory}/${file}`, 'utf8')), file));
}

function enumerate(value: unknown, key: string): CorpusText[] {
  if (typeof value === 'string') return HAS_LINK.test(value) || HAS_IMAGE.test(value) ? [{ key, value }] : [];
  if (Array.isArray(value)) return value.flatMap((item, index) => enumerate(item, `${key}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([field, item]) => enumerate(item, `${key}.${field}`));
}

function visibleText(value: string): string {
  return value
    // Quote prefixes are Markdown structure, like emphasis and link targets.
    // Numeric comparisons are rule content and must remain visible.
    .split('\n')
    .map((line) => line.replace(/^[ \t]*(?:>[ \t]*)+(?=[^\s\d=<>+\-])/, ''))
    .join('\n')
    .replace(IMAGE, (_match, alt: string) => alt.trim())
    .replace(LINK, (_match, label: string) => label.trim())
    .replace(/#\{([^}]*)\}#/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+([.,;:!?)}\]])/g, '$1')
    .trim();
}

test('cleans every Markdown link in the current content corpus without losing visible text', () => {
  const entries = corpusTexts();
  const cleaned = entries.map(({ key, value }) => ({ key, value: cleanMarkdownText(value, { emphasizeLinks: true }) }));

  assert.equal(entries.length, 1387, 'linked corpus size changed; review the new source forms');
  for (let index = 0; index < entries.length; index += 1) {
    const source = entries[index];
    const result = cleaned[index];
    assert.ok(source && result);
    assert.equal(HAS_LINK.test(result.value), false, `${result.key} keeps a Markdown link`);
    assert.equal(HAS_IMAGE.test(result.value), false, `${result.key} keeps a Markdown image`);
    assert.equal(result.value.includes('****'), false, `${result.key} contains a broken emphasis run`);
    assert.equal(visibleText(result.value), visibleText(source.value), `${result.key} loses visible text`);
    assert.equal(cleanMarkdownText(result.value, { emphasizeLinks: true }), result.value, `${result.key} cleanup is not idempotent`);
  }

  const hash = createHash('sha256').update(JSON.stringify(cleaned)).digest('hex');
  // Review 2026-11-04: quote prefixes are removed in 26 rules.json texts,
  // including indented advice on the first pass. Source data is unchanged;
  // the visible-text and idempotence assertions above cover every entry.
  assert.equal(hash, '219829b392c445f7195ba5315dbe21bf3d096bb1f5e460a80c74c8ea05d3e48f', 'cleaned Markdown corpus changed; review the diff before updating the hash');
});

test('visible corpus text excludes quote structure while retaining comparisons and rule changes', () => {
  const source = '> **Совет:** Нанесите [урон](/rule/damage), если результат > 5.\n    >> *Повторите* при результате >= 6.\n> 5\n>= 6\nA -> B';
  const expected = 'Совет: Нанесите урон, если результат > 5. Повторите при результате >= 6. > 5 >= 6 A -> B';
  assert.equal(visibleText(source), expected);
  assert.equal(visibleText(cleanMarkdownText(source, { emphasizeLinks: true })), expected);
  assert.notEqual(visibleText(source.replace('> 5.', '> 7.')), expected);
  assert.notEqual(visibleText(source.replace('Нанесите', 'Уменьшите')), expected);
});
