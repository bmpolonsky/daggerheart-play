/** @jsxImportSource preact */
import { Plus, Trash2 } from 'lucide-react';
import type { GameState } from '../../../../domain/rules/types';
import { gameService } from '../../../../services/serviceRegistry';
import { Button } from '../../../components/common/Button';
import { TextAreaControl, TextControl } from '../../../components/common/Field';
import { IconButton } from '../../../components/common/IconButton';
import { ImageFilePicker } from '../../../components/common/ImageFilePicker';
import { Surface } from '../../../components/common/Surface';
import { cssImageUrl } from '../helpers';
import { renderRulesText } from '../sheetText';
import type { TableViewRole } from '../types';
import { readFileAsDataUrl } from './readFileAsDataUrl';

export function SharedToolsHandoutsTab({ game, role }: { game: GameState; role: TableViewRole }) {
  const visibleHandouts = role === 'gm' ? game.handouts : game.handouts.filter((handout) => handout.visibleToPlayers);
  const selectHandoutImage = async (handoutId: string, file: File) => {
    const imageUrl = await readFileAsDataUrl(file);
    gameService.updateHandout(handoutId, { imageUrl });
  };
  return (
    <section className="player-tools-section">
      <header>
        <strong>Раздатка</strong>
        {role === 'gm' && (
          <Button variant="primary" size="sm" type="button" iconBefore={<Plus size={15} aria-hidden="true" />} onClick={() => gameService.addHandout({ title: `Раздатка ${game.handouts.length + 1}`, visibleToPlayers: true })}>
            Добавить
          </Button>
        )}
      </header>
      <div className="player-tools-list player-tools-handout-list">
        {visibleHandouts.map((handout) => (
          <Surface as="article" tone="subtle" className="player-tools-row player-tools-handout-card" key={handout.id}>
            <div className="player-tools-edit-grid player-tools-handout-card__fields">
              {role === 'gm' ? (
                <>
                  <label>
                    <span>Название</span>
                    <TextControl value={handout.title} onInput={(event) => gameService.updateHandout(handout.id, { title: event.currentTarget.value })} />
                  </label>
                  <label>
                    <span>Текст</span>
                    <TextAreaControl value={handout.body} onInput={(event) => gameService.updateHandout(handout.id, { body: event.currentTarget.value })} />
                  </label>
                  <ImageFilePicker
                    className="player-tools-handout-image"
                    label="Изображение"
                    imageUrl={handout.imageUrl ? cssImageUrl(handout.imageUrl) : ''}
                    aspectRatio="4 / 3"
                    onFileSelect={(file) => selectHandoutImage(handout.id, file)}
                    onClear={() => gameService.updateHandout(handout.id, { imageUrl: null })}
                  />
                </>
              ) : (
                <>
                  <strong>{handout.title}</strong>
                  <span>{renderRulesText(handout.body || 'Раздатка')}</span>
                </>
              )}
            </div>
            {role === 'gm' && (
              <div className="player-tools-handout-card__actions">
                <IconButton variant="ghost" size="sm" type="button" aria-label={`Удалить раздатку ${handout.title}`} title="Удалить" onClick={() => gameService.removeHandout(handout.id)}>
                  <Trash2 size={14} aria-hidden="true" />
                </IconButton>
              </div>
            )}
          </Surface>
        ))}
        {visibleHandouts.length === 0 && <p className="player-tools-empty">Раздатки пока нет.</p>}
      </div>
    </section>
  );
}
