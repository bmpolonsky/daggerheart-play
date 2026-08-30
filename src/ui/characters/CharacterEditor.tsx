import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Avatar } from '../components/common/Avatar';
import { Badge } from '../components/common/Badge';
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
import { RichChoicePicker, type RichChoicePickerItem } from '../components/common/RichChoicePicker';
import { SectionHeader } from '../components/common/SectionHeader';
import { TabButton, Tabs } from '../components/common/Tabs';
import { Toolbar } from '../components/common/Toolbar';
import { WizardStepButton } from '../components/common/WizardStepButton';
import { CLASS_DOMAINS, CLASS_LABELS, DAGGERHEART_CLASSES, DOMAIN_LABELS, PLAYTEST_CLASSES, TRAIT_LABELS, characterClassLabel } from '../../domain/rules/constants';
import type { ContentState, GenericLibraryItem, LibraryEquipmentItem } from '../../domain/content/types';
import {
  cleanRulesText,
  classDefinitionFor,
  classDefinitionForCharacter,
  classDomainsFor,
  classFeatureListText,
  classFeatureSheetCards,
  domainCardFromLibrary,
  featureListText,
  filterBuilderContent,
  isSubclassForClass,
  startingSubclassFeatureSheetCards
} from '../../domain/characterBuilder';
import { buildEquipmentAttachmentPlan } from '../../domain/rules/equipment';
import {
  characterHandSize,
  levelUpAdvancementChoiceCount,
  levelUpDomainCardCount,
  type CharacterRuleModifier
} from '../../domain/rules/characterRuleModifiers';
import { advancementChoiceLabel, buildCharacterLevelUpPlan, CHARACTER_ADVANCEMENT_CHOICES, remainingAdvancementChoiceUses, type CharacterAdvancementChoiceId, type CharacterAdvancementSelection, type CharacterLevelUpApplicationInput, type CharacterLevelUpIssueCode } from '../../domain/rules/levelUp';
import type { Character, CharacterChangeActor, CharacterSheetCard, DaggerheartClass, DomainName, TraitId } from '../../domain/rules/types';
import { characterService, gameService, tabletopService } from '../../services/serviceRegistry';
import { useStream } from '../../core/hooks/useStream';
import { readFileAsDataUrl } from '../vtt/playerView/sharedTools/readFileAsDataUrl';
import { TraitGrid } from './TraitGrid';
import { ResourcePanel } from './ResourcePanel';
import { ExperienceList } from './ExperienceList';
import { LoadoutPanel } from './LoadoutPanel';
import { CharacterHistoryPanel } from './CharacterHistoryPanel';
import { analyzeFeatureRules } from '../../domain/rules/featureEffects';
import type { FeatureRuleEffect } from '../../domain/rules/featureEffects';
import { buildEffectiveCharacterStats } from '../../domain/rules/effects';
import { RuleEffectText, ruleEffectApplicationLabel, uniqueRuleEffectMessages } from '../components/common/RuleEffectText';
import { characterSheetCardSourceLabel } from '../../domain/rules/sidecar';

type CharacterEditorSection = 'identity' | 'stats' | 'resources' | 'loadout' | 'rules' | 'notes' | 'history';

// Common controls are typed with Preact while this legacy editor still imports
// React types. Both resolve to preact/compat at runtime.
const CharacterRuleEffectText = RuleEffectText as unknown as ComponentType<Parameters<typeof RuleEffectText>[0]>;

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
  const game = useStream(gameService.game$);
  const includePlaytest = game.includeVoidContent;
  const armorOptions = content?.equipment.filter((item) => item.type === 'armor') ?? [];
  const selectedArmorId = equipmentIdByName(armorOptions, character.armor.name);
  const domains = content
    ? classDefinitionForCharacter(content.classes, character, includePlaytest)?.domains ?? classDomainsFor(content.classes, character.className, includePlaytest)
    : character.domains;
  const effectiveStats = useMemo(() => buildEffectiveCharacterStats(character), [character]);

  useEffect(() => () => characterService.endHistoryGroup(character.id), [character.id]);

  const toggleEditMode = () => {
    if (editMode) {
      characterService.endHistoryGroup(character.id);
      setEditMode(false);
      return;
    }
    characterService.beginHistoryGroup(character.id, actor);
    setEditMode(true);
  };

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
          eyebrow={`${characterClassLabel(character)} — ${character.ancestry || 'Родословная не выбрана'}`}
          title={character.name}
          subtitle={`${character.subclassName || 'Без подкласса'} — уровень ${character.level}`}
          actions={(
            <Toolbar aria-label="Действия с персонажем">
              {character.level < 10 && <Button variant="primary" onClick={() => setLevelUpOpen(true)}>Новый уровень</Button>}
              <Button
                variant={editMode ? 'primary' : 'secondary'}
                iconBefore={editMode ? <Check size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
                onClick={toggleEditMode}
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
          <InlineStat label="Уклонение" value={effectiveStats.evasion} />
          <InlineStat label="Броня" value={`${Math.max(0, effectiveStats.armorScore - character.armor.markedSlots)}/${effectiveStats.armorScore}`} />
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
            tabletopService.deleteCharacter(character.id);
          }}
        />
      )}

      {levelUpOpen && <LevelUpPanel character={character} content={content} domains={domains} includePlaytest={includePlaytest} role={role} actor={actor} onClose={() => setLevelUpOpen(false)} />}

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
        <TabButton active={section === 'rules'} onClick={() => setSection('rules')}>Свойства</TabButton>
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
                <RichChoicePicker
                  label="Броня"
                  value={selectedArmorId}
                  placeholder={armorLabel(character.armor.name)}
                  items={armorOptions.map((item) => ({
                    id: item.id,
                    title: item.name,
                    subtitle: item.armorScore === null ? undefined : `Броня ${item.armorScore}`,
                    description: item.featureText,
                    imageUrl: item.imageUrl
                  }))}
                  onChange={(itemId) => applyArmorFromCatalog(character.id, armorOptions, itemId)}
                />
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

        {section === 'rules' && <CharacterRuleEffectsSummary character={character} editable={editMode} />}

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
      <ListItem title="Класс" value={characterClassLabel(character)} />
      <ListItem title="Подкласс" value={character.subclassName || 'Не выбран'} />
      <ListItem title="Родословная" value={character.ancestry || 'Не выбрана'} />
      <ListItem title="Сообщество" value={character.community || 'Не выбрано'} />
      {character.pronouns && <ListItem title="Местоимения" value={character.pronouns} />}
    </section>
  );
}

