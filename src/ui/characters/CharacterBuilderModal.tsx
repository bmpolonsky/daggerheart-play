import { Sparkles, X } from 'lucide-react';
import { useState } from 'preact/hooks';
import type { ContentState, LibraryEquipmentItem } from '../../domain/content/types';
import {
  buildCharacterBuilderChoicePreview,
  cleanRulesText,
  featureListText,
  firstFeatureText
} from '../../domain/characterBuilder';
import { CLASS_LABELS, TRAIT_LABELS } from '../../domain/rules/constants';
import type { Character, DaggerheartClass } from '../../domain/rules/types';
import { formatWealthSummary } from '../../domain/rules/wealthPresentation';
import { Button } from '../components/common/Button';
import { AssetImage } from '../components/common/AssetImage';
import { ChoiceCard } from '../components/common/ChoiceCard';
import { Dialog } from '../components/common/Dialog';
import { SelectField, TextAreaField, TextField } from '../components/common/Field';
import { IconButton } from '../components/common/IconButton';
import { ImageFilePicker } from '../components/common/ImageFilePicker';
import { RichChoicePicker } from '../components/common/RichChoicePicker';
import { WizardStepButton } from '../components/common/WizardStepButton';
import { BuilderChoiceDetail } from './builder/BuilderChoiceDetail';
import { EditableBuilderStat } from './builder/EditableBuilderStat';
import { domainLabel, initials, signed } from './builder/formatting';
import { BUILDER_TRAIT_IDS } from './builder/traits';
import { useCharacterBuilder } from './useCharacterBuilder';
import { readFileAsDataUrl } from '../vtt/playerView/sharedTools/readFileAsDataUrl';

