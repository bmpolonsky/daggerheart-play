/** @jsxImportSource preact */
import { isStoredWeapon } from '../../../domain/rules/weaponInventory';
import { storedWeaponPresentation } from '../../../domain/rules/storedWeaponPresentation';
import { toastService } from '../../../services/ToastService';
import { useAssetUrl } from '../../components/common/useAssetUrl';
import { AssetImage } from '../../components/common/AssetImage';
import type { ComponentChildren, JSX } from "preact";
import { useMemo, useRef, useState } from "preact/hooks";
import { ChevronLeft, Crosshair, Heart, MapPlus, PawPrint, Pencil, Shield, Swords, Trash2, Zap } from "lucide-react";
import { useStream } from "../../../core/hooks/useStream";
import type { LibraryBeastform } from "../../../domain/content/types";
import { groupPlayerViewFeatures, type PlayerViewCharacterSummary } from "../../../domain/tabletop/playerView";
import type { TableFeedFeaturePreview } from "../../../domain/tabletop/feed";
import { defaultCharacterPortraitUrl } from "../../../domain/tabletop/defaultArt";
import { companionDamageFormula } from "../../../domain/rules/rangerCompanion";
import { CORE_STATUS_TAGS, ActorStatus, normalizeStatusTag } from "../../../domain/rules/statuses";
import type { TraitId } from "../../../domain/rules/types";
import { formatWealthSummary } from "../../../domain/rules/wealthPresentation";
import { gameService, characterService, feedService, sceneTableService } from "../../../services/serviceRegistry";
import { compactDamageTypeLabel, cssImageUrl, signed } from "./helpers";
import { CharacterSheetDomainCards } from "./CharacterSheetDomainCards";
import type { PlayerViewDomainCard } from "./domainCards/types";
import { CharacterRollDialog, prefillWeaponDamage } from "./CharacterRollDialog";
import { PlayerSheetSectionRail, SheetSection, TrackRow } from "./PlayerSheetControls";
import { StatusChips } from "./StatusChips";
import type { PlayerRollDraft, PlayerSheetSectionId, TableViewRole } from "./types";
import { Button } from "../../components/common/Button";
import { Badge } from "../../components/common/Badge";
import { ChoiceCard } from "../../components/common/ChoiceCard";
import { IconButton } from "../../components/common/IconButton";
import { ListItem } from "../../components/common/ListItem";
import { ResourcePips } from "../../components/common/ResourcePips";
import { PLAYER_SHEET_SECTIONS } from "./constants";
import { UsageTrackerControl } from "../../characters/UsageTrackerControl";
import { analyzeFeatureRules } from "../../../domain/rules/featureEffects";
import { SheetFeatureSection } from "./SheetContent";
import { ruleEffectApplicationLabel, uniqueRuleEffectMessages } from "../../components/common/RuleEffectText";
import { CompanionEditorDialog } from "./CompanionEditorDialog";
import { CompendiumRuleTerm } from "./CompendiumRuleTerm";

