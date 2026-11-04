import type { GameDocument } from './gameDocument';

/** View selection is still autosaved, but losing it does not warrant an
 * unsaved-game warning. Game entities, custom content and assets remain intact. */
export function unsavedGameContentSignature(document: GameDocument): string {
  const { selectedId: _selectedId, updatedAt: _charactersTime, ...characters } = document.files['data/characters.json'];
  const { selectedTokenId: _selectedToken, updatedAt: _sceneTime, ...sceneTable } = document.files['data/scene-table.json'];
  const files = { ...document.files };
  const { 'manifest.json': _manifest, 'data/ui.json': _ui, ...content } = files;
  return JSON.stringify({ ...content, 'data/characters.json': characters, 'data/scene-table.json': sceneTable }, (_key, item) => (
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
      : item
  ));
}
