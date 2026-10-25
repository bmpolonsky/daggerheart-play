import { test } from 'vitest';
import assert from 'node:assert/strict';
import { cleanLibraryHtmlText, compactLibraryText, libraryPreviewText, shouldRecoverLibraryFilters } from '../../src/domain/content/libraryPresentation';

test('library HTML cleanup keeps game comparisons and decoded text while stripping known tags', () => {
  assert.equal(cleanLibraryHtmlText('<p>Бросок &lt; 3 &amp; ранг &ge; 2.</p><div>Урон &#49;d&#x36;.</div>'), 'Бросок < 3 & ранг ≥ 2.\n\nУрон 1d6.');
  assert.equal(compactLibraryText('<span>Шаг</span><br>HP < 3; stress > 1.'), 'Шаг HP < 3; stress > 1.');
  assert.equal(cleanLibraryHtmlText('x < y; <unknown-rule>оставить</unknown-rule>'), 'x < y; <unknown-rule>оставить</unknown-rule>');
});

test('library text excludes executable markup contents and never creates an HTML node', () => {
  assert.equal(cleanLibraryHtmlText('<script>alert(1)</script><style>.x{}</style><iframe>private</iframe><b>Текст</b>'), 'Текст');
  assert.equal(cleanLibraryHtmlText('Текст<script src="bad">unfinished'), 'Текст');
  assert.equal(cleanLibraryHtmlText('&lt;img src=x onerror=alert(1)&gt;Далее&nbsp;&quot;текст&quot;'), 'Далее "текст"');
  assert.equal(cleanLibraryHtmlText('&#x110000; &#0; &#xD800;'), '&#x110000; &#0; &#xD800;');
});

test('properties provide a preview only when the primary body has no text', () => {
  assert.equal(libraryPreviewText('', '### Острое\nДобавьте 2 к урону.'), '### Острое\nДобавьте 2 к урону.');
  assert.equal(libraryPreviewText('<p></p>', 'Текст свойства'), 'Текст свойства');
  assert.equal(libraryPreviewText('Описание', 'Текст свойства'), 'Описание');
  assert.equal(compactLibraryText(libraryPreviewText('', '### Острое\nДобавьте 2 к урону.')), 'Острое Добавьте 2 к урону.');
});

test('saving a focused entry outside current filters does not trigger deep-link filter recovery', () => {
  const context = { selectedSlug: 'saved-copy', visibleSlugs: ['original'], savedSlug: 'saved-copy', editorOpen: false };
  assert.equal(shouldRecoverLibraryFilters(context), false);
  assert.equal(shouldRecoverLibraryFilters({ ...context, savedSlug: null, editorOpen: true }), false);
  assert.equal(shouldRecoverLibraryFilters({ ...context, savedSlug: null }), true);
  assert.equal(shouldRecoverLibraryFilters({ ...context, selectedSlug: 'original', savedSlug: null }), false);
});
