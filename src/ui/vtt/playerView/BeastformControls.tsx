/** @jsxImportSource preact */
import { useMemo, useState } from 'preact/hooks';
import type { LibraryBeastform } from '../../../domain/content/types';
import type { PlayerViewCharacterSummary } from '../../../domain/tabletop/playerView';
import type { TraitId } from '../../../domain/rules/types';
import { characterLevelRank } from '../../../domain/rules/levelUp';
import { characterService, feedService } from '../../../services/serviceRegistry';
import { Button, RichChoicePicker, SelectField } from '../../components/common';
import { signed } from './helpers';

export function BeastformControls({character, beastforms}: {character: PlayerViewCharacterSummary; beastforms: LibraryBeastform[]}) {
  const [selectedBeastformId, setSelectedBeastformId] = useState(() => beastforms.find(form => form.slug === character.activeBeastform?.slug)?.id ?? '');
  const [evolutionTrait, setEvolutionTrait] = useState<TraitId>(character.activeBeastform?.evolutionTrait ?? character.traits[0]?.id ?? 'agility');
  const availableBeastforms = useMemo(() => beastforms.filter(form => form.tier <= characterLevelRank(character.level)), [beastforms, character.level]);
  const selectedBeastform = availableBeastforms.find(form => form.id === selectedBeastformId) ?? availableBeastforms[0] ?? null;
  return (
<section className="player-beastform-panel" aria-label="Звериная форма">
            {character.activeBeastform && <header><span>Звериная форма</span><strong>{character.activeBeastform.name}</strong></header>}
            {character.activeBeastform ? (
              <div className="player-beastform-panel__active">
                <span>
                  Уклонение {signed(character.activeBeastform.evasionModifier)}
                  {character.activeBeastform.traitType ? ` / ${traitLabel(character, character.activeBeastform.traitType)} ${signed(character.activeBeastform.traitBonus)}` : ''}
                  {character.activeBeastform.evolutionTrait ? ` / ${traitLabel(character, character.activeBeastform.evolutionTrait)} +1` : ''}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    characterService.exitBeastform(character.id);
                    feedService.addMessage(character.name, `${character.activeBeastform?.name ?? 'Форма'} — выход`, { title: 'Форма', publication: 'public' });
                  }}
                >
                  Выйти
                </Button>
              </div>
            ) : (
              <div className="player-beastform-panel__controls">
                <RichChoicePicker
                  className="player-beastform-panel__picker"
                  label="Звериная форма"
                  value={selectedBeastform?.id ?? ''}
                  placeholder="Выберите форму"
                  items={availableBeastforms.map((beastform) => ({
                    id: beastform.id,
                    title: beastform.name,
                    subtitle: `Ранг ${beastform.tier} — уклонение ${signed(beastform.evasionModifier)}`,
                    description: [beastform.summary, beastform.advantages ? `Преимущества: ${beastform.advantages}` : '', beastform.featureText].filter(Boolean).join('\n\n')
                  }))}
                  onChange={setSelectedBeastformId}
                />
                <SelectField className="player-beastform-panel__evolution" label="Эволюция: +1 к характеристике" value={evolutionTrait} onChange={(event) => setEvolutionTrait(event.currentTarget.value as TraitId)} aria-label="Характеристика Эволюции" title="Характеристика Эволюции">
                  {character.traits.map((trait) => <option key={trait.id} value={trait.id}>{trait.label}</option>)}
                </SelectField>
                <Button size="sm" variant="secondary" type="button" title="Отметить 1 Стресс и превратиться" disabled={!selectedBeastform} onClick={() => selectedBeastform && enterBeastform(character, selectedBeastform, 'stress')}>
                  Форма
                </Button>
                <Button size="sm" variant="primary" type="button" title="Потратить 3 Надежды, превратиться и получить +1 к выбранной характеристике" disabled={!selectedBeastform || character.hope.value < 3} onClick={() => selectedBeastform && enterBeastform(character, selectedBeastform, 'evolution', evolutionTrait)}>
                  Эволюция
                </Button>
              </div>
            )}
          </section>
  );
}

function enterBeastform(
  character: PlayerViewCharacterSummary,
  beastform: LibraryBeastform,
  mode: 'stress' | 'evolution',
  evolutionTrait?: TraitId
): void {
  const applied = characterService.enterBeastform(character.id, beastform, { mode, evolutionTrait });
  if (!applied) {
    feedService.addMessage(character.name, `${beastform.name} — не хватает Надежды`, { title: 'Форма', publication: 'public' });
    return;
  }
  const cost = mode === 'evolution'
    ? `-3 Надежды${evolutionTrait ? `, ${traitLabel(character, evolutionTrait)} +1` : ''}`
    : '+1 Стресс';
  feedService.addMessage(character.name, `${beastform.name} — ${cost}`, { title: 'Форма', publication: 'public' });
}

function traitLabel(character: PlayerViewCharacterSummary, traitId: TraitId): string {
  return character.traits.find((trait) => trait.id === traitId)?.label ?? traitId;
}

