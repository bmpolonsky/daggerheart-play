import { Sparkles, X } from 'lucide-react';
import type { ContentState, LibraryEquipmentItem } from '../../domain/content/types';
import {
  buildCharacterBuilderChoicePreview,
  cleanRulesText,
  featureListText,
  firstFeatureText
} from '../../domain/characterBuilder';
import { CLASS_LABELS, TRAIT_LABELS } from '../../domain/rules/constants';
import type { Character, DaggerheartClass } from '../../domain/rules/types';
import { ImageFilePicker } from '../components/common/ImageFilePicker';
import { BuilderChoiceDetail } from './builder/BuilderChoiceDetail';
import { BuilderLivePreview } from './builder/BuilderLivePreview';
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
    selectedCards,
    availableDomainCards: options.availableDomainCards,
    selectedCardIds: fields.selectedCardIds,
    selectedArmor,
    selectedPrimaryWeapon,
    selectedSecondaryWeapon: options.showSecondaryWeapon ? selectedSecondaryWeapon : null,
    selectedConsumable,
    classItem: fields.classItem
  });
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
    <div className="cinematic-modal-backdrop" role="dialog" aria-modal="true" onClick={onCancel}>
      <section className="cinematic-builder" onClick={(event) => event.stopPropagation()}>
        <nav className="cinematic-builder-nav" aria-label="Шаги создания">
          <div className="cinematic-builder-header">
            <h2 className="cinematic-builder-title">Новый герой</h2>
            <button className="dh-icon-button" type="button" onClick={onCancel} aria-label="Закрыть">
              <X size={18} />
            </button>
          </div>
          <div className="cinematic-builder-stepper">
            {steps.map((item, index) => (
              <button className={`cinematic-builder-step-tab ${step === item.id ? 'dh-is-active' : ''}`} key={item.id} type="button" onClick={() => handlers.goToStep(item.id)}>
                <span className="dh-hex">{index + 1}</span><span>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="cinematic-builder-panel dh-scroll">
          <header className="cinematic-builder-stage">
            <div className="cinematic-builder-stage-art">
              {selectedClassOption?.imageUrl ? <img src={selectedClassOption.imageUrl} alt="" /> : <span>{initials(CLASS_LABELS[fields.className])}</span>}
            </div>
            <div className="cinematic-builder-stage-copy">
              <span className="cinematic-card-meta">{steps[currentStepIndex]?.label ?? 'Создание'} · {progress}%</span>
              <strong>{CLASS_LABELS[fields.className]}</strong>
              <p>
                {[selectedAncestry?.name, selectedCommunity?.name, selectedSubclass?.name].filter(Boolean).join(' / ') ||
                  options.classDomains.map(domainLabel).join(' + ')}
              </p>
              <div className="cinematic-builder-progress" aria-label={`Прогресс создания ${progress}%`}>
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
            <button className="dh-button dh-variant-primary cinematic-builder-quickstart" type="button" onClick={handlers.quickStart}>
              <Sparkles size={16} /> Быстрый старт
            </button>
          </header>

          <div className={`cinematic-builder-workspace ${choicePreview ? 'dh-has-choice-detail' : ''}`}>
            {step === 'class' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Выберите класс</h3>
                  <p className="cinematic-builder-copy">Класс задает стартовые значения, две области и список доступных подклассов.</p>
                </header>
                <div className="dh-choice-grid cinematic-builder-choice-area dh-scroll">
                  {options.classOptions.map((item) => (
                    <button className={`cinematic-card dh-class-choice ${fields.className === item.className ? 'dh-is-selected' : ''}`} key={item.className} type="button" onClick={() => handlers.selectClass(item.className)}>
                      {item.imageUrl && <img className="dh-library-thumb" src={item.imageUrl} alt="" />}
                      <strong className="cinematic-card-title">{item.name}</strong>
                      <span className="cinematic-card-meta">{item.domains.map(domainLabel).join(' + ')}</span>
                      {item.body && <span className="cinematic-card-body">{cleanRulesText(item.body)}</span>}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {step === 'ancestry' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Родословная</h3>
                </header>
                <div className="dh-choice-grid dh-choice-grid--media cinematic-builder-choice-area dh-scroll">
                  {options.builderContent.ancestries.slice(0, 36).map((item) => (
                    <button className={`cinematic-card dh-media-choice ${selectedAncestry?.id === item.id ? 'dh-is-selected' : ''}`} key={item.id} type="button" onClick={() => handlers.selectAncestry(item.id)}>
                      {item.imageUrl && <img src={item.imageUrl} alt="" />}
                      <strong className="cinematic-card-title">{item.name}</strong>
                      <span className="cinematic-card-body">{featureListText(item) || cleanRulesText(item.body)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {step === 'community' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Сообщество</h3>
                </header>
                <div className="dh-choice-grid dh-choice-grid--media cinematic-builder-choice-area dh-scroll">
                  {options.builderContent.communities.map((item) => (
                    <button className={`cinematic-card dh-media-choice ${selectedCommunity?.id === item.id ? 'dh-is-selected' : ''}`} key={item.id} type="button" onClick={() => handlers.selectCommunity(item.id)}>
                      {item.imageUrl && <img src={item.imageUrl} alt="" />}
                      <strong className="cinematic-card-title">{item.name}</strong>
                      <span className="cinematic-card-body">{featureListText(item) || cleanRulesText(item.body)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {step === 'subclass' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Подкласс</h3>
                  <p className="cinematic-builder-copy">Выберите Foundation-направление. Его способность будет добавлена в лист как отдельная карточка.</p>
                </header>
                <div className="dh-choice-grid dh-choice-grid--media cinematic-builder-choice-area dh-scroll">
                  {options.classSubclasses.map((item) => (
                    <button className={`cinematic-card dh-media-choice ${selectedSubclass?.id === item.id ? 'dh-is-selected' : ''}`} key={item.id} type="button" onClick={() => handlers.selectSubclass(item.id)}>
                      {item.imageUrl && <img src={item.imageUrl} alt="" />}
                      <strong className="cinematic-card-title">{item.name}</strong>
                      <span className="cinematic-card-meta">{item.subtitle}</span>
                      <span className="cinematic-card-body">{firstFeatureText(item) || cleanRulesText(item.body)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {step === 'traits' && (
              <section className="cinematic-builder-step">
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
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Личность</h3>
                </header>
                <div className="cinematic-builder-form cinematic-builder-identity-form cinematic-builder-choice-area dh-scroll">
                  <label className="dh-label character-builder-name-field"><span>Имя</span><input className="dh-field" value={fields.name} onChange={(event) => handlers.setName(event.currentTarget.value)} /></label>
                  <label className="dh-label character-builder-pronouns-field"><span>Местоимения</span><input className="dh-field" value={fields.pronouns} onChange={(event) => handlers.setPronouns(event.currentTarget.value)} /></label>
                  <ImageFilePicker
                    className="character-builder-portrait-picker"
                    label="Портрет"
                    imageUrl={fields.portraitUrl}
                    size="compact"
                    onFileSelect={handlePortraitUpload}
                    onClear={() => handlers.setPortraitUrl('')}
                  />
                  <label className="dh-label character-builder-appearance-field"><span>Внешность</span><textarea className="dh-textarea" value={fields.appearance} onChange={(event) => handlers.setAppearance(event.currentTarget.value)} /></label>
                  <label className="dh-label character-builder-experience-one-field"><span>Опыт 1</span><input className="dh-field" value={fields.experienceOne} onChange={(event) => handlers.setExperienceOne(event.currentTarget.value)} /></label>
                  <label className="dh-label character-builder-experience-two-field"><span>Опыт 2</span><input className="dh-field" value={fields.experienceTwo} onChange={(event) => handlers.setExperienceTwo(event.currentTarget.value)} /></label>
                </div>
              </section>
            )}

            {step === 'background' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Предыстория</h3>
                  <p className="cinematic-builder-copy">Вопросы берутся из выбранного класса и сохраняются в лист персонажа.</p>
                </header>
                <div className="cinematic-builder-form cinematic-builder-choice-area dh-scroll">
                  <label className="dh-label dh-label--wide"><span>Краткая предыстория</span><textarea className="dh-textarea" value={fields.backstory} onChange={(event) => handlers.setBackstory(event.currentTarget.value)} /></label>
                  <div className="cinematic-card-list dh-label--wide">
                    {options.backgroundQuestions.map((question, index) => (
                      <label className="cinematic-card" key={question}>
                        <span className="cinematic-card-meta">Вопрос {index + 1}</span>
                        <strong className="cinematic-card-title">{question}</strong>
                        <textarea className="dh-textarea" value={fields.backgroundAnswers[index] ?? ''} onChange={(event) => handlers.setBackgroundAnswer(index, event.currentTarget.value)} />
                      </label>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {step === 'connections' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Связи</h3>
                  <p className="cinematic-builder-copy">Ответьте на вопросы связей сейчас или оставьте их для session zero.</p>
                </header>
                <div className="cinematic-card-list cinematic-builder-choice-area dh-scroll">
                  {options.connectionQuestions.map((question, index) => (
                    <article className="cinematic-card" key={question}>
                      <span className="cinematic-card-meta">Связь {index + 1}</span>
                      <strong className="cinematic-card-title">{question}</strong>
                      <label className="dh-label"><span>Персонаж</span><input className="dh-field" value={fields.connectionAnswers[index]?.targetName ?? ''} onChange={(event) => handlers.setConnectionTarget(index, event.currentTarget.value)} /></label>
                      <label className="dh-label"><span>Ответ</span><textarea className="dh-textarea" value={fields.connectionAnswers[index]?.answer ?? ''} onChange={(event) => handlers.setConnectionAnswer(index, event.currentTarget.value)} /></label>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {step === 'equipment' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Стартовая экипировка</h3>
                  <p className="cinematic-builder-copy">Выберите броню, оружие и стартовые предметы. Модификаторы применяются в итоговом листе автоматически.</p>
                </header>
                <div className="dh-equipment-grid cinematic-builder-choice-area dh-scroll">
                  <div className="dh-equipment-column">
                    <h4 className="cinematic-panel-title">Броня</h4>
                    <div className="dh-choice-grid dh-choice-grid--equipment">
                      {options.armor.map((armor) => (
                        <button className={`cinematic-card ${fields.armorId === armor.id ? 'dh-is-selected' : ''}`} key={armor.id} type="button" onClick={() => handlers.selectArmor(armor.id)}>
                          <strong className="cinematic-card-title">{armor.name}</strong>
                          <span className="cinematic-card-meta">Пороги {armor.baseMajor}/{armor.baseSevere} · Броня {armor.score}</span>
                          {armor.feature && <span className="cinematic-card-body">{armor.feature}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="dh-equipment-column">
                    <h4 className="cinematic-panel-title">Оружие</h4>
                    <div className="dh-choice-grid dh-choice-grid--equipment">
                      {options.primaryWeapons.map((weapon) => (
                        <button className={`cinematic-card ${fields.primaryWeaponId === weapon.id ? 'dh-is-selected' : ''}`} key={weapon.id} type="button" onClick={() => handlers.selectPrimaryWeapon(weapon.id)}>
                          <strong className="cinematic-card-title">{weapon.name}</strong>
                          <span className="cinematic-card-meta">{TRAIT_LABELS[weapon.trait]} · {weapon.range} · {weapon.damageFormula}</span>
                          <span className="cinematic-card-body">{weapon.burden === 'two-handed' ? 'Двуручное' : 'Одноручное'}{weapon.feature ? ` · ${weapon.feature}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {options.showSecondaryWeapon && (
                    <div className="dh-equipment-column">
                      <h4 className="cinematic-panel-title">Вторая рука</h4>
                      <div className="dh-choice-grid dh-choice-grid--equipment">
                        {options.secondaryWeapons.map((weapon) => (
                          <button className={`cinematic-card ${fields.secondaryWeaponId === weapon.id ? 'dh-is-selected' : ''}`} key={weapon.id} type="button" onClick={() => handlers.selectSecondaryWeapon(weapon.id)}>
                            <strong className="cinematic-card-title">{weapon.name}</strong>
                            <span className="cinematic-card-meta">{TRAIT_LABELS[weapon.trait]} · {weapon.range} · {weapon.damageFormula}</span>
                            {weapon.feature && <span className="cinematic-card-body">{weapon.feature}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="dh-equipment-row">
                    <label className="dh-label">
                      <span>Предмет класса</span>
                      <select className="dh-field" value={fields.classItem || options.classItems[0]} onChange={(event) => handlers.selectClassItem(event.currentTarget.value)}>
                        {options.classItems.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className="dh-label">
                      <span>Расходник</span>
                      <select className="dh-field" value={fields.consumableId} onChange={(event) => handlers.selectConsumable(event.currentTarget.value)}>
                        {options.consumables.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              </section>
            )}

            {step === 'cards' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Стартовые карты доменов</h3>
                  <p className="cinematic-builder-copy">Выберите 2 карты первого уровня из областей класса: {options.classDomains.map(domainLabel).join(' + ')}.</p>
                </header>
                <div className="dh-choice-grid dh-choice-grid--cards cinematic-builder-choice-area dh-scroll">
                  {options.availableDomainCards.map((item) => (
                    <button className={`cinematic-card dh-domain-choice ${fields.selectedCardIds.includes(item.id) ? 'dh-is-selected' : ''}`} key={item.id} type="button" onClick={() => handlers.toggleCard(item.id)}>
                      {item.imageUrl && <img src={item.imageUrl} alt="" />}
                      <span className="cinematic-card-meta">{item.subtitle}</span>
                      <strong className="cinematic-card-title">{item.name}</strong>
                      <span className="cinematic-card-body">{firstFeatureText(item) || cleanRulesText(item.body)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {step === 'loadout' && (
              <section className="cinematic-builder-step">
                <header className="cinematic-builder-step-head">
                  <h3 className="cinematic-builder-title">Готово к сцене</h3>
                </header>
                <div className="cinematic-builder-choice-area dh-scroll">
                  <article className="dh-paper-summary">
                    <strong>{fields.name}</strong>
                    <span>{CLASS_LABELS[fields.className]} / {selectedSubclass?.name ?? 'подкласс не выбран'}</span>
                    <span>{selectedAncestry?.name ?? 'родословная'} / {selectedCommunity?.name ?? 'сообщество'}</span>
                    <span>Карты: {selectedCards.map((card) => card.name).join(' / ') || 'не выбраны'}</span>
                    <span>Оружие: {builderResult.draft.weapons?.map((weapon) => weapon.name).join(' / ')}</span>
                    <span>Броня: {builderResult.draft.armor?.name} · Уклонение {builderResult.draft.evasion}</span>
                    <span>{BUILDER_TRAIT_IDS.map((trait) => `${TRAIT_LABELS[trait]} ${signed(builderResult.draft.traits?.[trait] ?? fields.traits[trait] ?? 0)}`).join(' / ')}</span>
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

            {choicePreview && <BuilderChoiceDetail preview={choicePreview} />}
          </div>

          <div className="cinematic-builder-actions">
            <button className="dh-button" type="button" onClick={handlers.goBack}>Назад</button>
            {step !== 'loadout' ? (
              <button className="dh-button dh-variant-primary" type="button" onClick={handlers.goNext}>Дальше</button>
            ) : (
              <button className="dh-button dh-variant-primary" type="button" disabled={!builder.canCreate} onClick={createFromWizard}>Создать</button>
            )}
          </div>
        </div>

        <BuilderLivePreview
          draft={builderResult.draft}
          classImageUrl={selectedClassOption?.imageUrl ?? null}
          ancestryName={selectedAncestry?.name}
          communityName={selectedCommunity?.name}
          subclassName={selectedSubclass?.name}
          cards={selectedCards}
          canCreate={builder.canCreate}
          blockingCount={blockingIssues.length}
        />
      </section>
    </div>
  );
}
