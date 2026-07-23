/** @jsxImportSource preact */
import type { JSX } from "preact";
import { useMemo, useRef, useState } from "preact/hooks";
import { ChevronLeft, Crosshair, Heart, MapPlus, PawPrint, Pencil, Shield, Swords, Trash2, Zap } from "lucide-react";
import { useStream } from "../../../core/hooks/useStream";
import type { LibraryBeastform } from "../../../domain/content/types";
import type { PlayerViewCharacterSummary } from "../../../domain/tabletop/playerView";
import type { TableFeedFeaturePreview } from "../../../domain/tabletop/feed";
import { defaultCharacterPortraitUrl } from "../../../domain/tabletop/defaultArt";
import { scaleWeaponFormulaByProficiency } from "../../../domain/rules/diceFormula";
import { characterLevelRank } from "../../../domain/rules/levelUp";
import { companionDamageFormula } from "../../../domain/rules/rangerCompanion";
import { CORE_STATUS_TAGS, ActorStatus, normalizeStatusTag } from "../../../domain/rules/statuses";
import type { DamageType, TraitId } from "../../../domain/rules/types";
import { formatWealthSummary } from "../../../domain/rules/wealthPresentation";
import { gameService, characterService, diceService, feedService, p2pSessionService, sceneTableService } from "../../../services/serviceRegistry";
import { compactDamageTypeLabel, cssImageUrl, signed } from "./helpers";
import { CharacterSheetDomainCards } from "./CharacterSheetDomainCards";
import type { PlayerViewDomainCard } from "./domainCards/types";
import { PlayerRollConfirm } from "./PlayerRollConfirm";
import { PlayerSheetSectionRail, SheetSection, TrackDots, TrackRow } from "./PlayerSheetControls";
import { StatusChips } from "./StatusChips";
import type { PlayerRollDraft, PlayerSheetSectionId, TableViewRole } from "./types";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { ChoiceCard } from "../../components/common/ChoiceCard";
import { SelectControl } from "../../components/common/Field";
import { IconButton } from "../../components/common/IconButton";
import { ListItem } from "../../components/common/ListItem";
import { RichChoicePicker } from "../../components/common/RichChoicePicker";
import { PLAYER_SHEET_SECTIONS } from "./constants";
import { UsageTrackerControl } from "../../characters/UsageTrackerControl";
import { analyzeFeatureRules, type FeatureUsageLimitEffect } from "../../../domain/rules/featureEffects";
import { SheetFeatureSection } from "./SheetContent";
import { ruleEffectApplicationLabel, uniqueRuleEffectMessages } from "../../components/common/RuleEffectText";
import { CompanionEditorDialog } from "./CompanionEditorDialog";
import { CompendiumRuleTerm } from "./CompendiumRuleTerm";

