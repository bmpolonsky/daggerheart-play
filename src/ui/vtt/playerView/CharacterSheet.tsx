/** @jsxImportSource preact */
import type { JSX } from "preact";
import { useMemo, useRef, useState } from "preact/hooks";
import { ChevronLeft, Crosshair, Heart, PawPrint, Shield, Swords, Zap } from "lucide-react";
import { useStream } from "../../../core/hooks/useStream";
import type { LibraryBeastform } from "../../../domain/content/types";
import type { PlayerViewCharacterSummary } from "../../../domain/tabletop/playerView";
import type { TableFeedFeaturePreview } from "../../../domain/tabletop/feed";
import { defaultCharacterPortraitUrl } from "../../../domain/tabletop/defaultArt";
import { scaleWeaponFormulaByProficiency } from "../../../domain/rules/diceFormula";
import { characterLevelRank } from "../../../domain/rules/levelUp";
import { companionDamageFormula } from "../../../domain/rules/rangerCompanion";
import { ACTOR_STATUS_TAGS, ActorStatus, normalizeStatusTag } from "../../../domain/rules/statuses";
import type { DamageType, TraitId } from "../../../domain/rules/types";
import { formatWealthSummary } from "../../../domain/rules/wealthPresentation";
import { gameService, characterService, diceService, feedService, p2pSessionService } from "../../../services/serviceRegistry";
import { PLAYER_SHEET_SECTIONS } from "./constants";
import { compactDamageTypeLabel, cssImageUrl, signed } from "./helpers";
import { CharacterSheetDomainCards } from "./CharacterSheetDomainCards";
import type { PlayerViewDomainCard } from "./domainCards/types";
import { PlayerRollConfirm } from "./PlayerRollConfirm";
import { PlayerSheetSectionRail, SheetSection, TrackDots, TrackRow } from "./PlayerSheetControls";
import { StatusChips } from "./StatusChips";
import type { PlayerRollDraft, PlayerSheetSectionId, TableViewRole } from "./types";

const CHARACTER_STATUS_OPTIONS = ACTOR_STATUS_TAGS;

