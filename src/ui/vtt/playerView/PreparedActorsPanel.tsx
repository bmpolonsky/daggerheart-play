/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { Check, Copy, Ellipsis, Image, Minus, Mountain, PackageCheck, PackageMinus, Pencil, Plus, Shield, UserRound } from 'lucide-react';
import type { PreparedActorsView } from '../../../domain/tabletop/preparedActors';
import type { PreparedHandoutRow } from '../../../domain/rules/handouts';
import { characterClassLabel, adversaryTypeLabel } from '../../../domain/rules/constants';
import { defaultCharacterPortraitUrl } from '../../../domain/tabletop/defaultArt';
import { preparedActorService } from '../../../services/serviceRegistry';
import { ActionMenu, AssetImage, Avatar, Badge, IconButton, ListItem, SearchField, SectionHeader } from '../../components/common';
import { cssImageUrl, initials } from './helpers';
import type { PlayerViewedActor } from './types';

export function PreparedActorsPanel({ view, handouts, query, onQueryChange, onOpenActor, onEditAdversary, onEditEnvironment, onCreateHero, onCreateHandout, onPreviewHandout, onOpenAdversaries, onOpenEnvironments }: {
  view: PreparedActorsView;
  handouts: PreparedHandoutRow[];
  query: string;
  onQueryChange: (query: string) => void;
  onOpenActor: (actor: PlayerViewedActor) => void;
  onEditAdversary: (adversaryId: string) => void;
  onEditEnvironment: (environmentId: string) => void;
  onCreateHero: () => void;
  onCreateHandout: () => void;
  onPreviewHandout: (handout: PreparedHandoutRow['handout']) => void;
  onOpenAdversaries: () => void;
  onOpenEnvironments: () => void;
}) {
  return (
    <section className="player-prepared" aria-label="Подготовлено">
      <SearchField size="sm" value={query} placeholder="Найти подготовленное..." aria-label="Поиск подготовленных ресурсов" onInput={(event) => onQueryChange(event.currentTarget.value)} />
      <PreparedSection title="Герои" icon={<UserRound size={15} />} onAdd={onCreateHero} addLabel="Создать героя">
        {view.heroes.map(({ character, onActiveScene, companionOnActiveScene }) => (
          <div className="player-prepared__hero" key={character.id}>
            <ListItem
              title={character.name}
            subtitle={`${characterClassLabel(character)} ${character.level}`}
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
            detail={presented ? <Badge tone="gold" size="xs">На столе</Badge> : undefined}
            leftAccessory={<span className="player-prepared__handout-preview" aria-hidden="true">{handout.imageUrl ? <AssetImage src={cssImageUrl(handout.imageUrl)} alt="" /> : <Image size={16} />}</span>}
            density="compact"
            onClick={() => onPreviewHandout(handout)}
          />;
        })}
        {handouts.length === 0 && <PreparedEmpty searching={Boolean(query.trim())} />}
      </PreparedSection>
    </section>
  );
}

function PreparedSection({ title, icon, addLabel, onAdd, children }: { title: string; icon: ComponentChildren; addLabel: string; onAdd: () => void; children: ComponentChildren }) {
  return <section className="player-prepared__section"><SectionHeader title={<span className="player-prepared__title">{icon}{title}</span>} actions={<IconButton size="xs" variant="ghost" title={addLabel} aria-label={addLabel} onClick={onAdd}><Plus size={14} /></IconButton>} /><div className="player-prepared__list">{children}</div></section>;
}

function PreparedEmpty({ searching }: { searching: boolean }) {
  return <p className="player-participant-group__empty"><PackageCheck size={14} aria-hidden="true" /> {searching ? 'Ничего не найдено.' : 'Пока ничего не подготовлено.'}</p>;
}