export function CharacterBuilderModal({
  content,
  classes,
  equipment,
  onCancel,
  onCreate
}: {
  content: ContentState['generic'];
  classes: ContentState['classes'];
  equipment: LibraryEquipmentItem[];
  onCancel: () => void;
  onCreate: (input: Partial<Character> & { className?: DaggerheartClass }) => void;
}) {
  const builder = useCharacterBuilder({ content, classes, equipment });
  const { step, steps, fields, options, result: builderResult, selections, handlers } = builder;
  const selectedAncestry = selections.ancestry;
  const selectedCommunity = selections.community;
  const selectedSubclass = selections.subclass;
  const selectedCards = selections.domainCards;
  const selectedClassOption = options.classOptions.find((item) => item.className === fields.className);
  const selectedArmor = options.armor.find((item) => item.id === fields.armorId || item.slug === fields.armorId) ?? options.armor[0];
  const selectedPrimaryWeapon = options.primaryWeapons.find((item) => item.id === fields.primaryWeaponId || item.slug === fields.primaryWeaponId) ?? options.primaryWeapons[0];
  const selectedSecondaryWeapon = options.secondaryWeapons.find((item) => item.id === fields.secondaryWeaponId || item.slug === fields.secondaryWeaponId) ?? options.secondaryWeapons[0] ?? null;
  const selectedConsumable = options.consumables.find((item) => item.id === fields.consumableId || item.slug === fields.consumableId) ?? options.consumables[0] ?? null;
  const choicePreview = buildCharacterBuilderChoicePreview({
    step,
    selectedClass: selectedClassOption,
    selectedAncestry: selectedAncestry ?? undefined,
    selectedCommunity: selectedCommunity ?? undefined,
    selectedSubclass: selectedSubclass ?? undefined,
    selectedSubclassModifiers: options.subclassRuleModifiers[selectedSubclass?.id ?? ''] ?? [],
    selectedCards,
    availableDomainCards: options.availableDomainCards,
    selectedCardIds: fields.selectedCardIds,
    requiredDomainCardCount: options.requiredDomainCardCount,
    selectedArmor,
    selectedPrimaryWeapon,
    selectedSecondaryWeapon: options.showSecondaryWeapon ? selectedSecondaryWeapon : null,
    selectedConsumable,
    classItem: fields.classItem
  });
  const choicePreviewKey = choicePreview ? `${step}:${choicePreview.kicker}:${choicePreview.title}:${choicePreview.subtitle ?? ''}` : '';
  const [hiddenChoicePreviewKey, setHiddenChoicePreviewKey] = useState('');
  const visibleChoicePreview = choicePreview && hiddenChoicePreviewKey !== choicePreviewKey ? choicePreview : null;
  const currentStepIndex = steps.findIndex((item) => item.id === step);
  const progress = Math.round(((currentStepIndex + 1) / steps.length) * 100);
  const blockingIssues = builder.issues.filter((issue) => issue.severity === 'blocking');
  const warningIssues = builder.issues.filter((issue) => issue.severity === 'warning');
  const createFromWizard = () => {
    if (!builder.canCreate) return;
    onCreate(builderResult.draft);
  };
  const handlePortraitUpload = async (file: File) => {
    handlers.setPortraitUrl(await readFileAsDataUrl(file));
  };

  return (
    <Dialog aria-label="Новый герой" className="cinematic-builder" onClose={onCancel}>
        <nav className="cinematic-builder-nav" aria-label="Шаги создания">
          <div className="cinematic-builder-header">
            <h2 className="cinematic-builder-title">Новый герой</h2>
            <IconButton variant="ghost" type="button" onClick={onCancel} aria-label="Закрыть">
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
                onClick={() => handlers.goToStep(item.id)}
              />
            ))}
          </div>
        </nav>

        <div className="cinematic-builder-panel dh-scroll" role="region" aria-label="Шаг создания героя">
          <header className="cinematic-builder-stage" aria-label="Сводка героя">
            <div className="cinematic-builder-stage-art">
              {selectedClassOption?.imageUrl ? <img src={selectedClassOption.imageUrl} alt="" /> : <span>{initials(CLASS_LABELS[fields.className])}</span>}
            </div>
            <div className="cinematic-builder-stage-copy">
              <span className="cinematic-card-meta">{steps[currentStepIndex]?.label ?? 'Создание'} — {progress}%</span>
              <strong>{CLASS_LABELS[fields.className]}</strong>
              <p>
                {[selectedAncestry?.name, selectedCommunity?.name, selectedSubclass?.name].filter(Boolean).join(' / ') ||
                  options.classDomains.map(domainLabel).join(' + ')}
              </p>
              <div className="cinematic-builder-progress" aria-label={`Прогресс создания ${progress}%`}>
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
            <Button className="cinematic-builder-quickstart" variant="primary" type="button" iconBefore={<Sparkles size={16} aria-hidden="true" />} onClick={handlers.quickStart}>
              Случайный герой
            </Button>
          </header>

          <div className={`cinematic-builder-workspace ${visibleChoicePreview ? 'dh-has-choice-detail' : ''}`} role="region" aria-label="Выборы создания героя">
            {step === 'class' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Класс">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Выберите класс</h3>
                  <p className="cinematic-builder-copy">Класс задает стартовые значения, две области и список доступных подклассов.</p>
                </header>
                <div className="dh-choice-grid cinematic-builder-choice-area dh-scroll">
                  {options.classOptions.map((item) => (
                    <ChoiceCard layout="class" selected={fields.className === item.className} key={item.className} type="button" onClick={() => handlers.selectClass(item.className)}>
                      {item.imageUrl && <AssetImage src={item.imageUrl} alt="" />}
                      <strong className="cinematic-card-title">{item.name}</strong>
                      <span className="cinematic-card-meta">{item.domains.map(domainLabel).join(' + ')}</span>
                      {item.body && <span className="cinematic-card-body">{cleanRulesText(item.body)}</span>}
                    </ChoiceCard>
                  ))}
                </div>
              </section>
            )}

            {step === 'ancestry' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Родословная">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Родословная</h3>
                </header>
                <div className="dh-choice-grid dh-choice-grid--media cinematic-builder-choice-area dh-scroll">
                  {options.builderContent.ancestries.slice(0, 36).map((item) => (
                    <ChoiceCard layout="media" selected={selectedAncestry?.id === item.id} key={item.id} type="button" onClick={() => handlers.selectAncestry(item.id)}>
                      {item.imageUrl && <AssetImage src={item.imageUrl} alt="" />}
                      <strong className="cinematic-card-title">{item.name}</strong>
                      <span className="cinematic-card-body">{featureListText(item) || cleanRulesText(item.body)}</span>
                    </ChoiceCard>
                  ))}
                </div>
              </section>
            )}

            {step === 'community' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Сообщество">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Сообщество</h3>
                </header>
                <div className="dh-choice-grid dh-choice-grid--media cinematic-builder-choice-area dh-scroll">
                  {options.builderContent.communities.map((item) => (
                    <ChoiceCard layout="media" selected={selectedCommunity?.id === item.id} key={item.id} type="button" onClick={() => handlers.selectCommunity(item.id)}>
                      {item.imageUrl && <AssetImage src={item.imageUrl} alt="" />}
                      <strong className="cinematic-card-title">{item.name}</strong>
                      <span className="cinematic-card-body">{featureListText(item) || cleanRulesText(item.body)}</span>
                    </ChoiceCard>
                  ))}
                </div>
              </section>
            )}

            {step === 'subclass' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Подкласс">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Подкласс</h3>
                </header>
                <div className="dh-choice-grid dh-choice-grid--media cinematic-builder-choice-area dh-scroll">
                  {options.classSubclasses.map((item) => (
                    <ChoiceCard layout="media" selected={selectedSubclass?.id === item.id} key={item.id} type="button" onClick={() => handlers.selectSubclass(item.id)}>
                      {item.imageUrl && <AssetImage src={item.imageUrl} alt="" />}
                      <strong className="cinematic-card-title">{item.name}</strong>
                      <span className="cinematic-card-meta">{item.subtitle}</span>
                      <span className="cinematic-card-body">{firstFeatureText(item) || cleanRulesText(item.body)}</span>
                    </ChoiceCard>
                  ))}
                </div>
              </section>
            )}

            {step === 'traits' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Характеристики">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Характеристики</h3>
                </header>
                <div className="dh-stat-grid cinematic-builder-choice-area dh-scroll">
                  {BUILDER_TRAIT_IDS.map((trait) => (
                    <EditableBuilderStat key={trait} label={TRAIT_LABELS[trait]} trait={trait} values={fields.traits} onChange={(value) => handlers.setTrait(trait, value)} />
                  ))}
                </div>
              </section>
            )}

            {step === 'identity' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Личность">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Личность</h3>
                </header>
                <div className="cinematic-builder-form cinematic-builder-identity-form cinematic-builder-choice-area dh-scroll">
                  <TextField className="character-builder-name-field" label="Имя" value={fields.name} onChange={(event) => handlers.setName(event.currentTarget.value)} />
                  <TextField className="character-builder-pronouns-field" label="Местоимения" value={fields.pronouns} onChange={(event) => handlers.setPronouns(event.currentTarget.value)} />
                  <ImageFilePicker
                    className="character-builder-portrait-picker"
                    label="Портрет"
                    hideLabel
                    imageUrl={fields.portraitUrl}
                    size="compact"
                    onFileSelect={handlePortraitUpload}
                    onClear={() => handlers.setPortraitUrl('')}
                  />
                  <TextAreaField className="character-builder-appearance-field" label="Внешность" value={fields.appearance} onChange={(event) => handlers.setAppearance(event.currentTarget.value)} />
                  <TextField className="character-builder-experience-one-field" label="Опыт 1" value={fields.experienceOne} onChange={(event) => handlers.setExperienceOne(event.currentTarget.value)} />
                  <TextField className="character-builder-experience-two-field" label="Опыт 2" value={fields.experienceTwo} onChange={(event) => handlers.setExperienceTwo(event.currentTarget.value)} />
                </div>
              </section>
            )}

            {step === 'background' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Предыстория">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Предыстория</h3>
                  <p className="cinematic-builder-copy">Вопросы берутся из выбранного класса и сохраняются в лист персонажа.</p>
                </header>
                <div className="cinematic-builder-form cinematic-builder-choice-area dh-scroll">
                  <TextAreaField className="dh-label--wide" label="Краткая предыстория" value={fields.backstory} onChange={(event) => handlers.setBackstory(event.currentTarget.value)} />
                  <div className="cinematic-card-list dh-label--wide">
                    {options.backgroundQuestions.map((question, index) => (
                      <section className="cinematic-builder-question" key={question}>
                        <span className="cinematic-card-meta">Вопрос {index + 1}</span>
                        <strong className="cinematic-card-title">{question}</strong>
                        <TextAreaField label="Ответ" value={fields.backgroundAnswers[index] ?? ''} onChange={(event) => handlers.setBackgroundAnswer(index, event.currentTarget.value)} />
                      </section>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {step === 'connections' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Связи">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Связи</h3>
                  <p className="cinematic-builder-copy">Ответьте на вопросы связей сейчас или оставьте их для session zero.</p>
                </header>
                <div className="cinematic-card-list cinematic-builder-choice-area dh-scroll">
                  {options.connectionQuestions.map((question, index) => (
                    <section className="cinematic-builder-question" key={question}>
                      <span className="cinematic-card-meta">Связь {index + 1}</span>
                      <strong className="cinematic-card-title">{question}</strong>
                      <TextField label="Персонаж" value={fields.connectionAnswers[index]?.targetName ?? ''} onChange={(event) => handlers.setConnectionTarget(index, event.currentTarget.value)} />
                      <TextAreaField label="Ответ" value={fields.connectionAnswers[index]?.answer ?? ''} onChange={(event) => handlers.setConnectionAnswer(index, event.currentTarget.value)} />
                    </section>
                  ))}
                </div>
              </section>
            )}

            {step === 'equipment' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Стартовая экипировка">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Стартовая экипировка</h3>
                  <p className="cinematic-builder-copy">Выберите броню, оружие и стартовые предметы. Модификаторы применяются в итоговом листе автоматически.</p>
                </header>
                <div className="dh-equipment-grid cinematic-builder-choice-area dh-scroll">
                  <div className="dh-equipment-row">
                    <SelectField label="Предмет класса" value={fields.classItem || options.classItems[0]} onChange={(event) => handlers.selectClassItem(event.currentTarget.value)}>
                      {options.classItems.map((item) => <option key={item} value={item}>{item}</option>)}
                    </SelectField>
                    <RichChoicePicker
                      label="Расходник"
                      value={fields.consumableId}
                      placeholder="Выберите расходник"
                      items={options.consumables.map((item) => ({
                        id: item.id,
                        title: item.name,
                        subtitle: item.uses ? `${item.uses} использование` : undefined,
                        description: cleanRulesText(item.text),
                        imageUrl: item.imageUrl
                      }))}
                      onChange={handlers.selectConsumable}
                    />
                  </div>
                  <div className="dh-equipment-column">
                    <h4 className="cinematic-panel-title">Броня</h4>
                    <div className="dh-choice-grid dh-choice-grid--equipment">
                      {options.armor.map((armor) => (
                        <ChoiceCard selected={fields.armorId === armor.id} key={armor.id} type="button" onClick={() => handlers.selectArmor(armor.id)}>
                          <strong className="cinematic-card-title">{armor.name}</strong>
                          <span className="cinematic-card-meta">Пороги {armor.baseMajor}/{armor.baseSevere} — Броня {armor.score}</span>
                          {armor.feature && <span className="cinematic-card-body">{cleanRulesText(armor.feature)}</span>}
                        </ChoiceCard>
                      ))}
                    </div>
                  </div>
                  <div className="dh-equipment-column">
                    <h4 className="cinematic-panel-title">Оружие</h4>
                    <div className="dh-choice-grid dh-choice-grid--equipment">
                      {options.primaryWeapons.map((weapon) => (
                        <ChoiceCard selected={fields.primaryWeaponId === weapon.id} key={weapon.id} type="button" onClick={() => handlers.selectPrimaryWeapon(weapon.id)}>
                          <strong className="cinematic-card-title">{weapon.name}</strong>
                          <span className="cinematic-card-meta">{TRAIT_LABELS[weapon.trait]} — {weapon.range} — {weapon.damageFormula}</span>
                          <span className="cinematic-card-body">{cleanRulesText(`${weapon.burden === 'two-handed' ? 'Двуручное' : 'Одноручное'}${weapon.feature ? ` — ${weapon.feature}` : ''}`)}</span>
                        </ChoiceCard>
                      ))}
                    </div>
                  </div>
                  {options.showSecondaryWeapon && (
                    <div className="dh-equipment-column">
                      <h4 className="cinematic-panel-title">Вторая рука</h4>
                      <div className="dh-choice-grid dh-choice-grid--equipment">
                        {options.secondaryWeapons.map((weapon) => (
                          <ChoiceCard selected={fields.secondaryWeaponId === weapon.id} key={weapon.id} type="button" onClick={() => handlers.selectSecondaryWeapon(weapon.id)}>
                            <strong className="cinematic-card-title">{weapon.name}</strong>
                            <span className="cinematic-card-meta">{TRAIT_LABELS[weapon.trait]} — {weapon.range} — {weapon.damageFormula}</span>
                            {weapon.feature && <span className="cinematic-card-body">{cleanRulesText(weapon.feature)}</span>}
                          </ChoiceCard>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {step === 'cards' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Стартовые карты доменов">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Стартовые карты доменов</h3>
                  <p className="cinematic-builder-copy">Выберите {options.requiredDomainCardCount} {domainCardCountLabel(options.requiredDomainCardCount)} первого уровня из областей класса: {options.classDomains.map(domainLabel).join(' + ')}.</p>
                </header>
                <div className="dh-choice-grid dh-choice-grid--cards cinematic-builder-choice-area dh-scroll">
                  {options.availableDomainCards.map((item) => (
                    <ChoiceCard layout="domain" selected={fields.selectedCardIds.includes(item.id)} key={item.id} type="button" onClick={() => handlers.toggleCard(item.id)}>
                      {item.imageUrl && <AssetImage src={item.imageUrl} alt="" />}
                      <span className="cinematic-card-meta">{item.subtitle}</span>
                      <strong className="cinematic-card-title">{item.name}</strong>
                      <span className="cinematic-card-body">{firstFeatureText(item) || cleanRulesText(item.body)}</span>
                    </ChoiceCard>
                  ))}
                </div>
              </section>
            )}

            {step === 'loadout' && (
              <section className="cinematic-builder-step" role="group" aria-label="Шаг: Итог">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Готово к сцене</h3>
                </header>
                <div className="cinematic-builder-choice-area dh-scroll">
                  <article className="cinematic-builder-loadout-summary">
                    <strong>{fields.name}</strong>
                    <span>{CLASS_LABELS[fields.className]} / {selectedSubclass?.name ?? 'подкласс не выбран'}</span>
                    <span>{selectedAncestry?.name ?? 'родословная'} / {selectedCommunity?.name ?? 'сообщество'}</span>
                    <span>Карты: {selectedCards.map((card) => card.name).join(' / ') || 'не выбраны'}</span>
                    <span>Оружие: {builderResult.draft.weapons?.map((weapon) => weapon.name).join(' / ')}</span>
                    <span>Броня: {builderResult.draft.armor?.name} — уклонение {builderResult.draft.evasion}</span>
                    <span>{BUILDER_TRAIT_IDS.map((trait) => `${TRAIT_LABELS[trait]} ${signed(builderResult.draft.traits?.[trait] ?? fields.traits[trait] ?? 0)}`).join(' / ')}</span>
                    <span>Деньги: {formatWealthSummary(builderResult.draft.wealth)}</span>
                    <span>Инвентарь: {builderResult.draft.inventory?.map((item) => item.name).join(' / ')}</span>
                  </article>
                  {builderResult.warnings.length > 0 && <p className="cinematic-builder-copy">{builderResult.warnings.join(' ')}</p>}
                  {builder.issues.length > 0 && (
                    <div className="cinematic-builder-issues">
                      {blockingIssues.length > 0 && (
                        <section>
                          <strong>Нужно завершить</strong>
                          {blockingIssues.map((issue) => <span key={issue.id}>{issue.message}</span>)}
                        </section>
                      )}
                      {warningIssues.length > 0 && (
                        <section>
                          <strong>Предупреждения</strong>
                          {warningIssues.map((issue) => <span key={issue.id}>{issue.message}</span>)}
                        </section>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {visibleChoicePreview && (
              <BuilderChoiceDetail
                preview={visibleChoicePreview}
                onClose={() => setHiddenChoicePreviewKey(choicePreviewKey)}
              />
            )}
          </div>

          <div className="cinematic-builder-actions" role="toolbar" aria-label="Действия создания героя">
            <Button type="button" onClick={handlers.goBack}>Назад</Button>
            {step !== 'loadout' ? (
              <Button variant="primary" type="button" onClick={handlers.goNext}>Дальше</Button>
            ) : (
              <Button variant="primary" type="button" disabled={!builder.canCreate} onClick={createFromWizard}>Создать</Button>
            )}
          </div>
        </div>

    </Dialog>
  );
}

function domainCardCountLabel(count: number): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'карт';
  if (mod10 === 1) return 'карту';
  if (mod10 >= 2 && mod10 <= 4) return 'карты';
  return 'карт';
}