function CharacterStatsSummary({ character }: { character: Character }) {
  const effective = buildEffectiveCharacterStats(character);
  return (
    <section className="character-editor-section" aria-label="Характеристики персонажа">
      <div className="stat-strip">
        {(Object.keys(TRAIT_LABELS) as TraitId[]).map((trait) => (
          <InlineStat key={trait} label={TRAIT_LABELS[trait]} value={effective.traits[trait]} />
        ))}
      </div>
      <ListItem title="Уклонение" value={effective.evasion} />
      <ListItem title="Мастерство" value={character.proficiency} />
      <ListItem title="Пороги урона" value={`${effective.thresholds.major} / ${effective.thresholds.severe}`} />
      <ListItem title="Броня" subtitle={cleanRulesText(character.armor.feature || character.armor.featureText || '') || undefined} value={`${effective.armorScore}`} />
    </section>
  );
}

function CharacterRuleEffectsSummary({ character, editable }: { character: Character; editable: boolean }) {
  const [editingCard, setEditingCard] = useState<CharacterSheetCard | null | 'new'>(null);
  const [deleteCard, setDeleteCard] = useState<CharacterSheetCard | null>(null);
  const features = character.sheetCards.flatMap((card) => {
    if (!['classFeature', 'ancestryFeature', 'communityFeature', 'subclassFeature', 'custom'].includes(card.kind)) return [];
    const analysis = analyzeFeatureRules(card.text ?? '');
    return [{ card, analysis }];
  });
  const items = features.flatMap(({ card, analysis }) => (
    uniqueRuleEffectMessages(analysis.effects).map((effect) => ({ card, effect }))
  ));
  return (
    <section className="character-editor-section" aria-label="Свойства персонажа">
      <SectionHeader
        title="Свойства"
        actions={editable ? (
          <Button size="sm" variant="secondary" iconBefore={<Plus size={14} aria-hidden="true" />} onClick={() => setEditingCard('new')}>
            Добавить свойство
          </Button>
        ) : undefined}
      />
      {features.length === 0 && <p className="muted-text">Свойств пока нет.</p>}
      {features.length > 0 && (
        <div className="character-rule-feature-list">
          {features.map(({ card, analysis }) => (
            <article className="character-rule-feature" key={card.id}>
              <div className="character-rule-feature__heading">
                <div>
                  <div className="character-rule-feature__identity">
                    <strong>{card.name}</strong>
                    <Badge size="xs">{characterSheetCardSourceLabel(card)}</Badge>
                  </div>
                  {card.subtitle && <span>{card.subtitle}</span>}
                </div>
                {editable && card.kind === 'custom' && (
                  <Toolbar aria-label={`Действия свойства ${card.name}`}>
                    <IconButton size="xs" variant="ghost" title="Редактировать свойство" aria-label={`Редактировать свойство ${card.name}`} onClick={() => setEditingCard(card)}>
                      <Pencil size={13} aria-hidden="true" />
                    </IconButton>
                    <IconButton size="xs" variant="danger" title="Удалить свойство" aria-label={`Удалить свойство ${card.name}`} onClick={() => setDeleteCard(card)}>
                      <Trash2 size={13} aria-hidden="true" />
                    </IconButton>
                  </Toolbar>
                )}
              </div>
              {analysis.text.trim() && (
                <p>{renderRuleEffectProse(analysis.text, analysis.effects)}</p>
              )}
            </article>
          ))}
        </div>
      )}
      <SectionHeader title="Эффекты правил" />
      {items.length === 0 && <p className="muted-text">Распознанных эффектов нет.</p>}
      {items.map(({ card, effect }) => (
        <ListItem
          key={`${card.id}:${ruleEffectApplicationLabel(effect)}:${effect.summary}`}
          title={card.name}
          subtitle={effect.summary}
          value={ruleEffectApplicationLabel(effect)}
          density="compact"
        />
      ))}
      {editingCard && (
        <CustomFeatureDialog
          card={editingCard === 'new' ? null : editingCard}
          onClose={() => setEditingCard(null)}
          onSave={(input) => {
            if (editingCard === 'new') characterService.addSheetCard(character.id, { kind: 'custom', ...input });
            else characterService.updateSheetCard(character.id, editingCard.id, input);
            setEditingCard(null);
          }}
        />
      )}
      {deleteCard && (
        <ConfirmDialog
          title={`Удалить свойство «${deleteCard.name}»?`}
          body="Свойство и рассчитанные из него эффекты будут удалены из листа."
          onCancel={() => setDeleteCard(null)}
          onConfirm={() => {
            characterService.removeSheetCard(character.id, deleteCard.id);
            setDeleteCard(null);
          }}
        />
      )}
    </section>
  );
}

