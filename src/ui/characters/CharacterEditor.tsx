import { Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Dialog } from '../components/common/Dialog';
import { NumberField, SelectField, TextAreaField, TextField } from '../components/common/Field';
import { IconButton } from '../components/common/IconButton';
import { InlineStat } from '../components/common/InlineStat';
import { ImageFilePicker } from '../components/common/ImageFilePicker';
import { WizardStepButton } from '../components/common/WizardStepButton';
import { CLASS_LABELS, DAGGERHEART_CLASSES, DOMAIN_LABELS, TRAIT_LABELS } from '../../domain/rules/constants';
import type { ContentState, GenericLibraryItem, LibraryEquipmentItem } from '../../domain/content/types';
import { classDomainsFor, domainCardFromLibrary, filterBuilderContent, isDomainCardForDomains, isSubclassForClass } from '../../domain/characterBuilder';
import { buildEquipmentAttachmentPlan } from '../../domain/rules/equipment';
import { advancementChoiceLabel, buildCharacterLevelUpPlan, CHARACTER_ADVANCEMENT_CHOICES, formatLevelUpNotes, type CharacterAdvancementChoiceId } from '../../domain/rules/levelUp';
import type { Character, DaggerheartClass, DomainCardRecord, DomainName, TraitId } from '../../domain/rules/types';
import { characterService } from '../../services/serviceRegistry';
import { readFileAsDataUrl } from '../vtt/playerView/sharedTools/readFileAsDataUrl';
import { TraitGrid } from './TraitGrid';
import { ResourcePanel } from './ResourcePanel';
import { ExperienceList } from './ExperienceList';
import { LoadoutPanel } from './LoadoutPanel';

