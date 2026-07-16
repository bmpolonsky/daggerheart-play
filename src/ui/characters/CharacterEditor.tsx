import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/common/Avatar';
import { Button } from '../components/common/Button';
import { Checkbox } from '../components/common/Checkbox';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Dialog } from '../components/common/Dialog';
import { NumberField, SelectField, TextAreaField, TextField } from '../components/common/Field';
import { IconButton } from '../components/common/IconButton';
import { InlineStat } from '../components/common/InlineStat';
import { ImageFilePicker } from '../components/common/ImageFilePicker';
import { ListItem } from '../components/common/ListItem';
import { Notice } from '../components/common/Notice';
import { SectionHeader } from '../components/common/SectionHeader';
import { TabButton, Tabs } from '../components/common/Tabs';
import { Toolbar } from '../components/common/Toolbar';
import { WizardStepButton } from '../components/common/WizardStepButton';
import { CLASS_DOMAINS, CLASS_LABELS, DAGGERHEART_CLASSES, DOMAIN_LABELS, TRAIT_LABELS } from '../../domain/rules/constants';
import type { ContentState, GenericLibraryItem, LibraryEquipmentItem } from '../../domain/content/types';
import { classDomainsFor, domainCardFromLibrary, filterBuilderContent, isSubclassForClass } from '../../domain/characterBuilder';
import { buildEquipmentAttachmentPlan } from '../../domain/rules/equipment';
import {
  characterHandSize,
  levelUpAdvancementChoiceCount,
  levelUpDomainCardCount,
  type CharacterRuleModifier
} from '../../domain/rules/characterRuleModifiers';
import { advancementChoiceLabel, buildCharacterLevelUpPlan, CHARACTER_ADVANCEMENT_CHOICES, formatLevelUpNotes, type CharacterAdvancementChoiceId, type CharacterLevelUpApplicationInput } from '../../domain/rules/levelUp';
import type { Character, CharacterChangeActor, CharacterSheetCard, DaggerheartClass, DomainName, TraitId } from '../../domain/rules/types';
import { characterService } from '../../services/serviceRegistry';
import { readFileAsDataUrl } from '../vtt/playerView/sharedTools/readFileAsDataUrl';
import { TraitGrid } from './TraitGrid';
import { ResourcePanel } from './ResourcePanel';
import { ExperienceList } from './ExperienceList';
import { LoadoutPanel } from './LoadoutPanel';
import { CharacterHistoryPanel } from './CharacterHistoryPanel';

type CharacterEditorSection = 'identity' | 'stats' | 'resources' | 'loadout' | 'notes' | 'history';