function CustomFeatureDialog({
  card,
  onClose,
  onSave
}: {
  card: CharacterSheetCard | null;
  onClose: () => void;
  onSave: (input: Pick<CharacterSheetCard, 'name' | 'subtitle' | 'text'>) => void;
}) {
  const [name, setName] = useState(card?.name ?? '');
  const [subtitle, setSubtitle] = useState(card?.subtitle ?? '');
  const [text, setText] = useState(card?.text ?? '');
  const effects = useMemo(() => uniqueRuleEffectMessages(analyzeFeatureRules(text).effects), [text]);
  const canSave = name.trim().length > 0 && text.trim().length > 0;

  return (
    <Dialog className="character-custom-feature-dialog" aria-label={card ? `Редактирование свойства ${card.name}` : 'Новое свойство'} onClose={onClose}>
      <SectionHeader
        title={card ? 'Редактировать свойство' : 'Новое свойство'}
        actions={(
          <IconButton size="sm" variant="ghost" title="Закрыть" aria-label="Закрыть редактор свойства" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        )}
      />
      <div className="character-custom-feature-dialog__body">
        <TextField autoFocus label="Название" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        <TextField label="Источник или тип" value={subtitle} onChange={(event) => setSubtitle(event.currentTarget.value)} />
        <TextAreaField label="Текст правила" rows={10} value={text} onChange={(event) => setText(event.currentTarget.value)} />
        <section className="character-custom-feature-dialog__preview" aria-label="Распознанные эффекты свойства">
          <SectionHeader title="Распознано" />
          {effects.length === 0 ? (
            <p className="muted-text">Механических эффектов не найдено. Текст сохранится как обычное игровое правило.</p>
          ) : effects.map((effect) => (
            <ListItem
              key={`${effect.id}:${effect.summary}`}
              title={effect.summary}
              value={ruleEffectApplicationLabel(effect)}
              density="compact"
            />
          ))}
        </section>
      </div>
      <Toolbar className="character-custom-feature-dialog__actions" aria-label="Сохранение свойства">
        <Button size="sm" variant="ghost" onClick={onClose}>Отмена</Button>
        <Button size="sm" variant="primary" disabled={!canSave} onClick={() => onSave({ name: name.trim(), subtitle: subtitle.trim(), text: text.trim() })}>Сохранить</Button>
      </Toolbar>
    </Dialog>
  );
}

function renderRuleEffectProse(text: string, effects: readonly FeatureRuleEffect[]): ReactNode[] {
  const ranges = Array.from(new Map(effects.map((effect) => [
    `${effect.evidence.start}:${effect.evidence.end}`,
    { start: effect.evidence.start, end: effect.evidence.end, effects: effects.filter((candidate) => candidate.evidence.start === effect.evidence.start && candidate.evidence.end === effect.evidence.end) }
  ])).values()).sort((left, right) => left.start - right.start || left.end - right.end);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) nodes.push(text.slice(cursor, range.start));
    nodes.push(
      <CharacterRuleEffectText key={`${range.start}:${range.end}`} effects={range.effects}>
        {text.slice(range.start, range.end)}
      </CharacterRuleEffectText>
    );
    cursor = range.end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function CharacterLoadoutSummary({ character }: { character: Character }) {
  return (
    <section className="character-editor-section" aria-label="Снаряжение персонажа">
      <SectionHeader title="Оружие" />
      {character.weapons.map((weapon) => (
        <ListItem
          key={weapon.id}
          title={weapon.name}
          subtitle={`${TRAIT_LABELS[weapon.trait]} — ${weapon.range} — ${weapon.damageFormula}`}
        />
      ))}
      <SectionHeader title="Карты доменов" />
      {character.domainCards.map((card) => (
        <ListItem
          key={card.id}
          title={card.name}
          subtitle={`${DOMAIN_LABELS[card.domain] ?? card.domain} — уровень ${card.level}`}
          value={card.inLoadout ? 'Рука' : 'Хранилище'}
        />
      ))}
      <SectionHeader title="Инвентарь" />
      {character.inventory.map((item) => (
        <ListItem key={item.id} title={item.name} subtitle={cleanRulesText(item.text ?? '') || undefined} value={item.quantity} />
      ))}
    </section>
  );
}

