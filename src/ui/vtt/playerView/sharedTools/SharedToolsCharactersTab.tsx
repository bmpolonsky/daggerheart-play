/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { CheckCircle2, MinusCircle, Plus } from 'lucide-react';
import type { ContentState } from '../../../../domain/content/types';
import type { Character, DaggerheartClass, SceneTableState } from '../../../../domain/rules/types';
import { classLabel } from '../../../../domain/rules/constants';
import { sceneTableService } from '../../../../services/serviceRegistry';
import { CharacterBuilderModal } from '../../../characters/CharacterBuilderModal';
import { CharacterEditor } from '../../../characters/CharacterEditor';

export function SharedToolsCharactersTab({
  characterBuilderOpen,
  characterOptions,
  content,
  onCharacterBuilderClose,
  onCharacterBuilderCreate,
  onCharacterBuilderOpen,
  playerSeats,
  sceneTable
}: {
  characterBuilderOpen: boolean;
  characterOptions: Character[];
  content: ContentState;
  onCharacterBuilderClose: () => void;
  onCharacterBuilderCreate: (input: Partial<Character> & { className?: DaggerheartClass }) => void;
  onCharacterBuilderOpen: () => void;
  playerSeats: Array<SceneTableState['participants'][string]>;
  sceneTable: SceneTableState;
}) {
  const [selectedCharacterId, setSelectedCharacterId] = useState(characterOptions[0]?.id ?? '');
  const selectedCharacter = characterOptions.find((character) => character.id === selectedCharacterId) ?? characterOptions[0] ?? null;
  const activeScene = sceneTable.scenes[sceneTable.activeSceneId];

  useEffect(() => {
    if (selectedCharacterId && characterOptions.some((character) => character.id === selectedCharacterId)) return;
    setSelectedCharacterId(characterOptions[0]?.id ?? '');
  }, [characterOptions, selectedCharacterId]);

  return (
    <section className="player-tools-section">
      <header>
        <strong>Персонажи</strong>
        <button className="dh-button dh-variant-primary" type="button" onClick={onCharacterBuilderOpen}>
          <Plus size={15} /> Создать героя
        </button>
      </header>
      <div className="player-tools-character-workspace">
        <aside className="player-tools-character-roster" aria-label="Ростер персонажей">
          {characterOptions.map((character) => {
            const assignedSeat = playerSeats.find((seat) => seat.actorIds.includes(character.id));
            const assignedSeatName = assignedSeat?.name.trim();
            const isSelected = selectedCharacter?.id === character.id;
            const sceneToken = activeScene?.tokens.find((token) => token.actor.kind === 'character' && token.actor.id === character.id) ?? null;
            const isOnScene = Boolean(sceneToken);
            return (
              <article className={`player-tools-character-card ${isSelected ? 'dh-is-selected' : ''}`} key={character.id}>
                <button className="player-tools-character-card__select" type="button" onClick={() => setSelectedCharacterId(character.id)}>
                  <span>{classLabel(character.className)} · уровень {character.level}</span>
                  <strong>{character.name || 'Без имени'}</strong>
                  <small>{assignedSeat ? assignedSeatName || 'Игрок без имени' : 'Игрок не назначен'}</small>
                </button>
                <div className="player-tools-character-status">
                  <span className={assignedSeat ? 'dh-is-ready' : ''}>
                    {assignedSeat && <CheckCircle2 size={13} />} {assignedSeat ? assignedSeatName || 'Игрок без имени' : 'Без игрока'}
                  </span>
                </div>
                <div className="player-tools-character-actions">
                  {isOnScene ? (
                    <button
                      className="dh-is-danger"
                      type="button"
                      onClick={() => {
                        if (!sceneToken) return;
                        sceneTableService.removeTokenFromSceneInScene(sceneTable.activeSceneId, sceneToken.id);
                      }}
                    >
                      <MinusCircle size={14} />
                      Убрать со сцены
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => sceneTableService.addActorTokenToScene(sceneTable.activeSceneId, { kind: 'character', id: character.id })}
                    >
                      <Plus size={14} />
                      На сцену
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {characterOptions.length === 0 && <p className="player-tools-empty">Персонажей пока нет.</p>}
        </aside>
        <section className="player-tools-character-editor" aria-label="Редактор персонажа">
          {selectedCharacter ? (
            <CharacterEditor character={selectedCharacter} content={content} />
          ) : (
            <div className="player-tools-character-editor-empty">
              <strong>Персонаж не выбран</strong>
              <button className="dh-button dh-variant-primary" type="button" onClick={onCharacterBuilderOpen}>
                <Plus size={15} /> Создать героя
              </button>
            </div>
          )}
        </section>
      </div>
      {characterBuilderOpen && (
        <CharacterBuilderModal
          content={content.generic}
          classes={content.classes}
          equipment={content.equipment}
          onCancel={onCharacterBuilderClose}
          onCreate={onCharacterBuilderCreate}
        />
      )}
    </section>
  );
}
