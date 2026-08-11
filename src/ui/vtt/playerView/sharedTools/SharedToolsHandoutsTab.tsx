/** @jsxImportSource preact */
import { Eye, EyeOff, Image, Plus, RadioTower, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'preact/hooks';
import { cleanMarkdownText } from '../../../../core/utils/markdownText';
import type { GameHandout, GameState } from '../../../../domain/rules/types';
import { gameService } from '../../../../services/serviceRegistry';
import { AssetImage } from '../../../components/common/AssetImage';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Checkbox } from '../../../components/common/Checkbox';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { EmptyState } from '../../../components/common/EmptyState';
import { TextAreaField, TextField } from '../../../components/common/Field';
import { IconButton } from '../../../components/common/IconButton';
import { ImageFilePicker } from '../../../components/common/ImageFilePicker';
import { ListItem } from '../../../components/common/ListItem';
import { SectionHeader } from '../../../components/common/SectionHeader';
import { Toolbar } from '../../../components/common/Toolbar';
import { cssImageUrl } from '../helpers';
import { renderRulesText } from '../sheetText';
import type { TableViewRole } from '../types';
import { readFileAsDataUrl } from './readFileAsDataUrl';

export function SharedToolsHandoutsTab({ game, role, initialHandoutId, onHandoutChange }: {
  game: GameState;
  role: TableViewRole;
  initialHandoutId?: string | null;
  onHandoutChange?: (handoutId: string) => void;
}) {
  const visibleHandouts = role === 'gm' ? game.handouts : game.handouts.filter((handout) => handout.visibleToPlayers);
  const [selectedHandoutId, setSelectedHandoutId] = useState(initialHandoutId ?? visibleHandouts[0]?.id ?? '');
  const selectedHandout = visibleHandouts.find((handout) => handout.id === selectedHandoutId) ?? visibleHandouts[0] ?? null;
  useEffect(() => {
    if (initialHandoutId && visibleHandouts.some((handout) => handout.id === initialHandoutId)) {
      setSelectedHandoutId(initialHandoutId);
      return;
    }
    if (selectedHandoutId && visibleHandouts.some((handout) => handout.id === selectedHandoutId)) return;
    setSelectedHandoutId(visibleHandouts[0]?.id ?? '');
  }, [initialHandoutId, selectedHandoutId, visibleHandouts]);

  const selectHandout = (handoutId: string) => {
    setSelectedHandoutId(handoutId);
    onHandoutChange?.(handoutId);
  };

  const addHandout = () => {
    const handout = gameService.addHandout({ title: `Раздатка ${game.handouts.length + 1}`, visibleToPlayers: false });
    selectHandout(handout.id);
  };

  return (
    <section className={`player-tools-section player-tools-handouts-section ${role === 'gm' ? '' : 'player-tools-handouts-section--readonly'}`}>
      {role === 'gm' && (
        <Toolbar className="player-tools-section-actions" aria-label="Действия с раздатками">
          <Button variant="primary" size="sm" type="button" iconBefore={<Plus size={15} aria-hidden="true" />} onClick={addHandout}>
            Новая раздатка
          </Button>
        </Toolbar>
      )}

      {visibleHandouts.length > 0 ? (
        <div className="player-tools-master-detail player-tools-master-detail--handouts">
          <nav className="player-tools-master-detail__list" aria-label="Список раздаток">
            {visibleHandouts.map((handout) => (
              <ListItem
                className={selectedHandout?.id === handout.id ? 'dh-is-selected' : ''}
                key={handout.id}
                title={handout.title || 'Без названия'}
                subtitle={handoutPreview(handout.body)}
                leftAccessory={<HandoutThumbnail handout={handout} />}
                rightAccessory={role === 'gm' ? (
                  <Badge tone={handout.visibleToPlayers ? 'success' : 'neutral'}>{handout.visibleToPlayers ? 'Открыта' : 'Черновик'}</Badge>
                ) : undefined}
                lines={2}
                align="start"
                onClick={() => selectHandout(handout.id)}
              />
            ))}
          </nav>
          <div className="player-tools-master-detail__detail">
            {selectedHandout && (role === 'gm'
              ? <HandoutEditor handout={selectedHandout} presented={game.presentedHandoutId === selectedHandout.id} />
              : <HandoutReader handout={selectedHandout} />)}
          </div>
        </div>
      ) : (
        <EmptyState
          tone="transparent"
          icon={<Image size={22} />}
          title={role === 'gm' ? 'Раздаток пока нет' : 'Мастер ещё ничего не открыл'}
        />
      )}
    </section>
  );
}

