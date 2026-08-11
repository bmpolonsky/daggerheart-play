/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { Check, Copy, Ellipsis, Eye, EyeOff, Image, Minus, Mountain, PackageCheck, PackageMinus, Pencil, Plus, Shield, Trash2, UserRound } from 'lucide-react';
import { useState } from 'preact/hooks';
import type { PreparedActorsView } from '../../../domain/tabletop/preparedActors';
import type { PreparedHandoutRow } from '../../../domain/rules/handouts';
import { classLabel, adversaryTypeLabel } from '../../../domain/rules/constants';
import { defaultCharacterPortraitUrl } from '../../../domain/tabletop/defaultArt';
import { gameService, preparedActorService } from '../../../services/serviceRegistry';
import { ActionMenu, AssetImage, Avatar, Badge, ConfirmDialog, IconButton, ListItem, SearchField, SectionHeader } from '../../components/common';
import { cleanMarkdownText } from '../../../core/utils/markdownText';
import { cssImageUrl, initials } from './helpers';
import type { PlayerViewedActor } from './types';

export function PreparedActorsPanel({ view, handouts, query, onQueryChange, onOpenActor, onEditAdversary, onEditEnvironment, onCreateHero, onCreateHandout, onOpenHandout, onOpenAdversaries, onOpenEnvironments }: {
  view: PreparedActorsView;
  handouts: PreparedHandoutRow[];
  query: string;
  onQueryChange: (query: string) => void;
  onOpenActor: (actor: PlayerViewedActor) => void;
  onEditAdversary: (adversaryId: string) => void;
  onEditEnvironment: (environmentId: string) => void;
  onCreateHero: () => void;
  onCreateHandout: () => void;
  onOpenHandout: (handoutId: string) => void;
  onOpenAdversaries: () => void;
  onOpenEnvironments: () => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  return (
    <section className="player-prepared" aria-label="Подготовлено">
      <SearchField size="sm" value={query} placeholder="Найти подготовленное..." aria-label="Поиск подготовленных ресурсов" onInput={(event) => onQueryChange(event.currentTarget.value)} />
      <PreparedSection title="Герои" icon={<UserRound size={15} />} onAdd={onCreateHero} addLabel="Создать героя">
        {view.heroes.map(({ character, onActiveScene, companionOnActiveScene }) => (
          <div className="player-prepared__hero" key={character.id}>
            <ListItem
              title={character.name}
              subtitle={`${classLabel(character.className)} ${character.level}`}
              leftAccessory={<Avatar src={cssImageUrl(defaultCharacterPortraitUrl(character))} fallback={initials(character.name)} size="sm" />}
              rightAccessory={<IconButton size="xs" variant={onActiveScene ? 'ghost' : 'primary'} disabled={onActiveScene} title={onActiveScene ? 'Уже на сцене' : 'Добавить на сцену'} aria-label={onActiveScene ? `${character.name} уже на сцене` : `Добавить ${character.name} на сцену`} onClick={() => preparedActorService.addCharacter(character.id)}>{onActiveScene ? <Check size={13} /> : <Plus size={13} />}</IconButton>}
              onClick={() => onOpenActor({ kind: 'character', actorId: character.id })}
            />
            {character.companion && (
              <ListItem
                className="player-prepared__companion"
                density="compact"
                title={character.companion.name}
                subtitle={`Спутник ${character.name}`}
                leftAccessory={<Avatar src={character.companion.imageUrl ? cssImageUrl(character.companion.imageUrl) : undefined} fallback={initials(character.companion.name)} size="sm" />}
                rightAccessory={<IconButton size="xs" variant={companionOnActiveScene ? 'ghost' : 'secondary'} disabled={companionOnActiveScene} title={companionOnActiveScene ? 'Уже на сцене' : 'Добавить спутника'} aria-label={companionOnActiveScene ? `${character.companion.name} уже на сцене` : `Добавить ${character.companion.name} на сцену`} onClick={() => preparedActorService.addCompanion(character.id)}>{companionOnActiveScene ? <Check size={13} /> : <Plus size={13} />}</IconButton>}
                onClick={() => onOpenActor({ kind: 'character', actorId: character.id })}
              />
            )}
          </div>
        ))}
        {view.heroes.length === 0 && <PreparedEmpty searching={Boolean(query.trim())} />}
      </PreparedSection>
      <PreparedSection title="Противники" icon={<Shield size={15} />} onAdd={onOpenAdversaries} addLabel="Открыть справочник противников">
        {view.adversaries.map(({ adversary, activeSceneInstances }) => (
          <ListItem
            key={adversary.id}
            title={adversary.name}
            subtitle={`Ранг ${adversary.tier} / ${adversaryTypeLabel(adversary.type)}`}
            leftAccessory={<Avatar src={adversary.imageUrl ? cssImageUrl(adversary.imageUrl) : undefined} fallback={initials(adversary.name)} size="sm" />}
            rightAccessory={<div className="player-prepared__actions">
              {activeSceneInstances > 0 && <>
                <IconButton size="xs" variant="ghost" title="Убрать последний экземпляр со сцены" aria-label={`Убрать последнего ${adversary.name} со сцены`} onClick={() => preparedActorService.removeLastAdversaryInstance(adversary.id)}><Minus size={13} aria-hidden="true" /></IconButton>
                <Badge tone="gold" size="xs">{activeSceneInstances}</Badge>
              </>}
              <IconButton size="xs" variant="primary" title="Добавить экземпляр на сцену" aria-label={`Добавить ${adversary.name} на сцену`} onClick={() => preparedActorService.instantiateAdversary(adversary.id)}><Plus size={13} /></IconButton>
              <ActionMenu
                ariaLabel={`Действия: ${adversary.name}`}
                items={[
                  { id: 'edit', label: 'Редактировать', icon: <Pencil size={14} />, onSelect: () => onEditAdversary(adversary.id) },
                  { id: 'duplicate', label: 'Дублировать', icon: <Copy size={14} />, onSelect: () => preparedActorService.duplicateAdversaryTemplate(adversary.id) },
                  { id: 'remove', label: 'Убрать', icon: <PackageMinus size={14} />, onSelect: () => preparedActorService.deleteTemplate({ kind: 'adversary', id: adversary.id }) }
                ]}
                renderTrigger={(props) => <IconButton {...props} size="xs" variant="ghost" title="Действия" aria-label={`Действия: ${adversary.name}`}><Ellipsis size={14} /></IconButton>}
              />
            </div>}
            onClick={() => onOpenActor({ kind: 'adversary', actorId: adversary.id })}
          />
        ))}
        {view.adversaries.length === 0 && <PreparedEmpty searching={Boolean(query.trim())} />}
      </PreparedSection>
      <PreparedSection title="Окружение" icon={<Mountain size={15} />} onAdd={onOpenEnvironments} addLabel="Открыть справочник окружений">
        {view.environments.map(({ environment, onActiveScene }) => (
          <ListItem
            key={environment.id}
            title={environment.name}
            subtitle={environment.difficulty ? `Сложность ${environment.difficulty}` : 'Окружение'}
            leftAccessory={<Avatar src={environment.imageUrl ? cssImageUrl(environment.imageUrl) : undefined} fallback={initials(environment.name)} size="sm" />}
            rightAccessory={<div className="player-prepared__actions">
              <IconButton size="xs" variant={onActiveScene ? 'ghost' : 'primary'} disabled={onActiveScene} title={onActiveScene ? 'Уже на сцене' : 'Добавить на сцену'} aria-label={onActiveScene ? `${environment.name} уже на сцене` : `Добавить ${environment.name} на сцену`} onClick={() => preparedActorService.instantiateEnvironment(environment.id)}>{onActiveScene ? <Check size={13} /> : <Plus size={13} />}</IconButton>
              <ActionMenu ariaLabel={`Действия: ${environment.name}`} items={[{ id: 'edit', label: 'Редактировать', icon: <Pencil size={14} />, onSelect: () => onEditEnvironment(environment.id) }, { id: 'duplicate', label: 'Дублировать', icon: <Copy size={14} />, onSelect: () => preparedActorService.duplicateEnvironmentTemplate(environment.id) }, { id: 'remove', label: 'Убрать', icon: <PackageMinus size={14} />, onSelect: () => preparedActorService.deleteTemplate({ kind: 'environment', id: environment.id }) }]} renderTrigger={(props) => <IconButton {...props} size="xs" variant="ghost" title="Действия" aria-label={`Действия: ${environment.name}`}><Ellipsis size={14} /></IconButton>} />
            </div>}
            onClick={() => onOpenActor({ kind: 'environment', actorId: environment.id })}
          />
        ))}
        {view.environments.length === 0 && <PreparedEmpty searching={Boolean(query.trim())} />}
      </PreparedSection>
      <PreparedSection title="Раздатки" icon={<Image size={15} />} onAdd={onCreateHandout} addLabel="Создать раздатку">
        {handouts.map(({ handout, status }) => {
          const presented = status === 'presented';
          return <ListItem
            key={handout.id}
            title={handout.title || 'Без названия'}
            subtitle={handoutPreview(handout.body)}
            detail={<Badge tone={presented ? 'gold' : status === 'visible' ? 'success' : 'neutral'} size="xs">{handoutStatusLabel(status)}</Badge>}
            leftAccessory={<span className="player-prepared__handout-preview" aria-hidden="true">{handout.imageUrl ? <AssetImage src={cssImageUrl(handout.imageUrl)} alt="" /> : <Image size={16} />}</span>}
            rightAccessory={<div className="player-prepared__actions">
              <IconButton size="xs" variant={presented ? 'ghost' : 'primary'} title={presented ? 'Убрать со стола' : 'Показать на столе'} aria-label={`${presented ? 'Убрать со стола' : 'Показать на столе'}: ${handout.title || 'Без названия'}`} onClick={() => presented ? gameService.hidePresentedHandout() : gameService.presentHandout(handout.id)}>{presented ? <EyeOff size={13} /> : <Eye size={13} />}</IconButton>
              <ActionMenu ariaLabel={`Действия: ${handout.title || 'Без названия'}`} items={[{ id: 'edit', label: 'Редактировать', icon: <Pencil size={14} />, onSelect: () => onOpenHandout(handout.id) }, { id: 'delete', label: 'Удалить', icon: <Trash2 size={14} />, onSelect: () => setDeleteTarget({ id: handout.id, name: handout.title || 'Без названия' }) }]} renderTrigger={(props) => <IconButton {...props} size="xs" variant="ghost" title="Действия" aria-label={`Действия: ${handout.title || 'Без названия'}`}><Ellipsis size={14} /></IconButton>} />
            </div>}
            lines={2}
            align="start"
            onClick={() => onOpenHandout(handout.id)}
          />;
        })}
        {handouts.length === 0 && <PreparedEmpty searching={Boolean(query.trim())} />}
      </PreparedSection>
      {deleteTarget && <ConfirmDialog title={`Удалить «${deleteTarget.name}»?`} body="Раздатка исчезнет у мастера и игроков. Это действие нельзя отменить." onCancel={() => setDeleteTarget(null)} onConfirm={() => { gameService.removeHandout(deleteTarget.id); setDeleteTarget(null); }} />}
    </section>
  );
}

function PreparedSection({ title, icon, addLabel, onAdd, children }: { title: string; icon: ComponentChildren; addLabel: string; onAdd: () => void; children: ComponentChildren }) {
  return <section className="player-prepared__section"><SectionHeader title={<span className="player-prepared__title">{icon}{title}</span>} actions={<IconButton size="xs" variant="ghost" title={addLabel} aria-label={addLabel} onClick={onAdd}><Plus size={14} /></IconButton>} /><div className="player-prepared__list">{children}</div></section>;
}

function PreparedEmpty({ searching }: { searching: boolean }) {
  return <p className="player-participant-group__empty"><PackageCheck size={14} aria-hidden="true" /> {searching ? 'Ничего не найдено.' : 'Пока ничего не подготовлено.'}</p>;
}

function handoutStatusLabel(status: PreparedHandoutRow['status']): string {
  if (status === 'presented') return 'Сейчас показана';
  return status === 'visible' ? 'Доступна игрокам' : 'Черновик';
}

function handoutPreview(body: string): string {
  const text = cleanMarkdownText(body, { stripEmphasis: true }).replace(/\s+/g, ' ').trim();
  if (!text) return 'Без текста';
  return text.length > 72 ? `${text.slice(0, 69).trim()}…` : text;
}
