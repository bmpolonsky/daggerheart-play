/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { ChevronLeft, MinusCircle, Plus, UserRound } from 'lucide-react';
import type { ContentState } from '../../../../domain/content/types';
import type { Character, CharacterChangeActor, DaggerheartClass, SceneTableState } from '../../../../domain/rules/types';
import { classLabel } from '../../../../domain/rules/constants';
import { sceneTableService } from '../../../../services/serviceRegistry';
import { CharacterBuilderModal } from '../../../characters/CharacterBuilderModal';
import { CharacterEditor } from '../../../characters/CharacterEditor';
import { AssetImage, Button, EmptyState, ListDetailLayout, ListItem, Toolbar } from '../../../components/common';

export function SharedToolsCharactersTab({
  characterBuilderOpen,
  actor,
  characterOptions,
  content,
  onCharacterBuilderClose,
  onCharacterBuilderCreate,
  onCharacterBuilderOpen,
  playerSeats,
  sceneTable
}: {
  characterBuilderOpen: boolean;
  actor: CharacterChangeActor;
  characterOptions: Character[];
  content: ContentState;
  onCharacterBuilderClose: () => void;
  onCharacterBuilderCreate: (input: Partial<Character> & { className?: DaggerheartClass }) => void;
  onCharacterBuilderOpen: () => void;
  playerSeats: Array<SceneTableState['participants'][string]>;
  sceneTable: SceneTableState;
}) {
  const [selectedCharacterId, setSelectedCharacterId] = useState(characterOptions[0]?.id ?? '');
  const [editorOpen, setEditorOpen] = useState(false);
  const selectedCharacter = characterOptions.find((character) => character.id === selectedCharacterId) ?? characterOptions[0] ?? null;
  const activeScene = sceneTable.scenes[sceneTable.activeSceneId];
  const hasCharacters = characterOptions.length > 0;

  useEffect(() => {
    if (selectedCharacterId && characterOptions.some((character) => character.id === selectedCharacterId)) return;
    setSelectedCharacterId(characterOptions[0]?.id ?? '');
    setEditorOpen(false);
  }, [characterOptions, selectedCharacterId]);

  const openCharacter = (characterId: string) => {
    setSelectedCharacterId(characterId);
    setEditorOpen(true);
  };

  return (
    <section className={`player-tools-section player-tools-characters-section ${editorOpen ? 'player-tools-characters-section--editing' : ''}`}>
      <Toolbar className="player-tools-section-actions" aria-label="Действия с персонажами">
        <Button variant="primary" size="sm" type="button" iconBefore={<Plus size={15} aria-hidden="true" />} onClick={onCharacterBuilderOpen}>
          Создать героя
        </Button>
      </Toolbar>
      <ListDetailLayout
        className={`player-tools-character-workspace ${hasCharacters ? '' : 'dh-is-empty'}`}
        narrowDetailOpen={editorOpen}
        list={<nav className="player-tools-character-roster" aria-label="Ростер персонажей">
          {characterOptions.map((character) => {
            const assignedSeat = playerSeats.find((seat) => seat.actorIds.includes(character.id));
            const assignedSeatName = assignedSeat?.name.trim();
            const isSelected = selectedCharacter?.id === character.id;
            const sceneToken = activeScene?.tokens.find((token) => token.actor.kind === 'character' && token.actor.id === character.id) ?? null;
            const isOnScene = Boolean(sceneToken);
            return (
              <ListItem
                className={isSelected ? 'player-tools-character-card dh-is-selected' : 'player-tools-character-card'}
                key={character.id}
                title={character.name || 'Без имени'}
                subtitle={`${classLabel(character.className)} — уровень ${character.level}`}
                detail={assignedSeat ? assignedSeatName || 'Игрок без имени' : 'Игрок не назначен'}
                leftAccessory={<CharacterPortrait character={character} />}
                rightAccessory={<div className="player-tools-character-actions">
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
                </div>}
                align="start"
                lines={2}
                onClick={() => openCharacter(character.id)}
              />
            );
          })}
          {!hasCharacters && <EmptyState tone="transparent" icon={<UserRound size={20} />} title="Персонажей пока нет" />}
        </nav>}
        detail={hasCharacters ? (
          <section className="player-tools-character-editor" aria-label="Редактор персонажа">
            <div className="player-tools-character-backbar">
              <Button
                size="sm"
                variant="ghost"
                type="button"
                aria-label="Вернуться к ростеру персонажей"
                iconBefore={<ChevronLeft size={16} aria-hidden="true" />}
                onClick={() => setEditorOpen(false)}
              >
                Все персонажи
              </Button>
              <span>{selectedCharacter?.name || 'Персонаж'}</span>
            </div>
            {selectedCharacter ? (
              <CharacterEditor character={selectedCharacter} content={content} role="gm" actor={actor} />
            ) : (
              <EmptyState
                className="player-tools-character-editor-empty"
                tone="subtle"
                size="sm"
                title="Персонаж не выбран"
              />
            )}
          </section>
        ) : undefined}
      />
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

function CharacterPortrait({ character }: { character: Character }) {
  return (
    <span className="player-tools-character-portrait" aria-hidden="true">
      {character.portraitUrl ? <AssetImage src={character.portraitUrl} alt="" /> : <span>{character.name.slice(0, 2).toUpperCase() || 'DH'}</span>}
    </span>
  );
}
