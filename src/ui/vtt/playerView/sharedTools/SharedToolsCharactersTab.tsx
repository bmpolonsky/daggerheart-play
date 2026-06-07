/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { MinusCircle, Plus } from 'lucide-react';
import type { ContentState } from '../../../../domain/content/types';
import type { Character, DaggerheartClass, SceneTableState } from '../../../../domain/rules/types';
import { classLabel } from '../../../../domain/rules/constants';
import { sceneTableService } from '../../../../services/serviceRegistry';
import { CharacterBuilderModal } from '../../../characters/CharacterBuilderModal';
import { CharacterEditor } from '../../../characters/CharacterEditor';
import { Button } from '../../../components/common/Button';
import { ChoiceCard } from '../../../components/common/ChoiceCard';
import { EmptyState } from '../../../components/common/EmptyState';

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
  const hasCharacters = characterOptions.length > 0;

  useEffect(() => {
    if (selectedCharacterId && characterOptions.some((character) => character.id === selectedCharacterId)) return;
    setSelectedCharacterId(characterOptions[0]?.id ?? '');
  }, [characterOptions, selectedCharacterId]);

  return (
    <section className="player-tools-section">
      <header>
        <strong>Персонажи</strong>
        <Button variant="primary" size="sm" type="button" iconBefore={<Plus size={15} aria-hidden="true" />} onClick={onCharacterBuilderOpen}>
          Создать героя
        </Button>
      </header>
      <div className={`player-tools-character-workspace ${hasCharacters ? '' : 'dh-is-empty'}`}>
        <aside className="player-tools-character-roster" aria-label="Ростер персонажей">
          {characterOptions.map((character) => {
            const assignedSeat = playerSeats.find((seat) => seat.actorIds.includes(character.id));
            const assignedSeatName = assignedSeat?.name.trim();
            const isSelected = selectedCharacter?.id === character.id;
            const sceneToken = activeScene?.tokens.find((token) => token.actor.kind === 'character' && token.actor.id === character.id) ?? null;
            const isOnScene = Boolean(sceneToken);
            return (
              <div className="player-tools-character-card" key={character.id}>
                <ChoiceCard selected={isSelected} type="button" onClick={() => setSelectedCharacterId(character.id)}>
                  <span className="cinematic-card-meta">{classLabel(character.className)} · уровень {character.level}</span>
                  <strong className="cinematic-card-title">{character.name || 'Без имени'}</strong>
                  <small className="cinematic-card-body">{assignedSeat ? assignedSeatName || 'Игрок без имени' : 'Игрок не назначен'}</small>
                </ChoiceCard>
                <div className="player-tools-character-actions">
                  {isOnScene ? (
                    <Button
                      variant="danger"
                      size="sm"
                      type="button"
                      iconBefore={<MinusCircle size={14} aria-hidden="true" />}
                      onClick={() => {
                        if (!sceneToken) return;
                        sceneTableService.removeTokenFromSceneInScene(sceneTable.activeSceneId, sceneToken.id);
                      }}
                    >
                      Убрать со сцены
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      type="button"
                      iconBefore={<Plus size={14} aria-hidden="true" />}
                      onClick={() => sceneTableService.addActorTokenToScene(sceneTable.activeSceneId, { kind: 'character', id: character.id })}
                    >
                      На сцену
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {!hasCharacters && <p className="player-tools-empty">Персонажей пока нет. Создайте первого героя кнопкой в заголовке.</p>}
        </aside>
        {hasCharacters && (
          <section className="player-tools-character-editor" aria-label="Редактор персонажа">
            {selectedCharacter ? (
              <CharacterEditor character={selectedCharacter} content={content} />
            ) : (
              <EmptyState
                className="player-tools-character-editor-empty"
                tone="subtle"
                size="sm"
                title="Персонаж не выбран"
                body="Выберите персонажа из списка или создайте нового."
              />
            )}
          </section>
        )}
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