function HandoutEditor({ handout, presented }: { handout: GameHandout; presented: boolean }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const selectHandoutImage = async (file: File) => {
    const imageUrl = await readFileAsDataUrl(file);
    gameService.updateHandout(handout.id, { imageUrl });
  };

  return (
    <section className="player-tools-detail-editor player-tools-handout-editor" aria-label={`Редактор раздатки ${handout.title}`}>
      <SectionHeader
        eyebrow={presented ? 'Сейчас на столе' : handout.visibleToPlayers ? 'Доступна игрокам' : 'Черновик'}
        title={handout.title || 'Без названия'}
        actions={(
          <Toolbar aria-label="Действия раздатки">
            {presented ? (
              <Button size="sm" iconBefore={<EyeOff size={15} />} onClick={() => gameService.hidePresentedHandout()}>Убрать со стола</Button>
            ) : (
              <Button variant="primary" size="sm" iconBefore={<RadioTower size={15} />} onClick={() => gameService.presentHandout(handout.id)}>Показать на столе</Button>
            )}
            <IconButton variant="danger" size="sm" type="button" aria-label={`Удалить раздатку ${handout.title}`} title="Удалить" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={14} aria-hidden="true" />
            </IconButton>
          </Toolbar>
        )}
      />
      <div className="player-tools-handout-editor__workspace">
        <ImageFilePicker
          className="player-tools-handout-image"
          label="Изображение"
          imageUrl={handout.imageUrl ? cssImageUrl(handout.imageUrl) : ''}
          aspectRatio="4 / 3"
          onFileSelect={selectHandoutImage}
          onClear={() => gameService.updateHandout(handout.id, { imageUrl: null })}
        />
        <div className="player-tools-handout-editor__fields">
          <TextField label="Название" value={handout.title} onInput={(event) => gameService.updateHandout(handout.id, { title: event.currentTarget.value })} />
          <TextAreaField label="Текст" rows={11} value={handout.body} placeholder="Что увидят игроки?" onInput={(event) => gameService.updateHandout(handout.id, { body: event.currentTarget.value })} />
          <Checkbox
            layout="row"
            checked={handout.visibleToPlayers}
            label={<span title="Появится у игроков, даже если сейчас не показана поверх сцены.">Доступна игрокам</span>}
            onChange={(event) => gameService.updateHandout(handout.id, { visibleToPlayers: event.currentTarget.checked })}
          />
        </div>
      </div>
      {deleteOpen && (
        <ConfirmDialog
          title={`Удалить раздатку «${handout.title || 'Без названия'}»?`}
          body="Раздатка исчезнет из рабочего пространства мастера и у игроков. Это действие нельзя отменить."
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => {
            setDeleteOpen(false);
            gameService.removeHandout(handout.id);
          }}
        />
      )}
    </section>
  );
}

function HandoutReader({ handout }: { handout: GameHandout }) {
  return (
    <article className="player-tools-handout-reader" aria-label={handout.title || 'Раздатка'}>
      {handout.imageUrl && <AssetImage src={cssImageUrl(handout.imageUrl)} alt="" />}
      <SectionHeader title={handout.title || 'Без названия'} />
      <div className="player-tools-handout-reader__body">{renderRulesText(handout.body || 'Без текста')}</div>
    </article>
  );
}

function HandoutThumbnail({ handout }: { handout: GameHandout }) {
  return (
    <span className="player-tools-handout-thumbnail" aria-hidden="true">
      {handout.imageUrl ? <AssetImage src={cssImageUrl(handout.imageUrl)} alt="" /> : <Image size={16} />}
    </span>
  );
}

function handoutPreview(value: string): string {
  const text = cleanMarkdownText(value, { stripEmphasis: true }).replace(/\s+/g, ' ').trim();
  if (!text) return 'Без текста';
  return text.length > 90 ? `${text.slice(0, 87).trim()}…` : text;
}