export function CharacterEditor({
  character,
  content,
  role = 'gm',
  actor
}: {
  character: Character;
  content?: ContentState;
  role?: 'gm' | 'player';
  actor?: CharacterChangeActor;
}) {
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [section, setSection] = useState<CharacterEditorSection>('resources');
  const builderContent = content ? filterBuilderContent(content.generic) : null;
  const classSubclasses = builderContent?.subclasses.filter((item) => isSubclassForClass(item, character.className)) ?? [];
  const selectedAncestryId = itemIdByName(builderContent?.ancestries, character.ancestry);
  const selectedCommunityId = itemIdByName(builderContent?.communities, character.community);
  const selectedSubclassId = itemIdByName(classSubclasses, character.subclassName);
  const armorOptions = content?.equipment.filter((item) => item.type === 'armor') ?? [];
  const selectedArmorId = equipmentIdByName(armorOptions, character.armor.name);
  const domains = content ? classDomainsFor(content.classes, character.className) : character.domains;

  return (
    <div className="character-editor-compact">
      <header className="character-editor-hero">
        {editMode ? (
          <PortraitPicker character={character} />
        ) : (
          <Avatar
            className="character-portrait-picker"
            src={character.portraitUrl}
            fallback={character.name.slice(0, 2).toUpperCase() || 'Г'}
            alt=""
            size="lg"
          />
        )}
        <SectionHeader
          className="character-editor-heading"
          eyebrow={`${CLASS_LABELS[character.className]} · ${character.ancestry || 'Родословная не выбрана'}`}
          title={character.name}
          subtitle={`${character.subclassName || 'Без подкласса'} · уровень ${character.level}`}
          actions={(
            <Toolbar aria-label="Действия с персонажем">
              {character.level < 10 && <Button variant="primary" onClick={() => setLevelUpOpen(true)}>Новый уровень</Button>}
              <Button
                variant={editMode ? 'primary' : 'secondary'}
                iconBefore={editMode ? <Check size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
                onClick={() => setEditMode((current) => !current)}
              >
                {editMode ? 'Готово' : role === 'player' ? 'Свободное редактирование' : 'Редактировать'}
              </Button>
              {editMode && role === 'gm' && <Button onClick={() => characterService.duplicateCharacter(character.id)}>Копия</Button>}
              {editMode && role === 'gm' && (
                <IconButton variant="danger" size="sm" type="button" title="Удалить персонажа" aria-label={`Удалить персонажа ${character.name}`} onClick={() => setDeleteOpen(true)}>
                  <Trash2 size={15} aria-hidden="true" />
                </IconButton>
              )}
            </Toolbar>
          )}
        />
        <div className="character-editor-vitals" aria-label="Ключевые параметры">
          <InlineStat label="Уклонение" value={character.evasion} />
          <InlineStat label="Броня" value={`${Math.max(0, character.armor.score - character.armor.markedSlots)}/${character.armor.score}`} />
          <InlineStat label="Домены" value={domains.map((domain) => DOMAIN_LABELS[domain]).join(' + ')} />
        </div>
      </header>

      {deleteOpen && (
        <ConfirmDialog
          title={`Удалить персонажа «${character.name}»?`}
          body="Лист персонажа и его данные будут удалены из игры. Это действие нельзя отменить."
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => {
            setDeleteOpen(false);
            characterService.deleteCharacter(character.id);
          }}
        />
      )}

      {levelUpOpen && <LevelUpPanel character={character} content={content} domains={domains} role={role} actor={actor} onClose={() => setLevelUpOpen(false)} />}

      {editMode && role === 'player' && (
        <Notice tone="warning">
          Свободное редактирование обходит игровые ограничения и записывается в историю. Для повышения по правилам используйте «Новый уровень».
        </Notice>
      )}

      <Tabs align="start" className="character-editor-tabs" label="Разделы листа персонажа">
        <TabButton active={section === 'identity'} onClick={() => setSection('identity')}>Образ</TabButton>
        <TabButton active={section === 'stats'} onClick={() => setSection('stats')}>Характеристики</TabButton>
        <TabButton active={section === 'resources'} onClick={() => setSection('resources')}>Ресурсы</TabButton>
        <TabButton active={section === 'loadout'} onClick={() => setSection('loadout')}>Снаряжение</TabButton>
        <TabButton active={section === 'notes'} onClick={() => setSection('notes')}>Заметки</TabButton>
        <TabButton active={section === 'history'} onClick={() => setSection('history')}>История</TabButton>
      </Tabs>

      <div className="character-editor-workspace">
        {section === 'identity' && !editMode && <CharacterIdentitySummary character={character} />}
        {section === 'identity' && editMode && (
          <section className="character-editor-section" aria-label="Образ персонажа">
            <div className="grid-3">
              <TextField label="Имя" value={character.name} onChange={(event) => characterService.updateIdentity(character.id, { name: event.currentTarget.value })} />
              <TextField label="Местоимения" value={character.pronouns} onChange={(event) => characterService.updateIdentity(character.id, { pronouns: event.currentTarget.value })} />
              <NumberField label="Уровень" value={character.level} min={1} max={10} onChange={(event) => characterService.updateLevel(character.id, Number(event.currentTarget.value))} />
              <SelectField label="Класс" value={character.className} onChange={(event) => characterService.updateClass(character.id, event.currentTarget.value as DaggerheartClass)}>
                {DAGGERHEART_CLASSES.filter((className) => className !== 'Custom').map((className) => <option key={className} value={className}>{CLASS_LABELS[className]}</option>)}
              </SelectField>
              {builderContent ? (
                <SelectField label="Родословная" value={selectedAncestryId} onChange={(event) => updateIdentityFromLibrary(character.id, 'ancestry', builderContent.ancestries, event.currentTarget.value)}>
                  <option value="">{selectedAncestryId ? 'Не выбрана' : (character.ancestry || 'Не выбрана')}</option>
                  {builderContent.ancestries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </SelectField>
              ) : <TextField label="Родословная" value={character.ancestry} onChange={(event) => characterService.updateIdentity(character.id, { ancestry: event.currentTarget.value })} />}
              {builderContent ? (
                <SelectField label="Сообщество" value={selectedCommunityId} onChange={(event) => updateIdentityFromLibrary(character.id, 'community', builderContent.communities, event.currentTarget.value)}>
                  <option value="">{selectedCommunityId ? 'Не выбрано' : (character.community || 'Не выбрано')}</option>
                  {builderContent.communities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
              ) : <TextField label="Сообщество" value={character.community} onChange={(event) => characterService.updateIdentity(character.id, { community: event.currentTarget.value })} />}
              {builderContent ? (
                <SelectField label="Подкласс" value={selectedSubclassId} onChange={(event) => updateSubclassFromLibrary(character.id, classSubclasses, event.currentTarget.value)}>
                  <option value="">{selectedSubclassId ? 'Не выбран' : (character.subclassName || 'Не выбран')}</option>
                  {classSubclasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
              ) : <TextField label="Подкласс" value={character.subclassName} onChange={(event) => characterService.updateIdentity(character.id, { subclassName: event.currentTarget.value })} />}
            </div>
          </section>
        )}

        {section === 'stats' && !editMode && <CharacterStatsSummary character={character} />}
        {section === 'stats' && editMode && (
          <section className="character-editor-section" aria-label="Характеристики персонажа">
            <TraitGrid character={character} />
            <div className="character-editor-statline">
              <InlineStat label="Ощутимый" value={character.thresholds.major} />
              <InlineStat label="Тяжелый" value={character.thresholds.severe} />
              <InlineStat label="Мастерство" value={character.proficiency} />
            </div>
            <div className="grid-3">
              <NumberField label="Уклонение" value={character.evasion} onChange={(event) => characterService.updateEvasion(character.id, Number(event.currentTarget.value))} />
              <NumberField label="Мастерство" value={character.proficiency} onChange={(event) => characterService.updateProficiency(character.id, Number(event.currentTarget.value))} />
              {armorOptions.length > 0 ? (
                <SelectField label="Броня" value={selectedArmorId} onChange={(event) => applyArmorFromCatalog(character.id, armorOptions, event.currentTarget.value)}>
                  <option value="">{armorLabel(character.armor.name)}</option>
                  {armorOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
              ) : <TextField label="Броня" value={armorLabel(character.armor.name)} onChange={(event) => characterService.updateArmor(character.id, { name: event.currentTarget.value }, false)} />}
            </div>
            <details className="character-editor-advanced">
              <summary>Тонкая настройка брони и порогов</summary>
              <div className="grid-5">
                <NumberField label="Порог Ощутимого урона" value={character.thresholds.major} onChange={(event) => characterService.updateThresholds(character.id, { major: Number(event.currentTarget.value) })} />
                <NumberField label="Порог Тяжелого урона" value={character.thresholds.severe} onChange={(event) => characterService.updateThresholds(character.id, { severe: Number(event.currentTarget.value) })} />
                <NumberField label="База Ощутимого" value={character.armor.baseMajor} onChange={(event) => characterService.updateArmor(character.id, { baseMajor: Number(event.currentTarget.value) })} />
                <NumberField label="База Тяжелого" value={character.armor.baseSevere} onChange={(event) => characterService.updateArmor(character.id, { baseSevere: Number(event.currentTarget.value) })} />
                <NumberField label="Показатель Брони" value={character.armor.score} onChange={(event) => characterService.updateArmor(character.id, { score: Number(event.currentTarget.value) }, false)} />
              </div>
              <TextField label="Свойство Брони" value={character.armor.feature ?? character.armor.featureText ?? ''} onChange={(event) => characterService.updateArmor(character.id, { feature: event.currentTarget.value, featureText: event.currentTarget.value }, false)} />
            </details>
            {role === 'gm' && (
              <details className="character-editor-advanced">
                <summary>Модификаторы правил</summary>
                <div className="grid-3">
                  <NumberField
                    label="Лимит карт в Руке"
                    min={0}
                    max={25}
                    value={characterHandSize(character.ruleModifiers)}
                    onChange={(event) => updateCharacterRuleTotal(character, 'handSize', Number(event.currentTarget.value), 5)}
                  />
                  <NumberField
                    label="Выборов при повышении"
                    min={0}
                    max={22}
                    value={levelUpAdvancementChoiceCount(character.ruleModifiers)}
                    onChange={(event) => updateCharacterRuleTotal(character, 'levelUpChoices', Number(event.currentTarget.value), 2)}
                  />
                  <NumberField
                    label="Карт при повышении"
                    min={0}
                    max={21}
                    value={levelUpDomainCardCount(character.ruleModifiers)}
                    onChange={(event) => updateCharacterRuleTotal(character, 'levelUpDomainCards', Number(event.currentTarget.value), 1)}
                  />
                </div>
              </details>
            )}
          </section>
        )}

        {section === 'resources' && (
          <section className="character-editor-section character-editor-section--split" aria-label="Ресурсы и опыты персонажа">
            <div>
              <ResourcePanel character={character} allowStructureEdit={editMode} />
            </div>
            <div>
              <SectionHeader title="Опыты" />
              <ExperienceList character={character} readOnly={!editMode} />
            </div>
          </section>
        )}

        {section === 'loadout' && !editMode && <CharacterLoadoutSummary character={character} />}
        {section === 'loadout' && editMode && (
          <section className="character-editor-section" aria-label="Снаряжение персонажа">
            <LoadoutPanel character={character} content={content} />
          </section>
        )}

        {section === 'notes' && !editMode && (
          <section className="character-editor-section" aria-label="Заметки персонажа">
            <p className="muted-text">{character.notes.trim() || 'Заметок пока нет.'}</p>
          </section>
        )}
        {section === 'notes' && editMode && (
          <section className="character-editor-section" aria-label="Заметки персонажа">
            <TextAreaField label="Заметки персонажа" rows={12} value={character.notes} onChange={(event) => characterService.updateIdentity(character.id, { notes: event.currentTarget.value })} />
          </section>
        )}
        {section === 'history' && (
          <CharacterHistoryPanel
            character={character}
            canUndo={role === 'gm'}
            onUndo={(changeId) => actor && characterService.undoChange(character.id, changeId, actor)}
          />
        )}
      </div>
    </div>
  );
}

function CharacterIdentitySummary({ character }: { character: Character }) {
  return (
    <section className="character-editor-section" aria-label="Образ персонажа">
      <ListItem title="Имя" value={character.name} />
      <ListItem title="Класс" value={CLASS_LABELS[character.className]} />
      <ListItem title="Подкласс" value={character.subclassName || 'Не выбран'} />
      <ListItem title="Родословная" value={character.ancestry || 'Не выбрана'} />
      <ListItem title="Сообщество" value={character.community || 'Не выбрано'} />
      {character.pronouns && <ListItem title="Местоимения" value={character.pronouns} />}
    </section>
  );
}

function CharacterStatsSummary({ character }: { character: Character }) {
  return (
    <section className="character-editor-section" aria-label="Характеристики персонажа">
      <div className="stat-strip">
        {(Object.keys(TRAIT_LABELS) as TraitId[]).map((trait) => (
          <InlineStat key={trait} label={TRAIT_LABELS[trait]} value={character.traits[trait]} />
        ))}
      </div>
      <ListItem title="Уклонение" value={character.evasion} />
      <ListItem title="Мастерство" value={character.proficiency} />
      <ListItem title="Пороги урона" value={`${character.thresholds.major} / ${character.thresholds.severe}`} />
      <ListItem title="Броня" subtitle={character.armor.feature || character.armor.featureText || undefined} value={`${character.armor.score}`} />
    </section>
  );
}

function CharacterLoadoutSummary({ character }: { character: Character }) {
  return (
    <section className="character-editor-section" aria-label="Снаряжение персонажа">
      <SectionHeader title="Оружие" />
      {character.weapons.map((weapon) => (
        <ListItem
          key={weapon.id}
          title={weapon.name}
          subtitle={`${TRAIT_LABELS[weapon.trait]} · ${weapon.range} · ${weapon.damageFormula}`}
        />
      ))}
      <SectionHeader title="Карты доменов" />
      {character.domainCards.map((card) => (
        <ListItem
          key={card.id}
          title={card.name}
          subtitle={`${DOMAIN_LABELS[card.domain] ?? card.domain} · уровень ${card.level}`}
          value={card.inLoadout ? 'Рука' : 'Хранилище'}
        />
      ))}
      <SectionHeader title="Инвентарь" />
      {character.inventory.map((item) => (
        <ListItem key={item.id} title={item.name} subtitle={item.text} value={item.quantity} />
      ))}
    </section>
  );
}

function LevelUpPanel({
  character,
  content,
  domains,
  role,
  actor,
  onClose
}: {
  character: Character;
  content?: ContentState;
  domains: DomainName[];
  role: 'gm' | 'player';
  actor?: CharacterChangeActor;
  onClose: () => void;
}) {
  const nextLevel = Math.min(10, character.level + 1);
  const targetLevel = nextLevel;
  const steps = [
    { id: 'overview', label: 'Итог' },
    { id: 'choices', label: 'Улучшения' },
    { id: 'resources', label: 'Параметры' },
    { id: 'domain', label: 'Карта' },
    { id: 'notes', label: 'Заметки' },
    { id: 'review', label: 'Проверка' }
  ] as const;
  type LevelUpStep = typeof steps[number]['id'];
  const [step, setStep] = useState<LevelUpStep>('overview');
  const [choices, setChoices] = useState<CharacterAdvancementChoiceId[]>([]);
  const [newExperienceName, setNewExperienceName] = useState('');
  const [experienceIncreaseIds, setExperienceIncreaseIds] = useState<string[]>([]);
  const [selectedDomainCardIds, setSelectedDomainCardIds] = useState<string[]>([]);
  const [proficiency, setProficiency] = useState(character.proficiency);
  const [majorThreshold, setMajorThreshold] = useState(character.thresholds.major + 1);
  const [severeThreshold, setSevereThreshold] = useState(character.thresholds.severe + 1);
  const [hpMax, setHpMax] = useState(character.hp.max);
  const [stressMax, setStressMax] = useState(character.stress.max);
  const [evasion, setEvasion] = useState(character.evasion);
  const [multiclassClass, setMulticlassClass] = useState<DaggerheartClass | ''>('');
  const [multiclassDomain, setMulticlassDomain] = useState<DomainName | ''>('');
  const [selectedTraits, setSelectedTraits] = useState<TraitId[]>([]);
  const [notes, setNotes] = useState('');
  const [freeformEnabled, setFreeformEnabled] = useState(false);
  const [freeformReason, setFreeformReason] = useState('');
  const [applyIssues, setApplyIssues] = useState<string[]>([]);
  const ruleModifiers = character.ruleModifiers;
  const plan = useMemo(() => buildCharacterLevelUpPlan(character, {
    targetLevel,
    advancementChoices: choices,
    multiclassClass,
    multiclassDomain,
    ruleModifiers
  }), [character, choices, multiclassClass, multiclassDomain, ruleModifiers, targetLevel]);
  const selectedChoiceCost = plan.advancementChoiceCost;
  const choiceDefinitions = CHARACTER_ADVANCEMENT_CHOICES.filter((choice) => choice.id !== 'manual');
  const isMulticlass = choices.includes('multiclass');
  const isSubclassUpgrade = choices.includes('subclass');
  const domainCardOptions = useMemo(() => {
    const cards = content?.generic.domainCards ?? [];
    return cards
      .filter((item) => {
        const card = domainCardFromLibrary(item, true);
        const ownDomainCard = domains.includes(card.domain) && card.level <= plan.domainCardMaxLevel;
        const multiclassDomainCard = isMulticlass && card.domain === multiclassDomain && card.level <= plan.multiclassDomainCardMaxLevel;
        return ownDomainCard || multiclassDomainCard;
      })
      .filter((item) => !character.domainCards.some((card) => String(card.sourceId ?? card.id) === String(item.sourceId ?? item.id)))
      .slice(0, 120);
  }, [character.domainCards, content?.generic.domainCards, domains, isMulticlass, multiclassDomain, plan.domainCardMaxLevel, plan.multiclassDomainCardMaxLevel]);
  const selectedDomainCards = selectedDomainCardIds
    .map((id) => domainCardOptions.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => domainCardFromLibrary(item, true));
  const selectedSubclass = content?.generic.subclasses.find((item) => (
    item.slug === character.subclassSlug || item.name.trim().toLowerCase() === character.subclassName.trim().toLowerCase()
  ));
  const currentSubclassTiers = new Set(character.sheetCards.filter((card) => card.kind === 'subclassFeature').map((card) => card.subclassTier));
  const nextSubclassTier = currentSubclassTiers.has('specialization') ? 'mastery' : 'specialization';
  const subclassFeatures = selectedSubclass?.raw[nextSubclassTier === 'mastery' ? 'mastery_features' : 'specialization_features'];
  const subclassCards: Array<Partial<CharacterSheetCard>> = isSubclassUpgrade && Array.isArray(subclassFeatures)
    ? subclassFeatures.map((feature, index) => ({
        id: `sheet-subclass-${selectedSubclass?.slug ?? character.id}-${nextSubclassTier}-${feature.id ?? index}`,
        kind: 'subclassFeature',
        name: String(feature.name ?? 'Особенность подкласса'),
        text: String(feature.main_body ?? feature.text ?? ''),
        sourceId: selectedSubclass?.sourceId ?? selectedSubclass?.id,
        subclassTier: nextSubclassTier
      }))
    : [];
  const traitBonuses = Object.fromEntries(selectedTraits.map((trait) => [trait, 1])) as Partial<Record<TraitId, number>>;
  const resolvedActor: CharacterChangeActor = actor ?? {
    id: role === 'gm' ? 'local-gm' : 'local-player',
    name: role === 'gm' ? 'Мастер' : character.playerName || 'Игрок',
    role
  };
  const applicationInput: CharacterLevelUpApplicationInput = {
    actor: resolvedActor,
    level: targetLevel,
    advancementChoices: choices,
    proficiency: freeformEnabled ? proficiency : plan.expectedProficiency,
    experiences: newExperienceName.trim() ? [{ name: newExperienceName.trim(), modifier: 2, notes: 'Достижение ранга / повышение уровня' }] : [],
    experienceIncreases: experienceIncreaseIds.filter(Boolean).map((experienceId) => ({ experienceId })),
    domainCards: selectedDomainCards,
    subclassCards,
    thresholdBonus: freeformEnabled
      ? { major: majorThreshold, severe: severeThreshold }
      : plan.expectedThresholds,
    traitBonuses,
    hpMax: freeformEnabled ? hpMax : plan.expectedHpMax,
    stressMax: freeformEnabled ? stressMax : plan.expectedStressMax,
    evasion: freeformEnabled ? evasion : plan.expectedEvasion,
    multiclassClass,
    multiclassDomain,
    ruleModifiers,
    notes: formatLevelUpNotes({
      plan,
      choices,
      extraNotes: notes,
      multiclassClass,
      multiclassDomain,
      traitBonuses
    }),
    ...(freeformEnabled ? {
      freeformOverride: {
        enabled: true as const,
        actor: resolvedActor,
        reason: freeformReason
      }
    } : {})
  };
  const validation = characterService.validateLevelUp(character.id, applicationInput);
  const canApply = character.level < 10 && Boolean(validation?.canApply);
  const currentStepIndex = Math.max(0, steps.findIndex((item) => item.id === step));
  const progress = Math.round(((currentStepIndex + 1) / steps.length) * 100);

  useEffect(() => {
    const level = Math.min(10, character.level + 1);
    setProficiency(character.proficiency + (level === 2 || level === 5 || level === 8 ? 1 : 0));
    setMajorThreshold(character.thresholds.major + Math.max(0, level - character.level));
    setSevereThreshold(character.thresholds.severe + Math.max(0, level - character.level));
    setHpMax(character.hp.max);
    setStressMax(character.stress.max);
    setEvasion(character.evasion);
    setSelectedTraits([]);
    setSelectedDomainCardIds([]);
    setExperienceIncreaseIds([]);
    setChoices([]);
    setNewExperienceName('');
    setNotes('');
    setFreeformEnabled(false);
    setFreeformReason('');
    setApplyIssues([]);
  }, [character.id, character.level, character.proficiency, character.thresholds.major, character.thresholds.severe, character.hp.max, character.stress.max, character.evasion]);

  useEffect(() => {
    setMajorThreshold(plan.expectedThresholds.major);
    setSevereThreshold(plan.expectedThresholds.severe);
    setProficiency(plan.expectedProficiency);
    setHpMax(plan.expectedHpMax);
    setStressMax(plan.expectedStressMax);
    setEvasion(plan.expectedEvasion);
    setSelectedTraits((current) => current.slice(0, plan.requiredTraitBonuses));
    setExperienceIncreaseIds((current) => Array.from({ length: plan.requiredExperienceIncreases }, (_, index) => current[index] ?? ''));
    setSelectedDomainCardIds((current) => Array.from({ length: plan.requiredDomainCards }, (_, index) => current[index] ?? ''));
    setApplyIssues([]);
  }, [plan.expectedEvasion, plan.expectedHpMax, plan.expectedProficiency, plan.expectedStressMax, plan.expectedThresholds.major, plan.expectedThresholds.severe, plan.requiredDomainCards, plan.requiredExperienceIncreases, plan.requiredTraitBonuses]);

  useEffect(() => {
    if (plan.requiredNewExperiences === 0) setNewExperienceName('');
  }, [plan.requiredNewExperiences]);

  useEffect(() => {
    if (!isMulticlass) {
      setMulticlassClass('');
      setMulticlassDomain('');
    }
    setSelectedDomainCardIds((current) => current.map((id, index) => index === 0 ? '' : id));
  }, [isMulticlass]);

  const addChoice = (choice: CharacterAdvancementChoiceId) => {
    const definition = CHARACTER_ADVANCEMENT_CHOICES.find((item) => item.id === choice);
    if (!definition || definition.id === 'manual' || selectedChoiceCost + definition.cost > plan.requiredAdvancementChoices) return;
    setChoices((current) => [...current, choice]);
  };

  const removeChoice = (choice: CharacterAdvancementChoiceId) => {
    setChoices((current) => {
      const index = current.lastIndexOf(choice);
      return index < 0 ? current : current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const applyLevelUp = () => {
    const result = characterService.applyLevelUpDetailed(character.id, applicationInput);
    if (result.applied) {
      onClose();
      return;
    }
    setApplyIssues(result.validation.issues.map((issue) => issue.message));
  };
  const goPrevious = () => setStep(steps[Math.max(0, currentStepIndex - 1)].id);
  const goNext = () => setStep(steps[Math.min(steps.length - 1, currentStepIndex + 1)].id);

  return (
    <Dialog aria-label="Повышение уровня" className="cinematic-builder character-level-up-wizard" onClose={onClose}>
        <nav className="cinematic-builder-nav" aria-label="Шаги повышения уровня">
          <div className="cinematic-builder-header">
            <h2 className="cinematic-builder-title">Повышение уровня</h2>
            <IconButton variant="ghost" type="button" onClick={onClose} aria-label="Закрыть">
              <X size={18} aria-hidden="true" />
            </IconButton>
          </div>
          <div className="cinematic-builder-stepper">
            {steps.map((item, index) => (
              <WizardStepButton
                key={item.id}
                active={step === item.id}
                index={index + 1}
                label={item.label}
                onClick={() => setStep(item.id)}
              />
            ))}
          </div>
        </nav>

        <div className="cinematic-builder-panel dh-scroll" role="region" aria-label="Шаг повышения уровня">
          <header className="cinematic-builder-stage" aria-label="Сводка повышения уровня">
            <div className="cinematic-builder-stage-art">
              {character.portraitUrl ? <img src={character.portraitUrl} alt="" /> : <span>{character.name.slice(0, 2).toUpperCase()}</span>}
            </div>
            <div className="cinematic-builder-stage-copy">
              <span className="cinematic-card-meta">{steps[currentStepIndex]?.label ?? 'Повышение'} · {progress}%</span>
              <strong>{character.name}</strong>
              <p>{`${CLASS_LABELS[character.className]} · уровень ${character.level} -> ${targetLevel} · ${plan.rankLabel}`}</p>
              <div className="cinematic-builder-progress" aria-label={`Прогресс повышения ${progress}%`}>
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
          </header>

          <div className="cinematic-builder-workspace character-level-up-wizard__workspace" role="region" aria-label="Выборы повышения уровня">
            {step === 'overview' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Новый уровень">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Новый уровень</h3>
                  <p className="cinematic-builder-copy">{plan.summary}</p>
                </header>
                {plan.rankAchievements.length > 0 && <Notice tone="info">{plan.rankAchievements.join(' · ')}</Notice>}
                <div className="grid-4">
                  <NumberField label="Новый уровень" min={targetLevel} max={targetLevel} value={targetLevel} disabled />
                  <NumberField label="Мастерство" min={1} max={6} value={freeformEnabled ? proficiency : plan.expectedProficiency} disabled={!freeformEnabled} onChange={(event) => setProficiency(Number(event.currentTarget.value))} />
                  <NumberField label="Порог Ощутимого" value={freeformEnabled ? majorThreshold : plan.expectedThresholds.major} disabled={!freeformEnabled} onChange={(event) => setMajorThreshold(Number(event.currentTarget.value))} />
                  <NumberField label="Порог Тяжелого" value={freeformEnabled ? severeThreshold : plan.expectedThresholds.severe} disabled={!freeformEnabled} onChange={(event) => setSevereThreshold(Number(event.currentTarget.value))} />
                </div>
              </section>
            )}

            {step === 'choices' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Улучшения">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Улучшения</h3>
                  <p className="cinematic-builder-copy">Наберите улучшения общей стоимостью {plan.requiredAdvancementChoices}. Мастерство и мультикласс стоят по два.</p>
                </header>
                <Notice tone={selectedChoiceCost === plan.requiredAdvancementChoices ? 'success' : 'info'}>
                  Выбрано: {selectedChoiceCost} из {plan.requiredAdvancementChoices}
                </Notice>
                <div className="stack">
                  {choiceDefinitions.map((choice) => {
                    const count = choices.filter((selected) => selected === choice.id).length;
                    const unavailableByLevel = Boolean(choice.minLevel && targetLevel < choice.minLevel);
                    return (
                      <ListItem
                        key={choice.id}
                        title={choice.label}
                        subtitle={`Стоимость: ${choice.cost}`}
                        value={count > 0 ? `×${count}` : undefined}
                        rightAccessory={(
                          <Toolbar aria-label={`Количество: ${choice.label}`}>
                            <Button size="xs" type="button" disabled={count === 0} onClick={() => removeChoice(choice.id)} aria-label={`Убрать: ${choice.label}`}>−</Button>
                            <Button
                              size="xs"
                              type="button"
                              disabled={unavailableByLevel || selectedChoiceCost + choice.cost > plan.requiredAdvancementChoices}
                              onClick={() => addChoice(choice.id)}
                              aria-label={`Добавить: ${choice.label}`}
                            >+</Button>
                          </Toolbar>
                        )}
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {step === 'resources' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Параметры">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Параметры</h3>
                  <p className="cinematic-builder-copy">В обычном режиме значения рассчитываются из выбранных улучшений автоматически.</p>
                </header>
                <div className="grid-4">
                  <NumberField label="Макс. Ран" min={1} max={12} value={freeformEnabled ? hpMax : plan.expectedHpMax} disabled={!freeformEnabled} onChange={(event) => setHpMax(Number(event.currentTarget.value))} />
                  <NumberField label="Макс. Стресса" min={1} max={12} value={freeformEnabled ? stressMax : plan.expectedStressMax} disabled={!freeformEnabled} onChange={(event) => setStressMax(Number(event.currentTarget.value))} />
                  <NumberField label="Уклонение" value={freeformEnabled ? evasion : plan.expectedEvasion} disabled={!freeformEnabled} onChange={(event) => setEvasion(Number(event.currentTarget.value))} />
                  {plan.requiredNewExperiences > 0 && <TextField label="Новый Опыт +2" value={newExperienceName} onChange={(event) => setNewExperienceName(event.currentTarget.value)} />}
                </div>
                {plan.requiredExperienceIncreases > 0 && Array.from({ length: plan.requiredExperienceIncreases }, (_, index) => (
                  <SelectField
                    key={`experience-${index}`}
                    label={`Опыт для +1 · ${index + 1}`}
                    value={experienceIncreaseIds[index] ?? ''}
                    onChange={(event) => setExperienceIncreaseIds((current) => current.map((id, itemIndex) => itemIndex === index ? event.currentTarget.value : id))}
                  >
                    <option value="">Выберите Опыт</option>
                    {character.experiences.map((experience) => (
                      <option key={experience.id} value={experience.id} disabled={experienceIncreaseIds.some((id, itemIndex) => itemIndex !== index && id === experience.id)}>
                        {experience.name} +{experience.modifier}
                      </option>
                    ))}
                  </SelectField>
                ))}
                {plan.requiredTraitBonuses > 0 && (
                  <div className="grid-3" role="group" aria-label="Характеристики для повышения">
                    {(Object.keys(TRAIT_LABELS) as TraitId[]).map((trait) => {
                      const selected = selectedTraits.includes(trait);
                      const crossedRank = plan.currentRank !== plan.targetRank;
                      const alreadyMarked = !crossedRank && (character.advancement?.markedTraits ?? []).includes(trait);
                      return (
                        <Checkbox
                          key={trait}
                          label={TRAIT_LABELS[trait]}
                          meta={selected ? '+1' : undefined}
                          layout="row"
                          checked={selected}
                          disabled={alreadyMarked || (!selected && selectedTraits.length >= plan.requiredTraitBonuses)}
                          onChange={() => setSelectedTraits((current) => selected ? current.filter((item) => item !== trait) : [...current, trait])}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {step === 'domain' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Карты и мультикласс">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Карты и мультикласс</h3>
                  <p className="cinematic-builder-copy">Выберите обязательную карту уровня не выше {plan.domainCardMaxLevel}. Дополнительные карты появляются из улучшений и модификаторов.</p>
                </header>
                {selectedDomainCardIds.map((selectedId, index) => {
                  const multiclassSlot = isMulticlass && index === 0;
                  return (
                    <SelectField
                      key={`domain-card-${index}`}
                      label={multiclassSlot ? 'Карта домена мультикласса' : index === 0 ? 'Обязательная карта домена' : `Дополнительная карта домена ${index}`}
                      value={selectedId}
                      onChange={(event) => setSelectedDomainCardIds((current) => current.map((id, itemIndex) => itemIndex === index ? event.currentTarget.value : id))}
                    >
                      <option value="">Выберите карту</option>
                      {domainCardOptions.filter((card) => {
                        const mapped = domainCardFromLibrary(card, true);
                        if (multiclassSlot && mapped.domain !== multiclassDomain) return false;
                        return !selectedDomainCardIds.some((id, itemIndex) => itemIndex !== index && id === card.id);
                      }).map((card) => {
                        const mapped = domainCardFromLibrary(card, true);
                        return <option key={card.id} value={card.id}>{card.name} · {DOMAIN_LABELS[mapped.domain]} {mapped.level}</option>;
                      })}
                    </SelectField>
                  );
                })}
                {isMulticlass && <div className="grid-2">
                  <SelectField label="Мультикласс" value={multiclassClass} onChange={(event) => {
                    setMulticlassClass(event.currentTarget.value as DaggerheartClass | '');
                    setMulticlassDomain('');
                    setSelectedDomainCardIds((current) => current.map((id, index) => index === 0 ? '' : id));
                  }}>
                    <option value="">Не выбран</option>
                    {DAGGERHEART_CLASSES.filter((className) => className !== 'Custom' && className !== character.className).map((className) => (
                      <option key={className} value={className}>{CLASS_LABELS[className]}</option>
                    ))}
                  </SelectField>
                  <SelectField label="Домен мультикласса" value={multiclassDomain} onChange={(event) => {
                    setMulticlassDomain(event.currentTarget.value as DomainName | '');
                    setSelectedDomainCardIds((current) => current.map((id, index) => index === 0 ? '' : id));
                  }}>
                    <option value="">Не выбран</option>
                    {(multiclassClass ? CLASS_DOMAINS[multiclassClass] : []).filter((domain) => !domains.includes(domain) && domain !== 'Custom').map((domain) => (
                      <option key={domain} value={domain}>{DOMAIN_LABELS[domain]}</option>
                    ))}
                  </SelectField>
                </div>}
                {isSubclassUpgrade && (
                  <Notice tone={subclassCards.length > 0 ? 'success' : 'error'}>
                    {subclassCards.length > 0
                      ? `Будут добавлены особенности подкласса: ${subclassCards.map((card) => card.name).join(', ')}.`
                      : 'Не удалось найти следующую карту выбранного подкласса в справочнике.'}
                  </Notice>
                )}
              </section>
            )}

            {step === 'notes' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Заметки">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Заметки</h3>
                  <p className="cinematic-builder-copy">Необязательная заметка сохранится в истории повышения.</p>
                </header>
                <TextAreaField label="Заметки повышения" value={notes} rows={8} onChange={(event) => setNotes(event.currentTarget.value)} />
              </section>
            )}

            {step === 'review' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Проверка">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Проверка</h3>
                  <p className="cinematic-builder-copy">Проверьте итог. Применение доступно только после успешной проверки правил.</p>
                </header>
                <div className="stat-strip">
                  <InlineStat label="Уровень" value={`${character.level} -> ${targetLevel}`} />
                  <InlineStat label="Мастерство" value={applicationInput.proficiency ?? character.proficiency} />
                  <InlineStat label="Пороги" value={`${applicationInput.thresholdBonus?.major} / ${applicationInput.thresholdBonus?.severe}`} />
                  <InlineStat label="Карты" value={`${selectedDomainCards.length}/${plan.requiredDomainCards}`} />
                </div>
                <p className="muted-text">{choices.map(advancementChoiceLabel).join(' / ')}</p>
                {role === 'gm' && (
                  <details className="character-editor-advanced">
                    <summary>Свободный режим мастера</summary>
                    <Checkbox
                      label="Обойти строгие ограничения"
                      meta="Изменение попадёт в историю"
                      layout="row"
                      checked={freeformEnabled}
                      onChange={(event) => setFreeformEnabled(event.currentTarget.checked)}
                    />
                    {freeformEnabled && (
                      <TextAreaField
                        label="Причина обхода правил"
                        value={freeformReason}
                        rows={3}
                        required
                        onChange={(event) => setFreeformReason(event.currentTarget.value)}
                      />
                    )}
                  </details>
                )}
              </section>
            )}
          </div>

          {(applyIssues.length > 0 || (validation?.issues.length ?? 0) > 0) && (
            <Notice tone="error" role="alert">
              {[...new Set(applyIssues.length > 0 ? applyIssues : validation?.issues.map((issue) => issue.message) ?? [])].join(' ')}
            </Notice>
          )}
          {validation?.strictlyValid && <Notice tone="success">Все обязательные выборы заполнены, повышение соответствует правилам.</Notice>}

          <div className="cinematic-builder-actions" role="toolbar" aria-label="Действия повышения уровня">
            <Button disabled={currentStepIndex === 0} onClick={goPrevious}>Назад</Button>
            <div className="button-row">
              {step !== 'review' && <Button variant="primary" onClick={goNext}>Дальше</Button>}
              {step === 'review' && <Button variant="primary" disabled={!canApply} onClick={applyLevelUp}>Применить повышение</Button>}
            </div>
          </div>
        </div>
    </Dialog>
  );
}

type ManagedCharacterRuleKind = 'handSize' | 'levelUpChoices' | 'levelUpDomainCards';

function updateCharacterRuleTotal(
  character: Character,
  kind: ManagedCharacterRuleKind,
  requestedTotal: number,
  baseTotal: number
): void {
  const managedId = `manual:${kind}`;
  const unmanaged = character.ruleModifiers.filter((modifier) => modifier.id !== managedId);
  const existingAdjustment = unmanaged.reduce((total, modifier) => (
    modifier.kind === kind ? total + modifier.amount : total
  ), 0);
  const safeTotal = Number.isFinite(requestedTotal) ? Math.max(0, Math.trunc(requestedTotal)) : baseTotal + existingAdjustment;
  const amount = safeTotal - baseTotal - existingAdjustment;
  const labels: Record<ManagedCharacterRuleKind, string> = {
    handSize: 'Ручной лимит Руки',
    levelUpChoices: 'Ручное число выборов повышения',
    levelUpDomainCards: 'Ручное число карт повышения'
  };
  const next: CharacterRuleModifier[] = amount === 0
    ? unmanaged
    : [...unmanaged, { id: managedId, kind, source: 'manual', label: labels[kind], amount }];
  characterService.updateRuleModifiers(character.id, next);
}

function PortraitPicker({ character }: { character: Character }) {
  const handlePortraitChange = async (file: File) => {
    const portraitUrl = await readFileAsDataUrl(file);
    characterService.updateIdentity(character.id, { portraitUrl });
  };

  return (
    <ImageFilePicker
      className="character-portrait-picker"
      label="Портрет"
      hideLabel
      imageUrl={character.portraitUrl}
      onFileSelect={handlePortraitChange}
      onClear={() => characterService.updateIdentity(character.id, { portraitUrl: '' })}
    />
  );
}

function updateIdentityFromLibrary(
  characterId: string,
  field: 'ancestry' | 'community' | 'subclassName',
  items: GenericLibraryItem[],
  itemId: string
) {
  const item = items.find((candidate) => candidate.id === itemId);
  characterService.updateIdentity(characterId, { [field]: item?.name ?? '' });
}

function updateSubclassFromLibrary(characterId: string, items: GenericLibraryItem[], itemId: string) {
  characterService.updateSubclassFromLibrary(characterId, items.find((candidate) => candidate.id === itemId) ?? null);
}

function applyArmorFromCatalog(characterId: string, items: LibraryEquipmentItem[], itemId: string) {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return;
  const plan = buildEquipmentAttachmentPlan(item);
  if (plan.armor) {
    characterService.updateArmor(characterId, plan.armor, true);
  }
}

function itemIdByName(items: GenericLibraryItem[] | undefined, name: string): string {
  return items?.find((item) => item.name === name)?.id ?? '';
}

function equipmentIdByName(items: LibraryEquipmentItem[], name: string): string {
  return items.find((item) => item.name === name)?.id ?? '';
}

function armorLabel(name: string): string {
  const labels: Record<string, string> = {
    'Leather Armor': 'Кожаная броня',
    'Chainmail Armor': 'Кольчуга',
    'Plate Armor': 'Латная броня'
  };
  return labels[name] ?? name;
}
