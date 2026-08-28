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
  assert.equal(hash, 'bdda6ab1bfe23bf0257f732c3421e9b3709350be5bf177f4bca42316edc5b2a9', 'cleaned Markdown corpus changed; review the diff before updating the hash');
});