export function CharacterSheet({
  character,
  beastforms = [],
  role,
  showBackButton = false,
  onBack,
  onDomainCardPreview,
  onFeaturePreview,
  onWealthEdit
}: {
  character: PlayerViewCharacterSummary;
  beastforms?: LibraryBeastform[];
  role: TableViewRole;
  showBackButton?: boolean;
  onBack?: () => void;
  onDomainCardPreview?: (character: PlayerViewCharacterSummary, card: PlayerViewDomainCard) => void;
  onFeaturePreview?: (character: PlayerViewCharacterSummary, feature: TableFeedFeaturePreview) => void;
  onWealthEdit?: (character: PlayerViewCharacterSummary) => void;
}) {
  const game = useStream(gameService.game$);
  const panelRef = useRef<HTMLElement>(null);
  const [activeSheetSection, setActiveSheetSection] = useState<PlayerSheetSectionId>('overview');
  const [rollDraft, setRollDraft] = useState<PlayerRollDraft | null>(null);
  const [selectedBeastformId, setSelectedBeastformId] = useState('');
  const [evolutionTrait, setEvolutionTrait] = useState(character.traits[0]?.id ?? 'agility');
  const availableBeastforms = useMemo(() => {
    const rank = characterLevelRank(character.level);
    return beastforms.filter((beastform) => beastform.tier <= rank);
  }, [beastforms, character.level]);
  const selectedBeastform = availableBeastforms.find((beastform) => beastform.id === selectedBeastformId) ?? availableBeastforms[0] ?? null;
  const canUseBeastform = character.className === 'Druid' || character.features.some((feature) => /зверин|beastform|beast form/i.test(`${feature.name}\n${feature.text}`));
  const canUseCompanion = character.className === 'Ranger' && (
    /зверин|beastbound|beast bound/i.test(character.subtitle) ||
    character.features.some((feature) => /компаньон|companion|зверин/i.test(`${feature.name}\n${feature.text}`))
  );
  const updateActiveSheetSection = () => {
    const panel = panelRef.current;
    if (!panel) return;
    const atBottom = Math.ceil(panel.scrollTop + panel.clientHeight) >= panel.scrollHeight - 8;
    if (atBottom) {
      setActiveSheetSection('gear');
      return;
    }
    const anchor = panel.scrollTop + 122;
    const current = PLAYER_SHEET_SECTIONS.reduce<PlayerSheetSectionId>((active, section) => {
      const element = panel.querySelector(`#${section.target}`);
      if (!(element instanceof HTMLElement)) return active;
      return element.offsetTop <= anchor ? section.id : active;
    }, 'overview');
    setActiveSheetSection(current);
  };
  const scrollToSheetSection = (sectionId: PlayerSheetSectionId) => {
    const panel = panelRef.current;
    if (!panel) return;
    if (sectionId === 'overview') {
      setActiveSheetSection(sectionId);
      panel.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const section = PLAYER_SHEET_SECTIONS.find((item) => item.id === sectionId);
    const target = section ? panel?.querySelector(`#${section.target}`) : null;
    if (!(target instanceof HTMLElement)) return;
    setActiveSheetSection(sectionId);
    panel.scrollTo({ top: Math.max(0, target.offsetTop - 58), behavior: 'smooth' });
  };
  const portraitUrl = defaultCharacterPortraitUrl(character);
  const heroStyle = {
    '--player-character-portrait': `url("${cssImageUrl(portraitUrl)}")`
  } as JSX.CSSProperties;
  const publishDomainCard = (cardId: string) => {
    const card = character.loadoutCards.find((item) => item.id === cardId);
    if (!card) return;
    onDomainCardPreview?.(character, card);
  };
  const setHpSlots = (next: number) => characterService.markSlots(character.id, 'hp', next - character.hp.marked);
  const addStatus = (name: string) => {
    if (normalizeStatusTag(name) === ActorStatus.Defeated) {
      setHpSlots(character.hp.max);
      return;
    }
    characterService.addCondition(character.id, name);
  };
  const removeStatus = (conditionId: string) => {
    const condition = character.conditions.find((item) => item.id === conditionId);
    if (condition && normalizeStatusTag(condition.name) === ActorStatus.Defeated) {
      setHpSlots(Math.max(0, character.hp.max - 1));
      return;
    }
    characterService.removeCondition(character.id, conditionId);
  };
  return (
    <div className="player-character-panel-shell">
      <PlayerSheetSectionRail activeSheetSection={activeSheetSection} onSelect={scrollToSheetSection} />
      <aside ref={panelRef} className="player-character-panel" aria-label="Персонаж игрока" onScroll={updateActiveSheetSection}>
        {showBackButton && (
          <button className="player-character-panel__back" type="button" title="К ростеру" onClick={onBack}>
            <ChevronLeft size={17} />
          </button>
        )}
        <header className="player-character-panel__hero" style={heroStyle}>
          <img src={cssImageUrl(portraitUrl)} alt="" />
          <div className="player-character-panel__hero-copy">
            <strong>{character.name}</strong>
            <span>Уровень {character.level} / {character.subtitle || character.className}</span>
            <div className="player-character-panel__hero-meta" aria-label="Ключевые параметры персонажа">
              <small>Мастерство {character.proficiency}</small>
              {character.spellcastTrait && <small>Магия: {character.traits.find((trait) => trait.id === character.spellcastTrait)?.label ?? character.spellcastTrait}</small>}
            </div>
          </div>
        </header>
        {rollDraft && (
        <PlayerRollConfirm
          character={character}
          draft={rollDraft}
          onTraitChange={(trait) => setRollDraft((current) => current ? { ...current, trait } : current)}
          onClose={() => setRollDraft(null)}
          onRoll={(rollOptions, rollType, publication) => {
            if (role === 'player' && p2pSessionService.isConnectedPlayerSession()) {
              void p2pSessionService.submitPlayerRollIntent({
                actorId: character.id,
                actorName: character.name,
                publication,
                intent: {
                  type: 'duality',
                  rollType,
                  trait: rollDraft.trait,
                  difficulty: 'difficulty' in rollDraft ? rollDraft.difficulty ?? 0 : 0,
                  ...rollOptions,
                  notes: 'notes' in rollDraft ? rollDraft.notes : undefined
                }
              });
              setRollDraft(null);
              return;
            }
            const rollRequest = {
              actorId: character.id,
              actorName: character.name,
              trait: rollDraft.trait,
              difficulty: 'difficulty' in rollDraft ? rollDraft.difficulty ?? 0 : 0,
              ...rollOptions,
              publication,
              notes: 'notes' in rollDraft ? rollDraft.notes : undefined
            };
            if (rollType === 'reaction') {
              diceService.rollReaction(rollRequest);
            } else {
              diceService.rollAction({
                ...rollRequest,
                applyConsequences: gameService.game$.get().autoApplyRollConsequences
              });
            }
            setRollDraft(null);
          }}
          onDamage={rollDraft.kind === 'weapon' ? ({ publication }) => {
            if (role === 'player' && p2pSessionService.isConnectedPlayerSession()) {
              void p2pSessionService.submitPlayerRollIntent({
                actorId: character.id,
                actorName: character.name,
                publication,
                intent: {
                  type: 'damage',
                  formula: scaleWeaponFormulaByProficiency(rollDraft.damageFormula, character.proficiency),
                  damageType: rollDraft.damageType as DamageType,
                  notes: `Оружие: ${rollDraft.title}`
                }
              });
              setRollDraft(null);
              return;
            }
            diceService.rollDamage({
              actorId: character.id,
              actorName: character.name,
              formula: scaleWeaponFormulaByProficiency(rollDraft.damageFormula, character.proficiency),
              damageType: rollDraft.damageType as DamageType,
              publication,
              notes: `Оружие: ${rollDraft.title}`
            });
            setRollDraft(null);
          } : undefined}
        />
        )}
        <SheetSection id="player-sheet-overview" title="Обзор">
        <section className="player-character-panel__hope">
          <header>
            <span>НАДЕЖДА</span>
            <strong>{character.hope.value}/{character.hope.max}</strong>
          </header>
          <TrackDots
            value={character.hope.value}
            max={character.hope.max}
            tone="hope"
            onSet={(next) => characterService.adjustHope(character.id, next - character.hope.value)}
          />
          {character.scars.length > 0 && (
            <div className="player-character-panel__scars">
              {character.scars.map((scar) => (
                <span key={scar.id}>
                  Шрам: {scar.description}
                  {role === 'gm' && (
                    <button type="button" onClick={() => characterService.healScar(character.id, scar.id)}>
                      Исцелить
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </section>
        <section className="player-track-list">
          <TrackRow
            icon={<Heart size={16} />}
            label="Раны"
            value={character.hp.marked}
            max={character.hp.max}
            tone="hp"
            onSet={setHpSlots}
          />
          <TrackRow
            icon={<Zap size={16} />}
            label="Стресс"
            value={character.stress.marked}
            max={character.stress.max}
            tone="stress"
            onSet={(next) => characterService.markSlots(character.id, 'stress', next - character.stress.marked)}
          />
        </section>
        <section className="player-threshold-row" aria-label="Пороги урона">
          <div>
            <span>Легкий</span>
            <strong>&lt; {character.thresholds.major}</strong>
          </div>
          <div>
            <span>Ощутимый</span>
            <strong>{character.thresholds.major}+</strong>
          </div>
          <div>
            <span>Тяжелый</span>
            <strong>{character.thresholds.severe}+</strong>
          </div>
        </section>
        <section className="player-defense-row">
          <div>
            <Shield size={16} />
            <span>Уклонение</span>
            <strong>{character.evasion}</strong>
          </div>
          <div>
            <Swords size={16} />
            <span>Броня</span>
            <strong>{Math.max(0, character.armor.score - character.armor.marked)}/{character.armor.score}</strong>
            <TrackDots
              value={character.armor.marked}
              max={character.armor.score}
              tone="armor"
              onSet={(next) => characterService.updateArmor(character.id, { markedSlots: next }, false)}
            />
          </div>
        </section>
        {canUseBeastform && (
          <section className="player-beastform-panel" aria-label="Звериная форма">
            <header>
              <span>Звериная форма</span>
              {character.activeBeastform && <strong>{character.activeBeastform.name}</strong>}
            </header>
            {character.activeBeastform ? (
              <div className="player-beastform-panel__active">
                <span>
                  Уклонение {signed(character.activeBeastform.evasionModifier)}
                  {character.activeBeastform.traitType ? ` / ${traitLabel(character, character.activeBeastform.traitType)} ${signed(character.activeBeastform.traitBonus)}` : ''}
                  {character.activeBeastform.evolutionTrait ? ` / ${traitLabel(character, character.activeBeastform.evolutionTrait)} +1` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    characterService.exitBeastform(character.id);
                    feedService.addMessage(character.name, `${character.activeBeastform?.name ?? 'Форма'} · выход`, { title: 'Форма', publication: 'public' });
                  }}
                >
                  Выйти
                </button>
              </div>
            ) : (
              <div className="player-beastform-panel__controls">
                <select value={selectedBeastform?.id ?? ''} onChange={(event) => setSelectedBeastformId(event.currentTarget.value)} aria-label="Выбрать звериную форму">
                  {availableBeastforms.map((beastform) => (
                    <option key={beastform.id} value={beastform.id}>{beastform.name} · ранг {beastform.tier}</option>
                  ))}
                </select>
                <select value={evolutionTrait} onChange={(event) => setEvolutionTrait(event.currentTarget.value as TraitId)} aria-label="Характеристика Эволюции">
                  {character.traits.map((trait) => <option key={trait.id} value={trait.id}>{trait.label}</option>)}
                </select>
                <button type="button" disabled={!selectedBeastform} onClick={() => selectedBeastform && enterBeastform(character, selectedBeastform, 'stress')}>
                  Форма
                </button>
                <button type="button" disabled={!selectedBeastform || character.hope.value < 3} onClick={() => selectedBeastform && enterBeastform(character, selectedBeastform, 'evolution', evolutionTrait)}>
                  Эволюция
                </button>
              </div>
            )}
          </section>
        )}
        {canUseCompanion && (
          <section className="player-companion-panel" aria-label="Компаньон следопыта">
            <header>
              <span>Компаньон</span>
              {character.companion && <strong>{character.companion.name}</strong>}
            </header>
            {character.rangerMark && (
              <div className="player-companion-panel__mark">
                <Crosshair size={14} />
                <span>Метка: {character.rangerMark.targetName}</span>
                <button type="button" onClick={() => characterService.clearRangerMark(character.id)}>Снять</button>
              </div>
            )}
            {character.companion ? (
              <div className="player-companion-panel__body">
                <div className="player-companion-panel__stats">
                  <span>Уклонение <strong>{character.companion.evasion}</strong></span>
                  <span>{character.companion.attackRange} · {companionDamageFormula(character.companion, character.proficiency)} {compactDamageTypeLabel(character.companion.attackDamageType)}</span>
                </div>
                <TrackRow
                  icon={<Zap size={16} />}
                  label="Стресс"
                  value={character.companion.stress.marked}
                  max={character.companion.stress.max}
                  onSet={(next) => characterService.markCompanionStress(character.id, next - character.companion!.stress.marked)}
                />
                {character.companion.unavailableUntilLongRest && <small>Недоступен до продолжительного отдыха</small>}
                <div className="player-companion-panel__actions">
                  <button
                    type="button"
                    onClick={() => {
                      diceService.rollAction({
                        actorId: character.id,
                        actorName: character.name,
                        trait: character.spellcastTrait ?? 'instinct',
                        difficulty: 0,
                        notes: `Команда компаньону: ${character.companion?.name ?? 'Компаньон'}`,
                        applyConsequences: gameService.game$.get().autoApplyRollConsequences
                      });
                    }}
                  >
                    Команда
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!character.companion) return;
                      diceService.rollDamage({
                        actorId: character.id,
                        actorName: character.companion.name,
                        formula: companionDamageFormula(character.companion, character.proficiency),
                        damageType: character.companion.attackDamageType,
                        notes: `Компаньон: ${character.companion.attackName}`
                      });
                    }}
                  >
                    Урон
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => characterService.ensureRangerCompanion(character.id)}>
                <PawPrint size={16} />
                Создать
              </button>
            )}
          </section>
        )}
        <section className="player-sheet-status-block">
          <header>
            <span>Статус</span>
          </header>
          <StatusChips
            conditions={character.conditions}
            options={CHARACTER_STATUS_OPTIONS}
            onAdd={addStatus}
            onRemove={removeStatus}
          />
        </section>
        </SheetSection>
      <SheetSection id="player-sheet-traits" title="Характеристики и опыт">
        <section className="player-trait-grid">
          {character.traits.map((trait) => (
            <button type="button" key={trait.id} onClick={() => setRollDraft({ kind: 'trait', title: trait.label, subtitle: `${character.name} / ${signed(trait.value)}`, trait: trait.id })}>
              <span>{trait.label}</span>
              <strong>{signed(trait.value)}</strong>
            </button>
          ))}
        </section>
        {character.experiences.map((experience) => (
          <article className="player-sheet-row player-sheet-row--compact" key={experience.id}>
            <strong>{experience.name}</strong>
            <b>{signed(experience.modifier)}</b>
          </article>
        ))}
      </SheetSection>
      <SheetSection id="player-sheet-actions" title="Действия" emptyLabel="Оружие не выбрано">
        {character.weapons.map((weapon) => (
          <button
            className="player-sheet-row player-sheet-row--featured player-sheet-row--button"
            key={weapon.id}
            type="button"
            onClick={() => setRollDraft({ kind: 'weapon', title: weapon.name, subtitle: `${weapon.traitLabel} / ${weapon.range} / ${weapon.damage} ${compactDamageTypeLabel(weapon.damageType)}`, trait: weapon.trait, damageFormula: weapon.damageFormula, damageType: weapon.damageType })}
          >
            <strong>{weapon.name}</strong>
            <span>{weapon.traitLabel} / {weapon.range} / {weapon.damage} {compactDamageTypeLabel(weapon.damageType)}</span>
          </button>
        ))}
      </SheetSection>
      <SheetSection id="player-sheet-features" title="Особенности" emptyLabel="Особенности появятся после заполнения листа">
        {character.features.map((feature) => {
          const detail = feature.text.trim();
          const summary = feature.subtitle || detail || 'Особенность';
          if (!detail) {
            return (
              <article className="player-sheet-row" key={feature.id}>
                <strong>{feature.name}</strong>
                <span>{summary}</span>
              </article>
            );
          }
          return (
            <article className="player-sheet-row player-sheet-row--feature" key={feature.id}>
              <button
                className="player-sheet-feature-toggle"
                type="button"
                onClick={() => onFeaturePreview?.(character, feature)}
              >
                <strong>{feature.name}</strong>
                <span>{summary}</span>
              </button>
            </article>
          );
        })}
      </SheetSection>
      <SheetSection id="player-sheet-domain-cards" title="Карты доменов" emptyLabel="Карты доменов не подготовлены">
        <CharacterSheetDomainCards
          cards={character.loadoutCards}
          onPreview={publishDomainCard}
          onTokenChange={(cardId, next) => characterService.updateDomainCardTokens(character.id, cardId, next)}
        />
      </SheetSection>
      <SheetSection id="player-sheet-gear" title="Инвентарь">
        <article className="player-sheet-row player-sheet-row--feature">
          <button
            className="player-sheet-feature-toggle player-sheet-wealth-toggle"
            type="button"
            onClick={() => onWealthEdit?.(character)}
          >
            <strong>Деньги</strong>
            <span>{formatWealthSummary(character.wealth, { showCoins: game.showCoins })}</span>
          </button>
        </article>
        <article className="player-sheet-row player-sheet-row--feature">
          <button
            className="player-sheet-feature-toggle"
            type="button"
            onClick={() => onFeaturePreview?.(character, {
              id: 'armor',
              name: character.armor.name || 'Броня',
              subtitle: `Пороги ${character.thresholds.major} / ${character.thresholds.severe} · Показатель ${character.armor.score}`,
              text: character.armor.feature,
              sourceLabel: 'Броня'
            })}
          >
            <strong>{character.armor.name || 'Броня'}</strong>
            <span>Пороги {character.thresholds.major} / {character.thresholds.severe} · Показатель {character.armor.score}</span>
          </button>
        </article>
        {character.inventory.filter((item) => item.kind === 'consumable').map((item) => {
          return (
            <article className="player-sheet-row player-sheet-row--consumable" key={item.id}>
              <button
                className="player-sheet-item-main player-sheet-item-main--button"
                type="button"
                onClick={() => onFeaturePreview?.(character, {
                  id: item.id,
                  name: item.name,
                  subtitle: inventoryQuantityLabel(item),
                  text: item.text ?? '',
                  sourceLabel: 'Инвентарь'
                })}
              >
                <strong>{item.name}</strong>
                {inventoryQuantityLabel(item) && <small>{inventoryQuantityLabel(item)}</small>}
              </button>
              <button
                className="player-sheet-use-button"
                type="button"
                disabled={!canUseInventoryItem(item)}
                onClick={() => characterService.useInventoryItem(character.id, item.id)}
              >
                Использовать
              </button>
            </article>
          );
        })}
        {character.inventory.filter((item) => item.kind !== 'consumable').map((item) => {
          return (
            <article className="player-sheet-row player-sheet-row--feature" key={item.id}>
              <button
                className="player-sheet-feature-toggle"
                type="button"
                onClick={() => onFeaturePreview?.(character, {
                  id: item.id,
                  name: item.name,
                  subtitle: inventoryQuantityLabel(item),
                  text: item.text ?? '',
                  sourceLabel: 'Инвентарь'
                })}
              >
                <strong>{item.name}</strong>
                {inventoryQuantityLabel(item) && <small>{inventoryQuantityLabel(item)}</small>}
              </button>
            </article>
          );
        })}
      </SheetSection>
      </aside>
    </div>
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
    feedService.addMessage(character.name, `${beastform.name} · не хватает Надежды`, { title: 'Форма', publication: 'public' });
    return;
  }
  const cost = mode === 'evolution'
    ? `-3 Надежды${evolutionTrait ? `, ${traitLabel(character, evolutionTrait)} +1` : ''}`
    : '+1 Стресс';
  feedService.addMessage(character.name, `${beastform.name} · ${cost}`, { title: 'Форма', publication: 'public' });
}

function traitLabel(character: PlayerViewCharacterSummary, traitId: TraitId): string {
  return character.traits.find((trait) => trait.id === traitId)?.label ?? traitId;
}

function inventoryQuantityLabel(item: PlayerViewCharacterSummary['inventory'][number]): string {
  const parts = [];
  if (item.quantity > 1) parts.push(`x${item.quantity}`);
  const usesLabel = inventoryUsesLabel(item);
  if (usesLabel) parts.push(usesLabel);
  return parts.join(' · ');
}

function inventoryUsesLabel(item: PlayerViewCharacterSummary['inventory'][number]): string {
  if (!item.uses) return '';
  if (item.uses.max <= 1 && item.uses.current === item.uses.max) return '';
  return `${item.uses.current}/${item.uses.max}`;
}

function canUseInventoryItem(item: PlayerViewCharacterSummary['inventory'][number]): boolean {
  if (item.quantity <= 0) return false;
  return item.uses ? item.uses.current > 0 || item.quantity > 1 : true;
}