export function CharacterEditor({ character, content }: { character: Character; content?: ContentState }) {
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const builderContent = content ? filterBuilderContent(content.generic) : null;
  const classSubclasses = builderContent?.subclasses.filter((item) => isSubclassForClass(item, character.className)) ?? [];
  const selectedAncestryId = itemIdByName(builderContent?.ancestries, character.ancestry);
  const selectedCommunityId = itemIdByName(builderContent?.communities, character.community);
  const selectedSubclassId = itemIdByName(classSubclasses, character.subclassName);
  const armorOptions = content?.equipment.filter((item) => item.type === 'armor') ?? [];
  const selectedArmorId = equipmentIdByName(armorOptions, character.armor.name);
  const domains = content ? classDomainsFor(content.classes, character.className) : character.domains;

  return (
    <div className="stack gap-lg character-editor-compact">
      <Card
        title={character.name}
        subtitle={`${CLASS_LABELS[character.className]} · Уровень ${character.level}`}
        actions={
          <div className="button-row">
            {character.level < 10 && <Button variant="primary" onClick={() => setLevelUpOpen(true)}>Повысить уровень</Button>}
            <Button onClick={() => characterService.duplicateCharacter(character.id)}>Дублировать</Button>
            <IconButton variant="danger" size="sm" type="button" title="Удалить персонажа" aria-label={`Удалить персонажа ${character.name}`} onClick={() => characterService.deleteCharacter(character.id)}>
              <Trash2 size={15} aria-hidden="true" />
            </IconButton>
          </div>
        }
      >
        <div className="character-editor-identity">
          <PortraitPicker character={character} />
          <div className="character-editor-fields">
            <div className="grid-4">
              <TextField
                label="Имя"
                value={character.name}
                onChange={(event) => characterService.updateIdentity(character.id, { name: event.currentTarget.value })}
              />
              <TextField
                label="Местоимения"
                value={character.pronouns}
                onChange={(event) => characterService.updateIdentity(character.id, { pronouns: event.currentTarget.value })}
              />
              <NumberField
                label="Уровень"
                value={character.level}
                min={1}
                max={10}
                onChange={(event) => characterService.updateLevel(character.id, Number(event.currentTarget.value))}
              />
            </div>
            <div className="grid-4">
              <SelectField
                label="Класс"
                value={character.className}
                onChange={(event) => characterService.updateClass(character.id, event.currentTarget.value as DaggerheartClass)}
              >
                {DAGGERHEART_CLASSES.filter((className) => className !== 'Custom').map((className) => <option key={className} value={className}>{CLASS_LABELS[className]}</option>)}
              </SelectField>
              {builderContent ? (
                <SelectField
                  label="Родословная"
                  value={selectedAncestryId}
                  onChange={(event) => updateIdentityFromLibrary(character.id, 'ancestry', builderContent.ancestries, event.currentTarget.value)}
                >
                  <option value="">{character.ancestry || 'Не выбрана'}</option>
                  {builderContent.ancestries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </SelectField>
              ) : (
                <TextField label="Родословная" value={character.ancestry} onChange={(event) => characterService.updateIdentity(character.id, { ancestry: event.currentTarget.value })} />
              )}
              {builderContent ? (
                <SelectField
                  label="Сообщество"
                  value={selectedCommunityId}
                  onChange={(event) => updateIdentityFromLibrary(character.id, 'community', builderContent.communities, event.currentTarget.value)}
                >
                  <option value="">{character.community || 'Не выбрано'}</option>
                  {builderContent.communities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </SelectField>
              ) : (
                <TextField label="Сообщество" value={character.community} onChange={(event) => characterService.updateIdentity(character.id, { community: event.currentTarget.value })} />
              )}
              {builderContent ? (
                <SelectField
                  label="Подкласс"
                  value={selectedSubclassId}
                  onChange={(event) => updateIdentityFromLibrary(character.id, 'subclassName', classSubclasses, event.currentTarget.value)}
                >
                  <option value="">{character.subclassName || 'Не выбран'}</option>
                  {classSubclasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </SelectField>
              ) : (
                <TextField label="Подкласс" value={character.subclassName} onChange={(event) => characterService.updateIdentity(character.id, { subclassName: event.currentTarget.value })} />
              )}
            </div>
          </div>
        </div>
        <div className="stat-strip">
          <InlineStat label="Домены" value={domains.map((domain) => DOMAIN_LABELS[domain]).join(' + ')} />
        </div>
      </Card>

      {levelUpOpen && <LevelUpPanel character={character} content={content} domains={domains} onClose={() => setLevelUpOpen(false)} />}

      <Card title="Характеристики">
        <TraitGrid character={character} />
        <div className="stat-strip top-gap">
          <InlineStat label="Броня" value={`${Math.max(0, character.armor.score - character.armor.markedSlots)}/${character.armor.score}`} />
          <InlineStat label="Уклонение" value={character.evasion} />
          <InlineStat label="Ощутимый" value={character.thresholds.major} />
          <InlineStat label="Тяжелый" value={character.thresholds.severe} />
        </div>
        <div className="grid-3 top-gap">
          <NumberField
            label="Уклонение"
            value={character.evasion}
            onChange={(event) => characterService.updateEvasion(character.id, Number(event.currentTarget.value))}
          />
          <NumberField
            label="Мастерство"
            value={character.proficiency}
            onChange={(event) => characterService.updateProficiency(character.id, Number(event.currentTarget.value))}
          />
          {armorOptions.length > 0 ? (
            <SelectField
              label="Броня"
              value={selectedArmorId}
              onChange={(event) => applyArmorFromCatalog(character.id, armorOptions, event.currentTarget.value)}
            >
              <option value="">{armorLabel(character.armor.name)}</option>
              {armorOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </SelectField>
          ) : (
            <TextField
              label="Броня"
              value={armorLabel(character.armor.name)}
              onChange={(event) => characterService.updateArmor(character.id, { name: event.currentTarget.value }, false)}
            />
          )}
        </div>
        <details className="stack top-gap">
          <summary className="section-subtitle">Дополнительно</summary>
          <div className="grid-5">
            <NumberField
              label="Порог Ощутимого урона"
              value={character.thresholds.major}
              onChange={(event) => characterService.updateThresholds(character.id, { major: Number(event.currentTarget.value) })}
            />
            <NumberField
              label="Порог Тяжелого урона"
              value={character.thresholds.severe}
              onChange={(event) => characterService.updateThresholds(character.id, { severe: Number(event.currentTarget.value) })}
            />
            <NumberField
              label="База Ощутимого"
              value={character.armor.baseMajor}
              onChange={(event) => characterService.updateArmor(character.id, { baseMajor: Number(event.currentTarget.value) })}
            />
            <NumberField
              label="База Тяжелого"
              value={character.armor.baseSevere}
              onChange={(event) => characterService.updateArmor(character.id, { baseSevere: Number(event.currentTarget.value) })}
            />
            <NumberField
              label="Показатель Брони"
              value={character.armor.score}
              onChange={(event) => characterService.updateArmor(character.id, { score: Number(event.currentTarget.value) }, false)}
            />
          </div>
          <TextField
            label="Свойство Брони"
            value={character.armor.feature ?? character.armor.featureText ?? ''}
            onChange={(event) => characterService.updateArmor(character.id, { feature: event.currentTarget.value, featureText: event.currentTarget.value }, false)}
          />
        </details>
      </Card>

      <Card title="Ресурсы">
        <ResourcePanel character={character} />
      </Card>

      <Card title="Опыты / навыки">
        <ExperienceList character={character} />
      </Card>

      <Card title="Снаряжение">
        <LoadoutPanel character={character} content={content} />
      </Card>

      <Card title="Заметки">
        <TextAreaField
          label="Заметки персонажа"
          value={character.notes}
          onChange={(event) => characterService.updateIdentity(character.id, { notes: event.currentTarget.value })}
        />
      </Card>
    </div>
  );
}

function LevelUpPanel({ character, content, domains, onClose }: { character: Character; content?: ContentState; domains: DomainName[]; onClose: () => void }) {
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
  const [choiceOne, setChoiceOne] = useState<CharacterAdvancementChoiceId>('domainCard');
  const [choiceTwo, setChoiceTwo] = useState<CharacterAdvancementChoiceId>('manual');
  const [newExperienceName, setNewExperienceName] = useState('');
  const [selectedDomainCardId, setSelectedDomainCardId] = useState('');
  const [proficiency, setProficiency] = useState(character.proficiency);
  const [majorThreshold, setMajorThreshold] = useState(character.thresholds.major + 1);
  const [severeThreshold, setSevereThreshold] = useState(character.thresholds.severe + 1);
  const [hpMax, setHpMax] = useState(character.hp.max);
  const [stressMax, setStressMax] = useState(character.stress.max);
  const [evasion, setEvasion] = useState(character.evasion);
  const [multiclassClass, setMulticlassClass] = useState<DaggerheartClass | ''>('');
  const [multiclassDomain, setMulticlassDomain] = useState<DomainName | ''>('');
  const [traitBonuses, setTraitBonuses] = useState<Partial<Record<TraitId, number>>>({});
  const [notes, setNotes] = useState('');
  const choices = [choiceOne, choiceTwo];
  const plan = useMemo(() => buildCharacterLevelUpPlan(character, {
    targetLevel,
    advancementChoices: choices,
    multiclassClass,
    multiclassDomain
  }), [character, choiceOne, choiceTwo, multiclassClass, multiclassDomain, targetLevel]);
  const domainCardOptions = useMemo(() => {
    const cards = content?.generic.domainCards ?? [];
    return cards
      .filter((item) => isDomainCardForDomains(item, domains))
      .filter((item) => domainCardFromLibrary(item, true).level <= plan.domainCardMaxLevel)
      .filter((item) => !character.domainCards.some((card) => card.id === item.id))
      .slice(0, 120);
  }, [character.domainCards, content?.generic.domainCards, domains, plan.domainCardMaxLevel]);
  const selectedDomainCard = domainCardOptions.find((item) => item.id === selectedDomainCardId) ?? null;
  const canApply = character.level < 10;
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
    setTraitBonuses({});
    setSelectedDomainCardId('');
    setNewExperienceName('');
    setNotes('');
  }, [character.id, character.level, character.proficiency, character.thresholds.major, character.thresholds.severe, character.hp.max, character.stress.max, character.evasion]);

  useEffect(() => {
    const thresholdIncrease = Math.max(0, targetLevel - character.level);
    setMajorThreshold(character.thresholds.major + thresholdIncrease);
    setSevereThreshold(character.thresholds.severe + thresholdIncrease);
    setProficiency(character.proficiency + (targetLevel === 2 || targetLevel === 5 || targetLevel === 8 ? 1 : 0));
  }, [character.level, character.proficiency, character.thresholds.major, character.thresholds.severe, targetLevel]);

  const applyLevelUp = () => {
    const levelUpNotes = formatLevelUpNotes({
      plan,
      choices,
      extraNotes: notes,
      multiclassClass,
      multiclassDomain,
      traitBonuses
    });
    const domainCards: Array<Partial<DomainCardRecord>> = selectedDomainCard ? [domainCardFromLibrary(selectedDomainCard, true)] : [];
    const applied = characterService.applyLevelUp(character.id, {
      level: targetLevel,
      proficiency,
      experiences: newExperienceName.trim() ? [{ name: newExperienceName.trim(), modifier: 2, notes: 'Достижение ранга / повышение уровня' }] : [],
      domainCards,
      thresholdBonus: { major: majorThreshold, severe: severeThreshold },
      advancementChoices: choices,
      traitBonuses,
      hpMax,
      stressMax,
      evasion,
      notes: levelUpNotes
    });
    if (applied) onClose();
  };
  const goPrevious = () => setStep(steps[Math.max(0, currentStepIndex - 1)].id);
  const goNext = () => setStep(steps[Math.min(steps.length - 1, currentStepIndex + 1)].id);

  return (
    <Dialog className="cinematic-builder character-level-up-wizard" onClose={onClose}>
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

        <div className="cinematic-builder-panel dh-scroll">
          <header className="cinematic-builder-stage">
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

          <div className="cinematic-builder-workspace character-level-up-wizard__workspace">
            {step === 'overview' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Новый уровень</h3>
                  <p className="cinematic-builder-copy">{plan.summary}</p>
                </header>
                {plan.warnings.length > 0 && <p className="muted-text">{plan.warnings.join(' ')}</p>}
                <div className="grid-4">
                  <NumberField label="Новый уровень" min={targetLevel} max={targetLevel} value={targetLevel} disabled />
                  <NumberField label="Мастерство" min={1} max={6} value={proficiency} onChange={(event) => setProficiency(Number(event.currentTarget.value))} />
                  <NumberField label="Порог Ощутимого" value={majorThreshold} onChange={(event) => setMajorThreshold(Number(event.currentTarget.value))} />
                  <NumberField label="Порог Тяжелого" value={severeThreshold} onChange={(event) => setSevereThreshold(Number(event.currentTarget.value))} />
                </div>
              </section>
            )}

            {step === 'choices' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Улучшения</h3>
                  <p className="cinematic-builder-copy">Выберите два улучшения ранга. Если правило спорное, оставьте ручную пометку и опишите решение в заметках.</p>
                </header>
                <div className="grid-2">
                  <SelectField label="Улучшение 1" value={choiceOne} onChange={(event) => setChoiceOne(event.currentTarget.value as CharacterAdvancementChoiceId)}>
                    {CHARACTER_ADVANCEMENT_CHOICES.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                  </SelectField>
                  <SelectField label="Улучшение 2" value={choiceTwo} onChange={(event) => setChoiceTwo(event.currentTarget.value as CharacterAdvancementChoiceId)}>
                    {CHARACTER_ADVANCEMENT_CHOICES.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                  </SelectField>
                </div>
              </section>
            )}

            {step === 'resources' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Параметры</h3>
                  <p className="cinematic-builder-copy">Проверьте только те значения, которые действительно меняются этим повышением.</p>
                </header>
                <div className="grid-4">
                  <NumberField label="Макс. Ран" min={1} max={12} value={hpMax} onChange={(event) => setHpMax(Number(event.currentTarget.value))} />
                  <NumberField label="Макс. Стресса" min={1} max={12} value={stressMax} onChange={(event) => setStressMax(Number(event.currentTarget.value))} />
                  <NumberField label="Уклонение" value={evasion} onChange={(event) => setEvasion(Number(event.currentTarget.value))} />
                  <TextField label="Новый Опыт +2" value={newExperienceName} onChange={(event) => setNewExperienceName(event.currentTarget.value)} />
                </div>
                <div className="grid-3">
                  {(Object.keys(TRAIT_LABELS) as TraitId[]).map((trait) => (
                    <NumberField
                      key={trait}
                      label={`Бонус: ${TRAIT_LABELS[trait]}`}
                      value={traitBonuses[trait] ?? 0}
                      onChange={(event) => setTraitBonuses((current) => ({ ...current, [trait]: Number(event.currentTarget.value) }))}
                    />
                  ))}
                </div>
              </section>
            )}

            {step === 'domain' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Карты и мультикласс</h3>
                  <p className="cinematic-builder-copy">Карта выбирается из доступных доменов и уровня. Все сложные решения можно оставить на ручной выбор позже.</p>
                </header>
                <SelectField label="Новая карта домена" value={selectedDomainCardId} onChange={(event) => setSelectedDomainCardId(event.currentTarget.value)}>
                  <option value="">Добавить вручную позже</option>
                  {domainCardOptions.map((card) => {
                    const mapped = domainCardFromLibrary(card, true);
                    return <option key={card.id} value={card.id}>{card.name} · {mapped.domain} {mapped.level}</option>;
                  })}
                </SelectField>
                <div className="grid-2">
                  <SelectField label="Мультикласс" value={multiclassClass} onChange={(event) => setMulticlassClass(event.currentTarget.value as DaggerheartClass | '')}>
                    <option value="">Не выбран</option>
                    {DAGGERHEART_CLASSES.filter((className) => className !== 'Custom' && className !== character.className).map((className) => (
                      <option key={className} value={className}>{CLASS_LABELS[className]}</option>
                    ))}
                  </SelectField>
                  <SelectField label="Домен мультикласса" value={multiclassDomain} onChange={(event) => setMulticlassDomain(event.currentTarget.value as DomainName | '')}>
                    <option value="">Не выбран</option>
                    {Object.entries(DOMAIN_LABELS).filter(([domain]) => domain !== 'Custom').map(([domain, label]) => (
                      <option key={domain} value={domain}>{label}</option>
                    ))}
                  </SelectField>
                </div>
              </section>
            )}

            {step === 'notes' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Заметки</h3>
                  <p className="cinematic-builder-copy">Зафиксируйте спорные решения, ручные выборы и договоренности игры.</p>
                </header>
                <TextAreaField label="Заметки повышения" value={notes} rows={8} onChange={(event) => setNotes(event.currentTarget.value)} />
              </section>
            )}

            {step === 'review' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Проверка</h3>
                  <p className="cinematic-builder-copy">Применение изменит лист персонажа и добавит заметку повышения.</p>
                </header>
                <div className="stat-strip">
                  <InlineStat label="Уровень" value={`${character.level} -> ${targetLevel}`} />
                  <InlineStat label="Мастерство" value={proficiency} />
                  <InlineStat label="Пороги" value={`${majorThreshold} / ${severeThreshold}`} />
                  <InlineStat label="Карта" value={selectedDomainCard?.name ?? 'Позже'} />
                </div>
                <p className="muted-text">{choices.map(advancementChoiceLabel).join(' / ')}</p>
              </section>
            )}
          </div>

          <div className="cinematic-builder-actions">
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

function PortraitPicker({ character }: { character: Character }) {
  const handlePortraitChange = async (file: File) => {
    const portraitUrl = await readFileAsDataUrl(file);
    characterService.updateIdentity(character.id, { portraitUrl });
  };

  return (
    <ImageFilePicker
      className="character-portrait-picker"
      label="Портрет"
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