export function CharacterSheet({
  character,
  beastforms = [],
  role,
  navigation,
  showRuleEffects = false,
  showBackButton = false,
  onBack,
  onDomainCardPreview,
  onFeaturePreview,
  onWealthEdit,
  onBeastformEdit,
  onEdit
}: {
  character: PlayerViewCharacterSummary;
  beastforms?: LibraryBeastform[];
  role: TableViewRole;
  navigation?: ComponentChildren;
  /** Full rule audit belongs to the library sheet, not the compact table-side panel. */
  showRuleEffects?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  onDomainCardPreview?: (character: PlayerViewCharacterSummary, card: PlayerViewDomainCard) => void;
  onFeaturePreview?: (character: PlayerViewCharacterSummary, feature: TableFeedFeaturePreview) => void;
  onWealthEdit?: (character: PlayerViewCharacterSummary) => void;
  onBeastformEdit?: (character: PlayerViewCharacterSummary) => void;
  onEdit?: () => void;
}) {
  const game = useStream(gameService.game$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const [activeSheetSection, setActiveSheetSection] = useState<PlayerSheetSectionId>('overview');
  const sheetRef = useRef<HTMLElement | null>(null);
  const [rollDraftState, setRollDraftState] = useState<{ actorId: string; draft: PlayerRollDraft } | null>(null);
  const rollDraft = rollDraftState?.actorId === character.id ? rollDraftState.draft : null;
  const setRollDraft = (next: PlayerRollDraft | null | ((current: PlayerRollDraft | null) => PlayerRollDraft | null)) => {
    setRollDraftState((current) => {
      const previous = current?.actorId === character.id ? current.draft : null;
      const draft = typeof next === 'function' ? next(previous) : next;
      return draft ? { actorId: character.id, draft } : null;
    });
  };
  const [companionEditorOpen, setCompanionEditorOpen] = useState(false);
  const featureGroups = useMemo(() => groupPlayerViewFeatures(character.features), [character.features]);
  const featureRuleEffects = useMemo(() => character.features.flatMap((feature) => (
    uniqueRuleEffectMessages(analyzeFeatureRules(feature.text).effects).map((effect) => ({ feature, effect }))
  )), [character.features]);
  const canUseBeastform = character.className === 'Druid' || character.features.some((feature) => /зверин|beastform|beast form/i.test(`${feature.name}\n${feature.text}`));
  const sheetFeatureGroups = canUseBeastform && !featureGroups.some(group => group.id === 'class')
    ? [{id: 'class', label: 'Класс', features: []}, ...featureGroups]
    : featureGroups;
  const beastformEntry = canUseBeastform ? <ListItem
    aria-label="Управление звериной формой"
    aria-description={character.activeBeastform ? `Активна: ${character.activeBeastform.name}` : 'Не активна'}
    title="Звериная форма"
    subtitle={character.activeBeastform ? `Активна: ${character.activeBeastform.name}` : 'Не активна'}
    lines={2}
    density="compact"
    onClick={() => onBeastformEdit?.(character)}
  /> : null;
  const canUseCompanion = character.className === 'Ranger' && (
    /зверин|beastbound|beast bound/i.test(character.subtitle) ||
    character.features.some((feature) => /компаньон|companion|зверин/i.test(`${feature.name}\n${feature.text}`))
  );
  const activeScene = sceneTable.scenes[sceneTable.activeSceneId] ?? null;
  const companionToken = activeScene?.tokens.find((token) => token.actor.kind === 'companion' && token.actor.id === character.id) ?? null;
  const portraitUrl = useAssetUrl(defaultCharacterPortraitUrl(character));
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
    const sheet = sheetRef.current;
    const target = targetId ? sheet?.querySelector<HTMLElement>(`#${targetId}`) : null;
    if (!sheet || !target) return;
    sheet.scrollTo({
      behavior: 'smooth',
      top: sheet.scrollTop + target.getBoundingClientRect().top - sheet.getBoundingClientRect().top
    });
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
      {navigation}
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
          <img src={portraitUrl || undefined} alt="" />
          <div className="player-character-panel__hero-copy">
            <strong>{character.name}</strong>
            <span>Уровень {character.level} / {character.subtitle || character.className}</span>
            <div className="player-character-panel__hero-meta" aria-label="Ключевые параметры персонажа">
              <small><CompendiumRuleTerm ruleSlug="proficiency">Мастерство</CompendiumRuleTerm> {character.proficiency}</small>
              {character.spellcastTrait && <small>Заклинание: {character.traits.find((trait) => trait.id === character.spellcastTrait)?.label ?? character.spellcastTrait}</small>}
            </div>
          </div>
        </header>
        {rollDraft && (
        <CharacterRollDialog
          key={character.id}
          character={character}
          draft={rollDraft}
          role={role}
          onTraitChange={(trait) => setRollDraft((current) => current ? { ...current, trait } : current)}
          onClose={() => setRollDraft(null)}
        />
        )}
        <SheetSection id="player-sheet-overview" title="Ресурсы">
        <section className="player-character-panel__hope">
          <header>
            <span><CompendiumRuleTerm ruleSlug="hope">НАДЕЖДА</CompendiumRuleTerm></span>
            <strong>{character.hope.value}/{character.hope.max}</strong>
          </header>
          <ResourcePips
            current={character.hope.value}
            max={character.hope.max}
            tone="hope"
            variant="token"
            label="Надежда"
            showHeader={false}
            onChange={(next) => characterService.adjustHope(character.id, next - character.hope.value)}
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
            <span><CompendiumRuleTerm ruleSlug="minor-damage">Легкий</CompendiumRuleTerm></span>
            <strong>&lt; {character.thresholds.major}</strong>
          </div>
          <div>
            <span><CompendiumRuleTerm ruleSlug="major-damage">Ощутимый</CompendiumRuleTerm></span>
            <strong>{character.thresholds.major}+</strong>
          </div>
          <div>
            <span><CompendiumRuleTerm ruleSlug="severe-damage">Тяжелый</CompendiumRuleTerm></span>
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
            <span><CompendiumRuleTerm ruleSlug="armor" sectionAnchor="reducing-damage">Броня</CompendiumRuleTerm></span>
            <div className="player-defense-row__armor-value">
              <ResourcePips
                current={character.armor.marked}
                max={character.armor.score}
                tone="armor"
                variant="token"
                label="Броня"
                showHeader={false}
                onChange={(next) => characterService.updateArmor(character.id, { markedSlots: next }, false)}
              />
              <strong>{Math.max(0, character.armor.score - character.armor.marked)}/{character.armor.score}</strong>
            </div>
          </div>
        </section>
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
                      ? <AssetImage src={character.companion.imageUrl} alt="" />
                      : <PawPrint size={16} aria-hidden="true" />}
                  </div>
                  <div className="player-companion-panel__copy">
                    <strong>{character.companion.name}</strong>
                    <span>Уклонение {character.companion.evasion}</span>
                  </div>
                  <div className="player-companion-panel__stress">
                    <span><CompendiumRuleTerm ruleSlug="stress">Стресс</CompendiumRuleTerm></span>
                    <ResourcePips
                      current={character.companion.stress.marked}
                      max={character.companion.stress.max}
                      tone="stress"
                      variant="token"
                      label="Стресс компаньона"
                      showHeader={false}
                      onChange={(next) => characterService.markCompanionStress(character.id, next - character.companion!.stress.marked)}
                    />
                    <strong>{character.companion.stress.marked}/{character.companion.stress.max}</strong>
                  </div>
                </div>
                <ListItem
                  density="compact"
                  title={character.companion.attackName}
                  className="player-sheet-weapon-row"
                  subtitle={`${character.companion.attackRange} / ${companionDamageFormula(character.companion, character.proficiency)} ${compactDamageTypeLabel(character.companion.attackDamageType)}`}
                  tone="featured"
                  rightAccessory={<span className="player-sheet-weapon-actions">
                    <Button size="xs" variant="ghost" onClick={(event) => { event.stopPropagation(); setRollDraft({ kind: 'companion', title: character.companion!.attackName, subtitle: character.companion!.name, trait: character.spellcastTrait ?? 'instinct', damageFormula: character.companion!.attackFormula, damageType: character.companion!.attackDamageType }); }}>Атака</Button>
                    <Button size="xs" variant="ghost" onClick={(event) => { event.stopPropagation(); prefillWeaponDamage(character, { name: character.companion!.attackName, damageFormula: character.companion!.attackFormula, damageType: character.companion!.attackDamageType }, true); }}>Урон</Button>
                  </span>}
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
            actorId={character.id}
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
            onAddCustom={(draft) => characterService.addCustomCondition(character.id, draft)}
            onUpdateCustom={(conditionId, draft) => characterService.updateCustomCondition(character.id, conditionId, draft)}
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
            className="player-sheet-weapon-row"
            subtitle={`${weapon.traitLabel} / ${weapon.range} / ${weapon.damage} ${compactDamageTypeLabel(weapon.damageType)}`}
            tone="featured"
            rightAccessory={<span className="player-sheet-weapon-actions">
              <Button size="xs" variant="ghost" onClick={(event) => { event.stopPropagation(); setRollDraft({ kind: 'weapon', title: weapon.name, subtitle: weapon.range, trait: weapon.trait, damageFormula: weapon.damageFormula, damageType: weapon.damageType }); }}>Атака</Button>
              <Button size="xs" variant="ghost" onClick={(event) => { event.stopPropagation(); prefillWeaponDamage(character, weapon); }}>Урон</Button>
              {!weapon.id.startsWith('beastform:') && <Button size="xs" variant="ghost" aria-label={`Снять оружие ${weapon.name}`} onClick={(event) => {
              event.stopPropagation();
              const result = characterService.unequipWeapon(character.id, weapon.id);
              if (!result.applied) toastService.show(result.message ?? 'Не удалось снять оружие.', 'error');
            }}>Снять</Button>}</span>}
            onClick={() => onFeaturePreview?.(character, {
              id: weapon.id,
              sourceId: weapon.sourceId,
              slug: weapon.sourceSlug,
              collection: weapon.id.startsWith('beastform:') ? 'beastform' : 'equipment',
              weaponFormula: weapon.damageFormula,
              name: weapon.name,
              subtitle: `${weapon.traitLabel} / ${weapon.range} / ${weapon.damage} ${compactDamageTypeLabel(weapon.damageType)}`,
              text: weapon.featureText ?? weapon.notes ?? '',
              sourceLabel: 'Оружие'
            })}
          />
        ))}
      </SheetSection>
      {showRuleEffects && beastformEntry && <SheetSection title="Классовые способности">{beastformEntry}</SheetSection>}
      {showRuleEffects ? (
        <SheetFeatureSection
          id="player-sheet-features"
          title="Свойства"
          emptyLabel="Свойства появятся после заполнения листа"
          features={character.features}
          macroActor={character}
          highlightRuleEffects
          rightAccessory={(feature) => {
            const trackers = character.usageTrackers.filter((item) => item.targetKind === 'feature' && item.targetId === feature.id);
            return trackers.length > 0 ? <>{trackers.map((tracker) => (
              <UsageTrackerControl
                key={tracker.id}
                compact
                characterId={character.id}
                targetKind="feature"
                targetId={feature.id}
                targetName={feature.name || 'Особенность'}
                tracker={tracker}
              />
            ))}</> : null;
          }}
        />
      ) : (
        <SheetSection id="player-sheet-features" title="Свойства" emptyLabel="Свойства появятся после заполнения листа">
          {sheetFeatureGroups.map((group) => (
            <section className="player-sheet-feature-group" aria-label={`Свойства: ${group.label}`} key={group.id}>
              <h4>{group.label}</h4>
              {group.id === 'class' && beastformEntry}
              {group.features.map((feature) => {
                return (
                  <ListItem
                    aria-label={feature.name}
                    density="compact"
                    key={feature.id}
                    title={<span className="player-sheet-feature-title">{canUseBeastform && group.id === 'class' && /^(звериная форма|beastform|beast form)$/i.test(feature.name.trim()) ? 'Правила звериной формы' : feature.name}{feature.subtitle && <Badge size="xs">{feature.subtitle}</Badge>}</span>}
                    onClick={() => onFeaturePreview?.(character, feature)}
                  />
                );
              })}
            </section>
          ))}
        </SheetSection>
      )}
      {showRuleEffects && (
        <SheetSection title="Эффекты правил" emptyLabel="Распознанных эффектов нет">
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
          cards={character.domainCards}
          handLimit={character.handLimit}
          onPreview={publishDomainCard}
        />
      </SheetSection>
      <SheetSection id="player-sheet-gear" title="Инвентарь">
        <ListItem
          title="Деньги"
          subtitle={formatWealthSummary(character.wealth, { showCoins: game.showCoins })}
          lines={2}
          onClick={() => onWealthEdit?.(character)}
        />
        <ListItem
          title={character.armor.name || 'Броня'}
          rightAccessory={<Button size="xs" variant="ghost" onClick={() => characterService.setArmorEquipped(character.id, !character.armor.equipped)}>{character.armor.equipped ? 'Снять броню' : 'Надеть броню'}</Button>}
          subtitle={character.armor.equipped ? `Пороги ${character.thresholds.major} / ${character.thresholds.severe} — показатель ${character.armor.score}` : 'Не надета'}
          lines={2}
          onClick={() => onFeaturePreview?.(character, {
              id: 'armor',
              name: character.armor.name || 'Броня',
              subtitle: character.armor.equipped ? `Пороги ${character.thresholds.major} / ${character.thresholds.severe} — показатель ${character.armor.score}` : 'Не надета',
              text: character.armor.feature,
              sourceLabel: 'Броня'
            })}
        />
        {character.inventory.filter((item) => item.kind === 'consumable').map((item) => {
          return (
            <ListItem
              className="player-sheet-inventory-row"
              density="compact"
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
            />
          );
        })}
        {character.inventory.filter((item) => item.kind !== 'consumable').map((item) => {
          const storedWeapon = storedWeaponPresentation(item);
          const quantityLabel = item.weapon !== undefined && !isStoredWeapon(item.weapon)
            ? 'Данные оружия неполны. Предмет сохранён, но надеть его нельзя.'
            : inventoryQuantityLabel(item);
          return (
            <ListItem
              className="player-sheet-inventory-row"
              key={item.id}
              title={item.name}
              subtitle={quantityLabel}
              density={quantityLabel ? 'regular' : 'compact'}
              lines={quantityLabel ? 2 : 1}
              rightAccessory={item.weapon !== undefined ? <Button size="xs" variant="ghost" disabled={!isStoredWeapon(item.weapon)} aria-label={`Надеть оружие ${item.name}`} onClick={() => {
                const result = characterService.equipInventoryWeapon(character.id, item.id);
                if (!result.applied) toastService.show(result.message ?? 'Не удалось надеть оружие.', 'error');
              }}>Надеть оружие</Button> : undefined}
              onClick={() => onFeaturePreview?.(character, {
                  id: item.id,
                  sourceId: storedWeapon?.sourceId ?? item.sourceId,
                  slug: storedWeapon?.sourceSlug,
                  collection: 'equipment',
                  weaponFormula: storedWeapon?.baseDamageFormula,
                  name: item.name,
                  subtitle: storedWeapon ? `Снятое оружие / Базовый урон ${storedWeapon.baseDamageFormula}` : quantityLabel,
                  text: storedWeapon?.description ?? item.text ?? '',
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