function LevelUpPanel({
  character,
  content,
  domains,
  includePlaytest,
  role,
  actor,
  onClose
}: {
  character: Character;
  content?: ContentState;
  domains: DomainName[];
  includePlaytest: boolean;
  role: 'gm' | 'player';
  actor?: CharacterChangeActor;
  onClose: () => void;
}) {
  const nextLevel = Math.min(10, character.level + 1);
  const targetLevel = nextLevel;
  const steps = [
    { id: 'choices', label: 'Улучшения' },
    { id: 'details', label: 'Выборы' },
    { id: 'cards', label: 'Карты' },
    { id: 'review', label: 'Проверка' }
  ] as const;
  type LevelUpStep = typeof steps[number]['id'];
  const [step, setStep] = useState<LevelUpStep>('choices');
  const [selections, setSelections] = useState<CharacterAdvancementSelection[]>([]);
  const [sourceRank, setSourceRank] = useState<2 | 3 | 4>(nextLevel >= 8 ? 4 : nextLevel >= 5 ? 3 : 2);
  const [newExperienceName, setNewExperienceName] = useState('');
  const [experienceIncreaseIds, setExperienceIncreaseIds] = useState<string[]>([]);
  const [selectedDomainCardIds, setSelectedDomainCardIds] = useState<string[]>([]);
  const [domainCardHandReplacements, setDomainCardHandReplacements] = useState<Record<string, string>>({});
  const [exchangeOutCardId, setExchangeOutCardId] = useState('');
  const [exchangeInCardId, setExchangeInCardId] = useState('');
  const [multiclassClass, setMulticlassClass] = useState<DaggerheartClass | ''>('');
  const [multiclassDomain, setMulticlassDomain] = useState<DomainName | ''>('');
  const [multiclassSubclassId, setMulticlassSubclassId] = useState('');
  const [selectedTraits, setSelectedTraits] = useState<TraitId[]>([]);
  const [notes, setNotes] = useState('');
  const [applyIssues, setApplyIssues] = useState<string[]>([]);
  const choices = selections.map((selection) => selection.choice);
  const allowedContent = content ? filterBuilderContent(content.generic, includePlaytest) : null;
  const ruleModifiers = character.ruleModifiers;
  const isMulticlass = choices.includes('multiclass');
  const isSubclassUpgrade = choices.includes('subclass');
  const multiclassSubclassOptions = multiclassClass && content
    ? (allowedContent?.subclasses ?? []).filter((item) => isSubclassForClass(item, multiclassClass))
    : [];
  const selectedMulticlassSubclass = multiclassSubclassOptions.find((item) => item.id === multiclassSubclassId) ?? null;
  const selectedSubclass = allowedContent?.subclasses.find((item) => (
    item.slug === character.subclassSlug || item.name.trim().toLowerCase() === character.subclassName.trim().toLowerCase()
  ));
  const currentSubclassTiers = new Set(character.sheetCards.filter((card) => card.kind === 'subclassFeature').map((card) => card.subclassTier));
  const nextSubclassTier = currentSubclassTiers.has('specialization') ? 'mastery' : 'specialization';
  const subclassFeatures = selectedSubclass?.raw[nextSubclassTier === 'mastery' ? 'mastery_features' : 'specialization_features'];
  const multiclassFoundationCards = isMulticlass
    ? startingSubclassFeatureSheetCards(selectedMulticlassSubclass)
    : [];
  const subclassUpgradeCards: Array<Partial<CharacterSheetCard>> = isSubclassUpgrade && Array.isArray(subclassFeatures)
    ? subclassFeatures.map((feature, index) => ({
        id: `sheet-subclass-${selectedSubclass?.slug ?? character.id}-${nextSubclassTier}-${feature.id ?? index}`,
        kind: 'subclassFeature',
        name: String(feature.name ?? 'Особенность подкласса'),
        text: cleanRulesText(String(feature.main_body ?? feature.text ?? '')),
        sourceId: selectedSubclass?.sourceId ?? selectedSubclass?.id,
        subclassTier: nextSubclassTier
      }))
    : [];
  const levelUpSubclassCards = isMulticlass ? multiclassFoundationCards : subclassUpgradeCards;
  const plan = useMemo(() => buildCharacterLevelUpPlan(character, {
    targetLevel,
    advancementChoices: choices,
    advancementSelections: selections,
    multiclassClass,
    multiclassDomain,
    ruleModifiers,
    subclassCards: levelUpSubclassCards
  }), [character, choices, levelUpSubclassCards, multiclassClass, multiclassDomain, ruleModifiers, selections, targetLevel]);
  const selectedChoiceCost = plan.advancementChoiceCost;
  const choiceDefinitions = CHARACTER_ADVANCEMENT_CHOICES.filter((choice) => choice.id !== 'manual');
  const availableSourceRanks = plan.targetRank > 2
    ? [plan.targetRank - 1, plan.targetRank] as Array<2 | 3 | 4>
    : [2] as Array<2 | 3 | 4>;
  const effectiveMulticlassDomain = multiclassDomain || character.advancement?.multiclass?.domain || '';
  const domainCardOptions = useMemo(() => {
    const cards = allowedContent?.domainCards ?? [];
    return cards
      .filter((item) => {
        const card = domainCardFromLibrary(item, true);
        const ownDomainCard = domains.includes(card.domain) && card.level <= plan.domainCardMaxLevel;
        const multiclassDomainCard = Boolean(effectiveMulticlassDomain) && card.domain === effectiveMulticlassDomain && card.level <= plan.multiclassDomainCardMaxLevel;
        return ownDomainCard || multiclassDomainCard;
      })
      .filter((item) => !character.domainCards.some((card) => String(card.sourceId ?? card.id) === String(item.sourceId ?? item.id)))
      .slice(0, 120);
  }, [allowedContent?.domainCards, character.domainCards, domains, effectiveMulticlassDomain, plan.domainCardMaxLevel, plan.multiclassDomainCardMaxLevel]);
  const selectedDomainCards = selectedDomainCardIds
    .map((id) => domainCardOptions.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => domainCardFromLibrary(item, true));
  const handCards = character.domainCards.filter((card) => card.inLoadout && !card.permanentlyVaulted);
  const overflowDomainCards = selectedDomainCards.slice(Math.max(0, characterHandSize(ruleModifiers) - handCards.length));
  const selectedHandReplacementIds = overflowDomainCards
    .map((card) => domainCardHandReplacements[card.id])
    .filter(Boolean);
  const exchangeOutCard = character.domainCards.find((card) => card.id === exchangeOutCardId) ?? null;
  const exchangeInLibraryCard = (allowedContent?.domainCards ?? []).find((card) => card.id === exchangeInCardId) ?? null;
  const exchangeInCard = exchangeInLibraryCard ? domainCardFromLibrary(exchangeInLibraryCard, true) : null;
  const exchangeCardOptions = (allowedContent?.domainCards ?? []).filter((item) => {
    if (!exchangeOutCard) return false;
    const mapped = domainCardFromLibrary(item, true);
    const allowedDomain = domains.includes(mapped.domain) || mapped.domain === effectiveMulticlassDomain;
    const domainLevelLimit = domains.includes(mapped.domain) ? plan.domainCardMaxLevel : plan.multiclassDomainCardMaxLevel;
    const alreadyOwned = character.domainCards.some((card) => String(card.sourceId ?? card.id) === String(item.sourceId ?? item.id));
    return allowedDomain && mapped.level <= exchangeOutCard.level && mapped.level <= domainLevelLimit && !alreadyOwned && !selectedDomainCardIds.includes(item.id);
  });
  const multiclassClassOptions: RichChoicePickerItem[] = DAGGERHEART_CLASSES
    .filter((className) => (
      className !== 'Custom' &&
      className !== character.className &&
      (includePlaytest || !PLAYTEST_CLASSES.includes(className))
    ))
    .map((className) => {
      const definition = classDefinitionFor(content?.classes, className, includePlaytest);
      const classDomains = classDomainsFor(content?.classes, className, includePlaytest);
      return {
        id: className,
        title: CLASS_LABELS[className],
        subtitle: classDomains.map((domain) => DOMAIN_LABELS[domain]).filter(Boolean).join(' + '),
        description: definition ? [definition.body, classFeatureListText(definition)].filter(Boolean).join('\n\n') : undefined,
        imageUrl: definition?.imageUrl
      };
    });
  const multiclassClassCards = isMulticlass && multiclassClass
    ? classFeatureSheetCards(classDefinitionFor(content?.classes, multiclassClass, includePlaytest))
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
    advancementSelections: selections,
    proficiency: plan.expectedProficiency,
    experiences: newExperienceName.trim() ? [{ name: newExperienceName.trim(), modifier: 2, notes: 'Достижение ранга / повышение уровня' }] : [],
    experienceIncreases: experienceIncreaseIds.filter(Boolean).map((experienceId) => ({ experienceId })),
    domainCards: selectedDomainCards,
    domainCardHandReplacements: Object.fromEntries(overflowDomainCards
      .map((card) => [card.id, domainCardHandReplacements[card.id]] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))),
    ...(exchangeOutCard && exchangeInCard ? {
      domainCardExchange: { removeCardId: exchangeOutCard.id, replacement: exchangeInCard }
    } : {}),
    subclassCards: levelUpSubclassCards,
    multiclassClassCards,
    thresholdBonus: plan.expectedThresholds,
    traitBonuses,
    hpMax: plan.expectedHpMax,
    stressMax: plan.expectedStressMax,
    evasion: plan.expectedEvasion,
    multiclassClass,
    multiclassDomain,
    multiclassSubclassName: selectedMulticlassSubclass?.name,
    multiclassSubclassSlug: selectedMulticlassSubclass?.slug,
    ruleModifiers,
    notes: notes.trim()
  };
  const validation = characterService.validateLevelUp(character.id, applicationInput);
  const canApply = character.level < 10 && Boolean(validation?.canApply);
  const currentStepIndex = Math.max(0, steps.findIndex((item) => item.id === step));

  useEffect(() => {
    setSelectedTraits((current) => current.slice(0, plan.requiredTraitBonuses));
    setExperienceIncreaseIds((current) => Array.from({ length: plan.requiredExperienceIncreases }, (_, index) => current[index] ?? ''));
    setSelectedDomainCardIds((current) => Array.from({ length: plan.requiredDomainCards }, (_, index) => current[index] ?? ''));
    setApplyIssues([]);
  }, [plan.requiredDomainCards, plan.requiredExperienceIncreases, plan.requiredTraitBonuses]);

  useEffect(() => {
    if (plan.requiredNewExperiences === 0) setNewExperienceName('');
  }, [plan.requiredNewExperiences]);

  useEffect(() => {
    if (!isMulticlass) {
      setMulticlassClass('');
      setMulticlassDomain('');
      setMulticlassSubclassId('');
    }
    setSelectedDomainCardIds((current) => current.map((id, index) => index === 0 ? '' : id));
  }, [isMulticlass]);

  const addChoice = (choice: CharacterAdvancementChoiceId) => {
    const definition = CHARACTER_ADVANCEMENT_CHOICES.find((item) => item.id === choice);
    const selectedInRank = selections.filter((selection) => selection.choice === choice && selection.rank === sourceRank).length;
    if (
      !definition || definition.id === 'manual' ||
      selectedChoiceCost + definition.cost > plan.requiredAdvancementChoices ||
      selectedInRank >= remainingAdvancementChoiceUses(character, sourceRank, choice, ruleModifiers)
    ) return;
    setSelections((current) => [...current, { choice, rank: sourceRank }]);
  };

  const removeChoice = (choice: CharacterAdvancementChoiceId) => {
    setSelections((current) => {
      const index = current.map((selection) => selection.choice === choice && selection.rank === sourceRank).lastIndexOf(true);
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
  const issueCodesByStep: Record<LevelUpStep, CharacterLevelUpIssueCode[]> = {
    choices: ['choices.required', 'choices.manualForbidden', 'choices.unavailable', 'choices.exhausted'],
    details: ['traits.invalid', 'experience.rankAchievement', 'experience.increaseInvalid', 'multiclass.detailsRequired', 'multiclass.alreadyTaken', 'multiclass.featuresRequired', 'subclass.invalid'],
    cards: ['domainCards.count', 'domainCards.invalid', 'domainCards.exchangeInvalid', 'domainCards.loadoutInvalid'],
    review: validation?.issues.map((issue) => issue.code) ?? []
  };
  const issuesForStep = (targetStep: LevelUpStep) => validation?.issues.filter((issue) => issueCodesByStep[targetStep].includes(issue.code)) ?? [];
  const goPrevious = () => {
    setApplyIssues([]);
    setStep(steps[Math.max(0, currentStepIndex - 1)].id);
  };
  const goNext = () => {
    if (step === 'cards' && exchangeOutCardId && !exchangeInCardId) {
      setApplyIssues(['Выберите новую карту для замены или отмените замену.']);
      return;
    }
    const currentIssues = issuesForStep(step);
    if (currentIssues.length > 0) {
      setApplyIssues(currentIssues.map((issue) => issue.message));
      return;
    }
    setApplyIssues([]);
    setStep(steps[Math.min(steps.length - 1, currentStepIndex + 1)].id);
  };

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
                onClick={() => {
                  if (index <= currentStepIndex) {
                    setApplyIssues([]);
                    setStep(item.id);
                  } else if (index === currentStepIndex + 1) {
                    goNext();
                  }
                }}
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
              <span className="cinematic-card-meta">Шаг {currentStepIndex + 1} из {steps.length}</span>
              <strong>{character.name}</strong>
              <p>{`Уровень ${character.level} → ${targetLevel} — ${plan.rankLabel}`}</p>
            </div>
          </header>

          <div className="cinematic-builder-workspace character-level-up-wizard__workspace" role="region" aria-label="Выборы повышения уровня">
            {step === 'choices' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Улучшения">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Улучшения</h3>
                  <p className="cinematic-builder-copy">Выберите улучшения на {plan.requiredAdvancementChoices} очка.</p>
                </header>
                <Notice tone={selectedChoiceCost === plan.requiredAdvancementChoices ? 'success' : 'info'}>
                  {selectedChoiceCost} из {plan.requiredAdvancementChoices} очков
                </Notice>
                {availableSourceRanks.length > 1 && (
                  <SelectField
                    label="Отметки ранга"
                    value={sourceRank}
                    onChange={(event) => setSourceRank(Number(event.currentTarget.value) as 2 | 3 | 4)}
                  >
                    {availableSourceRanks.map((rank) => {
                      const used = Object.values(character.advancement?.choiceUsesByRank[rank] ?? {}).reduce((total, value) => total + (value ?? 0), 0);
                      const selected = selections.filter((selection) => selection.rank === rank).length;
                      return <option key={rank} value={rank}>Ранг {rank} — отмечено {used + selected}</option>;
                    })}
                  </SelectField>
                )}
                <div className="stack">
                  {choiceDefinitions.filter((choice) => !choice.minLevel || sourceRank >= 3).map((choice) => {
                    const count = selections.filter((selection) => selection.choice === choice.id && selection.rank === sourceRank).length;
                    const remaining = Math.max(0, remainingAdvancementChoiceUses(character, sourceRank, choice.id, ruleModifiers) - count);
                    return (
                      <ListItem
                        key={choice.id}
                        title={choice.label}
                        subtitle={`Стоимость: ${choice.cost} — ${remaining > 0 ? `осталось отметок: ${remaining}` : 'отметки закончились'}`}
                        value={count > 0 ? `×${count}` : undefined}
                        rightAccessory={(
                          <Toolbar aria-label={`Количество: ${choice.label}`}>
                            <Button size="xs" type="button" disabled={count === 0} onClick={() => removeChoice(choice.id)} aria-label={`Убрать: ${choice.label}`}>−</Button>
                            <Button
                              size="xs"
                              type="button"
                              disabled={remaining === 0 || selectedChoiceCost + choice.cost > plan.requiredAdvancementChoices}
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

            {step === 'details' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Выборы">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Уточните выборы</h3>
                  <p className="cinematic-builder-copy">Заполните только то, что появилось из улучшений.</p>
                </header>
                {plan.rankAchievements.length > 0 && (
                  <Notice className="character-level-up-wizard__automatic-summary" tone="info">
                    Автоматически: {plan.rankAchievements.filter((item) => !item.includes('Новый Опыт')).join(' — ')}
                  </Notice>
                )}
                {plan.requiredNewExperiences > 0 && <TextField label="Новый Опыт (+2)" value={newExperienceName} onChange={(event) => setNewExperienceName(event.currentTarget.value)} />}
                {plan.requiredExperienceIncreases > 0 && Array.from({ length: plan.requiredExperienceIncreases }, (_, index) => (
                  <SelectField
                    key={`experience-${index}`}
                    label={`Увеличить Опыт — ${index + 1} из ${plan.requiredExperienceIncreases}`}
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
                {isMulticlass && <div className="grid-3">
                  <RichChoicePicker label="Новый класс" value={multiclassClass} placeholder="Выберите класс" items={multiclassClassOptions} onChange={(className) => {
                    setMulticlassClass(className as DaggerheartClass);
                    setMulticlassDomain('');
                    setMulticlassSubclassId('');
                    setSelectedDomainCardIds((current) => current.map((id, index) => index === 0 ? '' : id));
                  }} />
                  <SelectField label="Новый домен" value={multiclassDomain} onChange={(event) => {
                    setMulticlassDomain(event.currentTarget.value as DomainName | '');
                    setSelectedDomainCardIds((current) => current.map((id, index) => index === 0 ? '' : id));
                  }}>
                    <option value="">Выберите домен</option>
                    {(multiclassClass ? CLASS_DOMAINS[multiclassClass] : []).filter((domain) => !domains.includes(domain) && domain !== 'Custom').map((domain) => (
                      <option key={domain} value={domain}>{DOMAIN_LABELS[domain]}</option>
                    ))}
                  </SelectField>
                  <RichChoicePicker
                    label="Подкласс"
                    value={multiclassSubclassId}
                    placeholder="Выберите подкласс"
                    items={multiclassSubclassOptions.map((subclass) => ({
                      id: subclass.id,
                      title: subclass.name,
                      subtitle: subclass.subtitle,
                      description: featureListText(subclass, 8),
                      imageUrl: subclass.imageUrl
                    }))}
                    onChange={setMulticlassSubclassId}
                  />
                </div>}
                {isSubclassUpgrade && (
                  <Notice tone={subclassUpgradeCards.length > 0 ? 'success' : 'error'}>
                    {subclassUpgradeCards.length > 0
                      ? `Будут добавлены: ${subclassUpgradeCards.map((card) => card.name).join(', ')}.`
                      : 'Не удалось найти следующую карту подкласса.'}
                  </Notice>
                )}
              </section>
            )}

            {step === 'cards' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Карты">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Новые карты</h3>
                  <p className="cinematic-builder-copy">Выберите {plan.requiredDomainCards === 1 ? 'карту' : `карты: ${plan.requiredDomainCards}`} уровня не выше {plan.domainCardMaxLevel}.</p>
                </header>
                {selectedDomainCardIds.map((selectedId, index) => {
                  const multiclassSlot = isMulticlass && index === 0;
                  const cardItems = domainCardOptions.filter((card) => {
                    const mapped = domainCardFromLibrary(card, true);
                    if (card.id === exchangeInCardId) return false;
                    if (multiclassSlot && mapped.domain !== multiclassDomain) return false;
                    return !selectedDomainCardIds.some((id, itemIndex) => itemIndex !== index && id === card.id);
                  }).map(domainCardPickerItem);
                  return (
                    <RichChoicePicker
                      key={`domain-card-${index}`}
                      label={multiclassSlot ? 'Карта домена мультикласса' : index === 0 ? 'Обязательная карта домена' : `Дополнительная карта домена ${index}`}
                      value={selectedId}
                      placeholder="Выберите карту"
                      items={cardItems}
                      onChange={(itemId) => setSelectedDomainCardIds((current) => current.map((id, itemIndex) => itemIndex === index ? itemId : id))}
                    />
                  );
                })}
                {overflowDomainCards.length > 0 && (
                  <Notice tone="info">Рука заполнена. Новые карты останутся в Хранилище, если сейчас бесплатно не заменить ими карты в Руке.</Notice>
                )}
                {overflowDomainCards.map((card) => (
                  <RichChoicePicker
                    key={`hand-replacement-${card.id}`}
                    label={`В Руку: ${card.name}`}
                    value={domainCardHandReplacements[card.id] ?? ''}
                    placeholder="Оставить в Хранилище"
                    emptyOptionLabel="Оставить в Хранилище"
                    items={handCards
                      .filter((candidate) => candidate.id !== exchangeOutCardId)
                      .filter((candidate) => domainCardHandReplacements[card.id] === candidate.id || !selectedHandReplacementIds.includes(candidate.id))
                      .map((candidate) => ({
                        id: candidate.id,
                        title: candidate.name,
                        subtitle: `${DOMAIN_LABELS[candidate.domain] ?? candidate.domain} — уровень ${candidate.level}`,
                        description: cleanRulesText(candidate.text),
                        imageUrl: candidate.imageUrl
                      }))}
                    onChange={(replacementId) => setDomainCardHandReplacements((current) => ({ ...current, [card.id]: replacementId }))}
                  />
                ))}
                {character.domainCards.length > 0 && (
                  <div className="grid-2">
                    <RichChoicePicker
                      label="Обменять карту из коллекции (необязательно)"
                      value={exchangeOutCardId}
                      placeholder="Без замены"
                      emptyOptionLabel="Без замены"
                      items={character.domainCards
                        .filter((card) => !selectedHandReplacementIds.includes(card.id))
                        .map((card) => ({
                        id: card.id,
                        title: card.name,
                        subtitle: `${DOMAIN_LABELS[card.domain] ?? card.domain} — уровень ${card.level}`,
                        description: cleanRulesText(card.text),
                        imageUrl: card.imageUrl
                      }))}
                      onChange={(itemId) => {
                        setExchangeOutCardId(itemId);
                        setExchangeInCardId('');
                      }}
                    />
                    {exchangeOutCard && (
                      <RichChoicePicker
                        label="Карта взамен"
                        value={exchangeInCardId}
                        placeholder="Выберите карту"
                        items={exchangeCardOptions.map(domainCardPickerItem)}
                        onChange={setExchangeInCardId}
                      />
                    )}
                  </div>
                )}
              </section>
            )}

            {step === 'review' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Проверка">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Проверка</h3>
                </header>
                <div className="stat-strip">
                  <InlineStat label="Уровень" value={`${character.level} -> ${targetLevel}`} />
                  <InlineStat label="Мастерство" value={applicationInput.proficiency ?? character.proficiency} />
                  <InlineStat label="Пороги" value={`${character.thresholds.major} / ${character.thresholds.severe} → ${applicationInput.thresholdBonus?.major} / ${applicationInput.thresholdBonus?.severe}`} />
                  <InlineStat label="Карты" value={`${selectedDomainCards.length}/${plan.requiredDomainCards}`} />
                </div>
                <div className="stack">
                  {selections.map((selection, index) => (
                    <ListItem key={`${selection.choice}-${selection.rank}-${index}`} title={`Улучшение — ранг ${selection.rank}`} value={advancementChoiceLabel(selection.choice)} />
                  ))}
                  {plan.expectedHpMax !== character.hp.max && <ListItem title="Максимум Ран" value={`${character.hp.max} → ${plan.expectedHpMax}`} />}
                  {plan.expectedStressMax !== character.stress.max && <ListItem title="Максимум Стресса" value={`${character.stress.max} → ${plan.expectedStressMax}`} />}
                  {plan.expectedEvasion !== character.evasion && <ListItem title="Уклонение" value={`${character.evasion} → ${plan.expectedEvasion}`} />}
                  {selectedTraits.map((trait) => <ListItem key={trait} title={TRAIT_LABELS[trait]} value="+1" />)}
                  {newExperienceName.trim() && <ListItem title="Новый Опыт" value={`${newExperienceName.trim()} +2`} />}
                  {experienceIncreaseIds.filter(Boolean).map((experienceId) => {
                    const experience = character.experiences.find((item) => item.id === experienceId);
                    return experience ? <ListItem key={experienceId} title={`Опыт: ${experience.name}`} value={`${experience.modifier} → ${experience.modifier + 1}`} /> : null;
                  })}
                  {selectedDomainCards.map((card) => {
                    const replacement = handCards.find((item) => item.id === domainCardHandReplacements[card.id]);
                    const placement = overflowDomainCards.some((item) => item.id === card.id)
                      ? replacement ? `Рука вместо «${replacement.name}»` : 'Хранилище'
                      : 'Рука';
                    return <ListItem key={card.id} title="Новая карта" value={`${card.name} — ${placement}`} />;
                  })}
                  {exchangeOutCard && exchangeInCard && (
                    <ListItem title={`Обмен карты: ${exchangeOutCard.name}`} value={exchangeInCard.name} />
                  )}
                  {isMulticlass && selectedMulticlassSubclass && (
                    <ListItem title="Мультикласс" value={`${CLASS_LABELS[multiclassClass as DaggerheartClass]} — ${selectedMulticlassSubclass.name}`} />
                  )}
                  {isMulticlass && multiclassClassCards.length > 0 && (
                    <ListItem title="Свойства класса" subtitle={multiclassClassCards.map((card) => card.name).join(' — ')} />
                  )}
                  {(multiclassFoundationCards.length > 0 || subclassUpgradeCards.length > 0) && (
                    <ListItem title="Карта подкласса" subtitle={[...multiclassFoundationCards, ...subclassUpgradeCards].map((card) => card.name).join(' — ')} />
                  )}
                </div>
                <TextAreaField label="Заметка (необязательно)" value={notes} rows={3} onChange={(event) => setNotes(event.currentTarget.value)} />
              </section>
            )}
          </div>

          {applyIssues.length > 0 && (
            <Notice tone="error" role="alert">
              {[...new Set(applyIssues)].join(' ')}
            </Notice>
          )}
          {step === 'review' && validation?.strictlyValid && <Notice tone="success">Всё готово к повышению.</Notice>}

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

function applyArmorFromCatalog(characterId: string, items: LibraryEquipmentItem[], itemId: string) {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return;
  const plan = buildEquipmentAttachmentPlan(item);
  if (plan.armor) {
    characterService.updateArmor(characterId, plan.armor, true);
  }
}

function domainCardPickerItem(item: GenericLibraryItem): RichChoicePickerItem {
  const card = domainCardFromLibrary(item, true);
  return {
    id: item.id,
    title: item.name,
    subtitle: `${DOMAIN_LABELS[card.domain] ?? card.domain} — уровень ${card.level}`,
    description: cleanRulesText(card.text || item.body),
    imageUrl: item.imageUrl
  };
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