export function CharacterSheet({
  character,
  beastforms = [],
  role,
  showRuleEffects = false,
  showBackButton = false,
  onBack,
  onDomainCardPreview,
  onFeaturePreview,
  onWealthEdit,
  onEdit
}: {
  character: PlayerViewCharacterSummary;
  beastforms?: LibraryBeastform[];
  role: TableViewRole;
  /** Full rule audit belongs to the library sheet, not the compact table-side panel. */
  showRuleEffects?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  onDomainCardPreview?: (character: PlayerViewCharacterSummary, card: PlayerViewDomainCard) => void;
  onFeaturePreview?: (character: PlayerViewCharacterSummary, feature: TableFeedFeaturePreview) => void;
  onWealthEdit?: (character: PlayerViewCharacterSummary) => void;
  onEdit?: () => void;
}) {
  const game = useStream(gameService.game$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const [activeSheetSection, setActiveSheetSection] = useState<PlayerSheetSectionId>('overview');
  const sheetRef = useRef<HTMLElement | null>(null);
  const [rollDraft, setRollDraft] = useState<PlayerRollDraft | null>(null);
  const [selectedBeastformId, setSelectedBeastformId] = useState('');
  const [companionEditorOpen, setCompanionEditorOpen] = useState(false);
  const [evolutionTrait, setEvolutionTrait] = useState(character.traits[0]?.id ?? 'agility');
  const availableBeastforms = useMemo(() => {
    const rank = characterLevelRank(character.level);
    return beastforms.filter((beastform) => beastform.tier <= rank);
  }, [beastforms, character.level]);
  const featureRuleEffects = useMemo(() => character.features.flatMap((feature) => (
    uniqueRuleEffectMessages(analyzeFeatureRules(feature.text).effects).map((effect) => ({ feature, effect }))
  )), [character.features]);
  const selectedBeastform = availableBeastforms.find((beastform) => beastform.id === selectedBeastformId) ?? availableBeastforms[0] ?? null;
  const canUseBeastform = character.className === 'Druid' || character.features.some((feature) => /зверин|beastform|beast form/i.test(`${feature.name}\n${feature.text}`));
  const canUseCompanion = character.className === 'Ranger' && (
    /зверин|beastbound|beast bound/i.test(character.subtitle) ||
    character.features.some((feature) => /компаньон|companion|зверин/i.test(`${feature.name}\n${feature.text}`))
  );
  const activeScene = sceneTable.scenes[sceneTable.activeSceneId] ?? null;
  const companionToken = activeScene?.tokens.find((token) => token.actor.kind === 'companion' && token.actor.id === character.id) ?? null;
  const portraitUrl = defaultCharacterPortraitUrl(character);
  const heroStyle = {
    '--player-character-portrait': `url("${cssImageUrl(portraitUrl)}")`
  } as JSX.CSSProperties;
  const publishDomainCard = (cardId: string) => {
    const card = character.domainCards.find((item) => item.id === cardId);
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
  const selectSheetSection = (sectionId: PlayerSheetSectionId) => {
    setActiveSheetSection(sectionId);
    const targetId = PLAYER_SHEET_SECTIONS.find((section) => section.id === sectionId)?.target;
    if (!targetId) return;
    sheetRef.current?.querySelector<HTMLElement>(`#${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const trackVisibleSection = (event: Event) => {
    const sheet = event.currentTarget as HTMLElement;
    const threshold = sheet.getBoundingClientRect().top + Math.min(110, sheet.clientHeight * 0.22);
    let nextSection: PlayerSheetSectionId = 'overview';
    PLAYER_SHEET_SECTIONS.forEach((section) => {
      const target = sheet.querySelector<HTMLElement>(`#${section.target}`);
      if (target && target.getBoundingClientRect().top <= threshold) nextSection = section.id;
    });
    setActiveSheetSection((current) => current === nextSection ? current : nextSection);
  };
  return (
    <div className="player-character-panel-shell">
      <PlayerSheetSectionRail activeSheetSection={activeSheetSection} onSelect={selectSheetSection} />
      <aside ref={sheetRef} className="player-character-panel" aria-label="Персонаж игрока" data-vtt-side-panel onScroll={trackVisibleSection}>
        <header className="player-character-panel__hero" style={heroStyle}>
          {showBackButton && (
            <IconButton className="player-character-panel__back" variant="ghost" size="sm" type="button" title="К ростеру" aria-label="К ростеру" onClick={onBack}>
              <ChevronLeft size={17} aria-hidden="true" />
            </IconButton>
          )}
          {onEdit && (
            <Button className="player-character-panel__edit" size="xs" variant="ghost" iconBefore={<Pencil size={13} aria-hidden="true" />} onClick={onEdit}>
              Редактировать
            </Button>
          )}
          <img src={cssImageUrl(portraitUrl)} alt="" />
          <div className="player-character-panel__hero-copy">
            <strong>{character.name}</strong>
            <span>Уровень {character.level} / {character.subtitle || character.className}</span>
            <div className="player-character-panel__hero-meta" aria-label="Ключевые параметры персонажа">
              <small><CompendiumRuleTerm ruleSlug="proficiency">Мастерство</CompendiumRuleTerm> {character.proficiency}</small>
              {character.spellcastTrait && <small>Характеристика заклинателя: {character.traits.find((trait) => trait.id === character.spellcastTrait)?.label ?? character.spellcastTrait}</small>}
            </div>
          </div>
        </header>
        {rollDraft && (
        <PlayerRollConfirm
          character={character}
          draft={rollDraft}
          experiences={rollDraft.kind === 'companion' ? character.companion?.experiences : undefined}
          forceSpendHopeForExperiences={rollDraft.kind === 'companion'}
          onTraitChange={(trait) => setRollDraft((current) => current ? { ...current, trait } : current)}
          onClose={() => setRollDraft(null)}
          onRoll={(rollOptions, rollType, publication) => {
            const rollNotes = 'notes' in rollDraft ? rollDraft.notes : undefined;
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
                  notes: rollNotes
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
              notes: rollNotes
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
          onDamage={rollDraft.kind === 'weapon' || rollDraft.kind === 'companion' ? ({ publication }) => {
            const damageFormula = scaleWeaponFormulaByProficiency(rollDraft.damageFormula, character.proficiency);
            const damageNotes = rollDraft.kind === 'companion'
              ? `Компаньон: ${rollDraft.title}`
              : `Оружие: ${rollDraft.title}`;
            const damageActorName = rollDraft.kind === 'companion'
              ? character.companion?.name ?? character.name
              : character.name;
            if (role === 'player' && p2pSessionService.isConnectedPlayerSession()) {
              void p2pSessionService.submitPlayerRollIntent({
                actorId: character.id,
                actorName: damageActorName,
                publication,
                intent: {
                  type: 'damage',
                  formula: damageFormula,
                  damageType: rollDraft.damageType as DamageType,
                  notes: damageNotes
                }
              });
              setRollDraft(null);
              return;
            }
            diceService.rollDamage({
              actorId: character.id,
              actorName: damageActorName,
              formula: damageFormula,
              damageType: rollDraft.damageType as DamageType,
              publication,
              notes: damageNotes
            });
            setRollDraft(null);
          } : undefined}
        />
        )}
        <SheetSection id="player-sheet-overview" title="Ресурсы">
        <section className="player-character-panel__hope">
          <header>
            <span><CompendiumRuleTerm ruleSlug="hope">НАДЕЖДА</CompendiumRuleTerm></span>
            <strong>{character.hope.value}/{character.hope.max}</strong>
          </header>
          <TrackDots
            value={character.hope.value}
            max={character.hope.max}
            tone="hope"
            label="Надежда"
            onSet={(next) => characterService.adjustHope(character.id, next - character.hope.value)}
          />
          {character.scars.length > 0 && (
            <div className="player-character-panel__scars">
              {character.scars.map((scar) => (
                <span key={scar.id}>
                  Шрам: {scar.description}
                  {role === 'gm' && (
                    <Button size="xs" variant="ghost" type="button" onClick={() => characterService.healScar(character.id, scar.id)}>
                      Исцелить
                    </Button>
                  )}
                </span>
              ))}
            </div>
          )}
        </section>
        <section className="player-track-list">
          <TrackRow
            icon={<Heart size={16} />}
            label={<CompendiumRuleTerm ruleSlug="hit-points">Раны</CompendiumRuleTerm>}
            labelText="Раны"
            value={character.hp.marked}
            max={character.hp.max}
            tone="hp"
            onSet={setHpSlots}
          />
          <TrackRow
            icon={<Zap size={16} />}
            label={<CompendiumRuleTerm ruleSlug="stress">Стресс</CompendiumRuleTerm>}
            labelText="Стресс"
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
        <section className="player-defense-row" aria-label="Защита">
          <div className="player-defense-row__evasion">
            <Shield size={16} />
            <span><CompendiumRuleTerm ruleSlug="evasion">Уклонение</CompendiumRuleTerm></span>
            <strong>{character.evasion}</strong>
          </div>
          <div className="player-defense-row__armor">
            <Swords size={16} />
            <span><CompendiumRuleTerm ruleSlug="armor">Броня</CompendiumRuleTerm></span>
            <div className="player-defense-row__armor-value">
              <TrackDots
                value={character.armor.marked}
                max={character.armor.score}
                tone="armor"
                label="Броня"
                onSet={(next) => characterService.updateArmor(character.id, { markedSlots: next }, false)}
              />
              <strong>{Math.max(0, character.armor.score - character.armor.marked)}/{character.armor.score}</strong>
            </div>
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
                    description: [beastform.summary, beastform.advantages, beastform.featureText].filter(Boolean).join('\n\n')
                  }))}
                  onChange={setSelectedBeastformId}
                />
                <SelectControl value={evolutionTrait} onChange={(event) => setEvolutionTrait(event.currentTarget.value as TraitId)} aria-label="Характеристика Эволюции">
                  {character.traits.map((trait) => <option key={trait.id} value={trait.id}>{trait.label}</option>)}
                </SelectControl>
                <Button size="sm" variant="secondary" type="button" disabled={!selectedBeastform} onClick={() => selectedBeastform && enterBeastform(character, selectedBeastform, 'stress')}>
                  Форма
                </Button>
                <Button size="sm" variant="primary" type="button" disabled={!selectedBeastform || character.hope.value < 3} onClick={() => selectedBeastform && enterBeastform(character, selectedBeastform, 'evolution', evolutionTrait)}>
                  Эволюция
                </Button>
              </div>
            )}
          </section>
        )}
        {canUseCompanion && (
          <section className="player-companion-panel" aria-label="Компаньон следопыта">
            <header>
              <span>
                <CompendiumRuleTerm ruleSlug="ranger-companion" sectionAnchor="using-spellcast-rolls-hope-and-experiences">
                  Компаньон
                </CompendiumRuleTerm>
              </span>
              {character.companion && (
                <div className="player-companion-panel__header-actions">
                  <IconButton size="xs" variant="ghost" title="Редактировать компаньона" aria-label={`Редактировать компаньона ${character.companion.name}`} onClick={() => setCompanionEditorOpen(true)}>
                    <Pencil size={13} aria-hidden="true" />
                  </IconButton>
                  {role === 'gm' && activeScene && (
                    companionToken ? (
                      <IconButton size="xs" variant="ghost" tone="danger" title="Убрать со сцены" aria-label={`Убрать ${character.companion.name} со сцены`} onClick={() => sceneTableService.removeTokenFromSceneInScene(activeScene.id, companionToken.id)}>
                        <Trash2 size={13} aria-hidden="true" />
                      </IconButton>
                    ) : (
                      <IconButton size="xs" variant="secondary" title="Добавить на сцену" aria-label={`Добавить ${character.companion.name} на сцену`} onClick={() => sceneTableService.addActorTokenToScene(activeScene.id, { kind: 'companion', id: character.id })}>
                        <MapPlus size={13} aria-hidden="true" />
                      </IconButton>
                    )
                  )}
                </div>
              )}
            </header>
            {character.rangerMark && (
              <div className="player-companion-panel__mark">
                <Crosshair size={14} />
                <span>Метка: {character.rangerMark.targetName}</span>
                <Button size="xs" variant="ghost" type="button" onClick={() => characterService.clearRangerMark(character.id)}>Снять</Button>
              </div>
            )}
            {character.companion ? (
              <div className="player-companion-panel__body">
                <div className="player-companion-panel__identity">
                  <div className="player-companion-panel__avatar">
                    {character.companion.imageUrl
                      ? <img src={cssImageUrl(character.companion.imageUrl)} alt="" />
                      : <PawPrint size={16} aria-hidden="true" />}
                  </div>
                  <div className="player-companion-panel__copy">
                    <strong>{character.companion.name}</strong>
                    <span>Уклонение {character.companion.evasion}</span>
                  </div>
                  <div className="player-companion-panel__stress">
                    <span><CompendiumRuleTerm ruleSlug="stress">Стресс</CompendiumRuleTerm></span>
                    <TrackDots
                      value={character.companion.stress.marked}
                      max={character.companion.stress.max}
                      tone="stress"
                      label="Стресс компаньона"
                      onSet={(next) => characterService.markCompanionStress(character.id, next - character.companion!.stress.marked)}
                    />
                    <strong>{character.companion.stress.marked}/{character.companion.stress.max}</strong>
                  </div>
                </div>
                <ListItem
                  density="compact"
                  title={character.companion.attackName}
                  subtitle={`${character.companion.attackRange} / ${companionDamageFormula(character.companion, character.proficiency)} ${compactDamageTypeLabel(character.companion.attackDamageType)}`}
                  tone="featured"
                  onClick={() => setRollDraft({
                    kind: 'companion',
                    title: character.companion?.attackName ?? 'Атака компаньона',
                    subtitle: `${character.companion?.name ?? 'Компаньон'} / Бросок Заклинания`,
                    trait: character.spellcastTrait ?? 'instinct',
                    damageFormula: character.companion?.attackFormula ?? '1d6',
                    damageType: character.companion?.attackDamageType ?? 'physical',
                    difficulty: 0,
                    notes: `Команда компаньону: ${character.companion?.name ?? 'Компаньон'}`
                  })}
                />
                {character.companion.unavailableUntilLongRest && <small>Недоступен до продолжительного отдыха</small>}
              </div>
            ) : (
              <Button className="player-companion-panel__create" size="sm" variant="secondary" type="button" onClick={() => setCompanionEditorOpen(true)} iconBefore={<PawPrint size={16} aria-hidden="true" />}>
                Создать
              </Button>
            )}
          </section>
        )}
        {companionEditorOpen && (
          <CompanionEditorDialog
            companion={character.companion}
            onClose={() => setCompanionEditorOpen(false)}
            onSave={(input) => {
              characterService.ensureRangerCompanion(character.id, input);
              setCompanionEditorOpen(false);
            }}
          />
        )}
        <section className="player-sheet-status-block">
          <header>
            <span><CompendiumRuleTerm ruleSlug="condition">Состояния</CompendiumRuleTerm></span>
          </header>
          <StatusChips
            conditions={character.conditions}
            options={CORE_STATUS_TAGS}
            onAdd={addStatus}
            onRemove={removeStatus}
          />
        </section>
        </SheetSection>
      <SheetSection
        id="player-sheet-traits"
        title={(
          <span className="player-sheet-heading-terms">
            <CompendiumRuleTerm ruleSlug="character-traits">Характеристики</CompendiumRuleTerm>
            <span>{'\u00a0и\u00a0'}</span>
            <CompendiumRuleTerm ruleSlug="experience" sectionAnchor="using-experiences">опыт</CompendiumRuleTerm>
          </span>
        )}
      >
        <section className="player-trait-grid">
          {character.traits.map((trait) => (
            <ChoiceCard key={trait.id} onClick={() => setRollDraft({ kind: 'trait', title: trait.label, subtitle: `${character.name} / ${signed(trait.value)}`, trait: trait.id })}>
              <span><CompendiumRuleTerm ruleSlug={trait.id} tooltipOnly>{trait.label}</CompendiumRuleTerm></span>
              <strong>{signed(trait.value)}</strong>
            </ChoiceCard>
          ))}
        </section>
        {character.experiences.map((experience) => (
          <ListItem key={experience.id} title={experience.name} value={signed(experience.modifier)} density="compact" />
        ))}
      </SheetSection>
      <SheetSection id="player-sheet-actions" title="Оружие" emptyLabel="Оружие не выбрано">
        {character.weapons.map((weapon) => (
          <ListItem
            key={weapon.id}
            title={weapon.name}
            subtitle={`${weapon.traitLabel} / ${weapon.range} / ${weapon.damage} ${compactDamageTypeLabel(weapon.damageType)}`}
            tone="featured"
            onClick={() => setRollDraft({ kind: 'weapon', title: weapon.name, subtitle: `${weapon.traitLabel} / ${weapon.range} / ${weapon.damage} ${compactDamageTypeLabel(weapon.damageType)}`, trait: weapon.trait, damageFormula: weapon.damageFormula, damageType: weapon.damageType })}
          />
        ))}
      </SheetSection>
      {showRuleEffects ? (
        <SheetFeatureSection
          id="player-sheet-features"
          title="Свойства"
          emptyLabel="Свойства появятся после заполнения листа"
          features={character.features}
          highlightRuleEffects
          rightAccessory={(feature) => {
            const suggestedUsage = featureUsageSuggestion(feature.text, feature.name, character.features);
            return (
              <UsageTrackerControl
                compact
                characterId={character.id}
                targetKind="feature"
                targetId={feature.id}
                targetName={feature.name || 'Особенность'}
                tracker={character.usageTrackers.find((item) => item.targetKind === 'feature' && item.targetId === feature.id)}
                suggestedUsage={suggestedUsage}
                onlyWhenSuggested
              />
            );
          }}
        />
      ) : (
        <SheetSection id="player-sheet-features" title="Свойства" emptyLabel="Свойства появятся после заполнения листа">
          {character.features.map((feature) => {
            const detail = feature.text.trim();
            const summary = feature.subtitle || detail || 'Особенность';
            const tracker = character.usageTrackers.find((item) => item.targetKind === 'feature' && item.targetId === feature.id);
            if (!detail) {
              return (
                <ListItem
                  key={feature.id}
                  title={(
                    <span className="player-sheet-feature-title">
                      {feature.name}
                      <Badge size="xs">{feature.sourceLabel}</Badge>
                    </span>
                  )}
                  subtitle={summary}
                  lines={2}
                  rightAccessory={<UsageTrackerControl compact characterId={character.id} targetKind="feature" targetId={feature.id} targetName={feature.name} tracker={tracker} />}
                />
              );
            }
            return (
              <ListItem
                key={feature.id}
                title={(
                  <span className="player-sheet-feature-title">
                    {feature.name}
                    <Badge size="xs">{feature.sourceLabel}</Badge>
                  </span>
                )}
                subtitle={summary}
                lines={2}
                rightAccessory={<UsageTrackerControl compact characterId={character.id} targetKind="feature" targetId={feature.id} targetName={feature.name} tracker={tracker} />}
                onClick={() => onFeaturePreview?.(character, feature)}
              />
            );
          })}
        </SheetSection>
      )}
      {showRuleEffects && (
        <SheetSection title="Эффекты правил" emptyLabel="В свойствах персонажа не распознано автоматических или отслеживаемых эффектов">
          {featureRuleEffects.map(({ feature, effect }) => (
            <ListItem
              key={`${feature.id}:${effect.id}`}
              title={feature.name}
              subtitle={effect.summary}
              value={ruleEffectApplicationLabel(effect)}
              density="compact"
            />
          ))}
        </SheetSection>
      )}
      <SheetSection id="player-sheet-domain-cards" title="Карты доменов" emptyLabel="Карты доменов не подготовлены">
        <CharacterSheetDomainCards
          characterId={character.id}
          cards={character.domainCards}
          handLimit={character.handLimit}
          usageTrackers={character.usageTrackers}
          onPreview={publishDomainCard}
          onTokenChange={(cardId, next) => characterService.updateDomainCardTokens(character.id, cardId, next)}
        />
      </SheetSection>
      <SheetSection id="player-sheet-gear" title="Снаряжение">
        <ListItem
          title="Деньги"
          subtitle={formatWealthSummary(character.wealth, { showCoins: game.showCoins })}
          lines={2}
          onClick={() => onWealthEdit?.(character)}
        />
        <ListItem
          title={character.armor.name || 'Броня'}
          subtitle={`Пороги ${character.thresholds.major} / ${character.thresholds.severe} — показатель ${character.armor.score}`}
          lines={2}
          onClick={() => onFeaturePreview?.(character, {
              id: 'armor',
              name: character.armor.name || 'Броня',
              subtitle: `Пороги ${character.thresholds.major} / ${character.thresholds.severe} — показатель ${character.armor.score}`,
              text: character.armor.feature,
              sourceLabel: 'Броня'
            })}
        />
        {character.inventory.filter((item) => item.kind === 'consumable').map((item) => {
          return (
            <ListItem
              key={item.id}
              title={item.name}
              subtitle={inventoryQuantityLabel(item)}
              lines={2}
              onClick={() => onFeaturePreview?.(character, {
                id: item.id,
                name: item.name,
                subtitle: inventoryQuantityLabel(item),
                text: item.text ?? '',
                sourceLabel: 'Инвентарь'
              })}
              rightAccessory={
                <Button
                  className="player-sheet-use-action"
                  variant="secondary"
                  size="sm"
                  type="button"
                  disabled={!canUseInventoryItem(item)}
                  onClick={() => characterService.useInventoryItem(character.id, item.id)}
                >
                  Использовать
                </Button>
              }
            />
          );
        })}
        {character.inventory.filter((item) => item.kind !== 'consumable').map((item) => {
          const quantityLabel = inventoryQuantityLabel(item);
          return (
            <ListItem
              key={item.id}
              title={item.name}
              subtitle={quantityLabel}
              density={quantityLabel ? 'regular' : 'compact'}
              lines={quantityLabel ? 2 : 1}
              onClick={() => onFeaturePreview?.(character, {
                  id: item.id,
                  name: item.name,
                  subtitle: quantityLabel,
                  text: item.text ?? '',
                  sourceLabel: 'Инвентарь'
                })}
            />
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

function inventoryQuantityLabel(item: PlayerViewCharacterSummary['inventory'][number]): string {
  const parts = [];
  if (item.quantity > 1) parts.push(`x${item.quantity}`);
  const usesLabel = inventoryUsesLabel(item);
  if (usesLabel) parts.push(usesLabel);
  return parts.join(' — ');
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

export function featureUsageSuggestion(
  text: string,
  featureName = '',
  allFeatures: readonly Pick<TableFeedFeaturePreview, 'name' | 'text'>[] = []
): FeatureUsageLimitEffect | null {
  const normalizedName = normalizeFeatureName(featureName);
  const override = normalizedName ? allFeatures.flatMap((feature) => analyzeFeatureRules(feature.text).effects).find((effect): effect is FeatureUsageLimitEffect => (
    effect.kind === 'usageLimit' &&
    effect.scope === 'targetFeature' &&
    normalizeFeatureName(effect.targetLabel ?? '') === normalizedName
  )) : null;
  if (override) return { ...override, scope: 'feature' };
  return analyzeFeatureRules(text).effects.find((effect): effect is FeatureUsageLimitEffect => (
    effect.kind === 'usageLimit' && effect.scope === 'feature'
  )) ?? null;
}

function normalizeFeatureName(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim();
}
