/** @jsxImportSource preact */
import { selectionFormulaPresentation } from '../../../domain/rules/selectionNotation';
import { useEffect, useState } from 'preact/hooks';
import { ChevronDown, ChevronRight, Eye, EyeOff, Info } from 'lucide-react';
import { useStream } from '../../../core/hooks/useStream';
import { charactersStore, encounterStore, gameStore } from '../../../stores/gameStores';
import { stepRollAdvantage } from '../../../domain/rules/actionComposer';
import { parseManualRollModifier } from '../../../domain/rules/manualRollModifier';
import { unifiedRollEditableModifier, unifiedRollPoolPresentation, unifiedRollFormulaPresentation, unifiedRollDiceConversionFormula } from '../../../domain/rules/unifiedRollPresentation';
import { convertUnifiedRollToManual, editUnifiedRollDice, isTypedUnifiedRoll, selectUnifiedRollBranch, setUnifiedRollQuantity, unifiedRollPaysForExperiences, unlinkUnifiedRollEvent, type UnifiedRollActor, type UnifiedRollDraft, type UnifiedRollMode } from '../../../domain/rules/unifiedRollDraft';
import { eventRollCompatibility } from '../../../domain/rules/eventRoll';
import { normalizeExtraDice } from '../../../domain/rules/extraDice';
import type { PlayerViewCharacterSummary } from '../../../domain/tabletop/playerView';
import { unifiedRollDraftService } from '../../../services/UnifiedRollDraftService';
import { UnifiedRollExecutionService } from '../../../services/UnifiedRollExecutionService';
import { diceService, eventRollService, feedService, p2pSessionService } from '../../../services/serviceRegistry';
import { Button, Checkbox, IconButton, Notice, NumberField, SelectControl, SelectField, TextControl, TextField } from '../../components/common';
import { DiceIcon } from './playerChrome/feedCards/DiceIcon';
import { CompendiumRuleTerm } from './CompendiumRuleTerm';
import { usePrivateRollPreference } from './rollPrivacyPreference';
import { signed } from './helpers';

const execution = new UnifiedRollExecutionService(diceService, p2pSessionService, () => unifiedRollDraftService.currentScopeKey(), eventRollService);
const SIDES = [4, 6, 8, 10, 12, 20];

export function UnifiedRollComposer({ role, actorOptions, rollCharacters, rollDisabled = false, rollPending = false, onActorChange }: {
  role: 'gm' | 'player'; actorOptions: UnifiedRollActor[]; rollCharacters: Record<string, PlayerViewCharacterSummary>; rollDisabled?: boolean; rollPending?: boolean; onActorChange?: (key: string) => void;
}) {
  const state = useStream(unifiedRollDraftService.state$);
  const draft = state.draft;
  useStream(charactersStore.toStream());
  useStream(feedService.feed$);
  const encounter = useStream(encounterStore.toStream());
  const game = useStream(gameStore.toStream());
  const liveSession = useStream(p2pSessionService.session$);
  const [experiencesOpen, setExperiencesOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const { formulaInput = null, formulaError = null, proposal = null, modifierInput = null } = state.editor ?? {};
  const setFormulaInput = (value: string | null) => unifiedRollDraftService.setEditor({ formulaInput: value });
  const setFormulaError = (value: string | null) => unifiedRollDraftService.setEditor({ formulaError: value });
  const setProposal = (value: string | null) => unifiedRollDraftService.setEditor({ proposal: value });
  const setModifierInput = (value: string | null) => unifiedRollDraftService.setEditor({ modifierInput: value });
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [privateRoll, setPrivateRoll] = usePrivateRollPreference();
  useEffect(() => {
    setResultMessage(null); setExperiencesOpen(false);
    setContextOpen(false); setPaymentOpen(false);
  }, [draft?.id, draft?.mode]);
  useEffect(() => { setResultMessage(null); }, [liveSession.extraActionDiceSupported]);
  if (!draft) return <p>Выберите кости или действие из листа персонажа.</p>;
  const character = draft.actor.kind === 'character' && draft.actor.id ? rollCharacters[draft.actor.id] : null;
  const adversary = draft.actor.kind === 'adversary' && draft.actor.id ? encounter.adversaries[draft.actor.id] : null;
  const companion = draft.source?.isCompanion === true;
  const experiences = draft.mode === 'gmAttack' ? adversary?.experiences ?? []
    : draft.mode === 'action' || draft.mode === 'reaction' ? (companion ? character?.companion?.experiences : character?.experiences) ?? [] : [];
  const selectedExperiences = experiences.filter((item) => draft.experienceIds.includes(item.id));
  const experienceModifier = selectedExperiences.reduce((sum, item) => sum + item.modifier, 0);
  const selectedTrait = character?.traits.find((item) => item.id === draft.trait);
  const traitModifier = selectedTrait?.value ?? 0;
  const staticModifier = draft.mode === 'gmAttack' ? (adversary?.attackModifier ?? 0) + experienceModifier : traitModifier + experienceModifier;
  const formulaPresentation = unifiedRollFormulaPresentation(draft, staticModifier);
  const completeFormula = formulaPresentation.baseFormula;
  const displayedFormula = selectionFormulaPresentation(completeFormula, draft);
  const displayedEffectiveFormula = draft.mode === 'damage' ? formulaPresentation.effectiveFormula : displayedFormula;
  const modifier = parseManualRollModifier(modifierInput ?? String(unifiedRollEditableModifier(draft)));
  const allowedActorIds = actorOptions.flatMap((actor) => actor.id ? [actor.id] : []);
  const error = execution.error(draft, role, allowedActorIds);
  const eventContext = draft.eventContext;
  const eventCompatibility = eventContext ? eventRollCompatibility(eventContext, draft) : null;
  const options = actorOptions.some((actor) => actor.key === draft.actor.key) ? actorOptions : [draft.actor, ...actorOptions];
  const controlsBlocked = Boolean(proposal);
  const update = (patch: Partial<UnifiedRollDraft> | ((current: UnifiedRollDraft) => UnifiedRollDraft)) => {
    unifiedRollDraftService.update(patch); setResultMessage(null);
  };
  const resetFormulaEditor = () => { setFormulaInput(null); setFormulaError(null); };
  const editDice = (sides: number, delta: number, target?: 'base' | 'extra', sign: 1 | -1 = 1) => {
    try {
      const current = unifiedRollDraftService.state$.get().draft ?? draft;
      const next = editUnifiedRollDice(current, sides, delta, target, sign);
      if (next.requiresManual) {
        setProposal(unifiedRollDiceConversionFormula(current, next.proposedFormula, staticModifier));
        unifiedRollDraftService.update({});
      } else { update(next.draft); resetFormulaEditor(); }
    } catch (caught) { setFormulaError(caught instanceof Error ? caught.message : 'Не удалось изменить кости.'); }
  };
  const changeMode = (mode: UnifiedRollMode) => {
    if (mode === draft.mode) return;
    resetFormulaEditor(); setModifierInput(null);
    if ((draft.mode === 'action' || draft.mode === 'reaction') && (mode === 'action' || mode === 'reaction')) {
      update({ mode, critical: false });
      return;
    }
    update({ mode, formula: mode === 'action' || mode === 'reaction' ? '2d12' : mode === 'gmAttack' ? '1d20' : mode === 'damage' ? draft.damage?.formula ?? draft.formula : completeFormula,
      trait: mode === 'damage' || mode === 'manual' ? undefined : eventContext?.kind === 'teamwork' ? eventContext.trait : draft.trait ?? character?.spellcastTrait ?? 'agility',
      experienceIds: [], extraDice: undefined, manualModifier: 0, advantageCount: 0, disadvantageCount: 0, quantity: undefined, branches: undefined,
      spendHopeForExperiences: mode === 'action' || mode === 'reaction' || mode === 'gmAttack' ? true : false,
      damageType: mode === 'damage' ? draft.damage?.damageType ?? draft.damageType : undefined,
      hint: mode === 'manual' ? 'Ручной бросок показывает сумму и каждую кость. Исход Дуальности, опыт и его стоимость не применяются автоматически.' : draft.hint });
  };
  const pool = unifiedRollPoolPresentation(draft);
  const emptyPool = !draft.formula.trim() && !draft.quantity && !draft.branches?.length;
  const visibleError = emptyPool && /^(Формула пуста|Нет костей для броска|Добавьте кости в набор)/.test(error ?? '') ? null : error;
  return <section className="unified-roll-composer">
    <div className="unified-roll-composer__body">
    <div className="unified-roll-heading">
      {options.length > 1 && !eventContext ? <SelectControl className="unified-roll-actor-control" aria-label="Исполнитель броска" title={`Исполнитель броска: ${draft.actor.name}`} value={draft.actor.key} disabled={controlsBlocked} onChange={(event) => {
        const actor = options.find((item) => item.key === event.currentTarget.value);
        if (actor) { unifiedRollDraftService.changeActor(actor, { trait: actor.id ? rollCharacters[actor.id]?.spellcastTrait ?? 'agility' : undefined }); onActorChange?.(actor.key); setResultMessage(null); }
      }}>{options.map((actor) => <option key={actor.key} value={actor.key}>{actor.key === draft.actor.key && companion ? draft.actor.name : actor.name}</option>)}</SelectControl>
        : <strong className="unified-roll-actor-name" aria-label="Исполнитель броска" title={eventContext ? `${draft.actor.name} — исполнитель связан с событием` : draft.actor.name}>{draft.actor.name}</strong>}
      <Button className="unified-roll-privacy" variant="ghost" size="xs" aria-pressed={privateRoll}
        aria-label={privateRoll ? 'Сделать бросок публичным' : 'Сделать бросок приватным'}
        title={privateRoll ? 'Виден вам и мастеру. Сделать публичным' : 'Виден всем участникам. Сделать приватным'}
        onClick={() => setPrivateRoll(!privateRoll)}>{privateRoll ? <EyeOff size={13} /> : <Eye size={13} />}{privateRoll ? 'Приватный бросок' : 'Публичный бросок'}</Button>
    </div>
    {(!['Кости', 'Проверка персонажа', 'Дуальность', 'Атака'].includes(draft.title) || draft.hint) && <div className="unified-roll-source-line">
      {!['Кости', 'Проверка персонажа', 'Дуальность', 'Атака'].includes(draft.title) && <small className="unified-roll-source-title">{draft.title}</small>}
      {draft.hint && <IconButton variant="ghost" size="sm" aria-label="Контекст способности" title="Контекст способности" aria-expanded={contextOpen} onClick={() => setContextOpen((open) => !open)}><Info size={14} /></IconButton>}
    </div>}
    {eventContext && <div className="unified-roll-event-context">
      <small>{eventContext.kind === 'rest' ? 'Ход отдыха' : eventContext.kind === 'death' ? 'Предсмертный ход' : draft.source?.label ?? 'Совместный бросок'}. Результат будет учтён.</small>
      <Button variant="ghost" size="xs" onClick={() => update(unlinkUnifiedRollEvent(draft))} title="Сохранить набор и бросить без применения к выбранному действию">Бросить отдельно</Button>
      {eventCompatibility?.fixedFormula && <small>Нужный набор: {eventCompatibility.fixedFormula}</small>}
      {eventCompatibility?.manualOverrideRequired && role === 'gm' && <Checkbox
        label={eventContext.kind === 'teamwork' ? 'Ручной итог' : 'Применить изменённое восстановление'}
        checked={eventContext.manualOverride === true}
        onChange={(event) => update({ eventContext: { ...eventContext, manualOverride: event.currentTarget.checked } })}
      />}
    </div>}
    {draft.eventUnlinked && <Notice role="status">Обычный бросок. Результат не будет применён к выбранному действию.</Notice>}
    {contextOpen && draft.hint && <small>{draft.hint}</small>}
    {(isTypedUnifiedRoll(draft) || draft.damage) && <div className="unified-roll-modes">
      {character && <Button size="xs" variant={draft.mode === 'action' ? 'primary' : 'ghost'} disabled={controlsBlocked || (eventContext?.kind === 'teamwork' && eventContext.rollType !== 'action')} onClick={() => changeMode('action')}>Действие</Button>}
      {character && <Button size="xs" variant={draft.mode === 'reaction' ? 'primary' : 'ghost'} disabled={controlsBlocked || (eventContext?.kind === 'teamwork' && eventContext.rollType !== 'reaction')} onClick={() => changeMode('reaction')}>Реакция</Button>}
      {role === 'gm' && adversary && <Button size="xs" variant={draft.mode === 'gmAttack' ? 'primary' : 'ghost'} disabled={controlsBlocked} onClick={() => changeMode('gmAttack')}>Атака</Button>}
      {(draft.damage || draft.mode === 'damage') && <Button size="xs" variant={draft.mode === 'damage' ? 'primary' : 'ghost'} disabled={controlsBlocked} onClick={() => changeMode('damage')}>Урон</Button>}

    </div>}
    {draft.branches?.length && <SelectField label="Вариант способности" value={draft.selectedBranchId ?? ''} onChange={(event) => { update((current) => selectUnifiedRollBranch(current, event.currentTarget.value)); resetFormulaEditor(); }}>
      <option value="">Выберите вариант</option>{draft.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}
    </SelectField>}
    {draft.quantity && <NumberField label={draft.quantity.label} min={draft.quantity.min ?? 1} max={draft.quantity.max ?? 100} value={draft.quantity.value ?? ''} hint={draft.quantity.explanation} onInput={(event) => {
      const value = event.currentTarget.value;
      update((current) => setUnifiedRollQuantity(current, value === '' ? null : Number(value))); resetFormulaEditor();
    }} />}
    {proposal && <Notice tone="warning">Изменён набор костей проверки. Ручной бросок сохранит указанную формулу и исполнителя, но не определяет исход Дуальности и не списывает стоимость Опытов. Числа в формуле останутся; нужные расходы отметьте вручную.
      <Button size="sm" variant="primary" onClick={() => { try { update(convertUnifiedRollToManual(draft, proposal)); setProposal(null); resetFormulaEditor(); setModifierInput(null); } catch (caught) { setFormulaError(String(caught)); } }}>Сделать ручным броском</Button>
      <Button size="sm" variant="ghost" onClick={() => { setProposal(null); resetFormulaEditor(); }}>Сохранить проверку</Button>
    </Notice>}
    {!proposal && isTypedUnifiedRoll(draft) && normalizeExtraDice(draft.extraDice).length > 0 && role === 'player' && p2pSessionService.isConnectedPlayerSession() && !p2pSessionService.supportsExtraActionDice() && <Button size="xs" variant="ghost" onClick={() => setProposal(completeFormula)}>Сделать ручным броском</Button>}
    <div className="mini-dice-launcher__tray" aria-label="Подготовленные кости">
      <div className="mini-dice-launcher__tray-list">{pool.chips.map((chip) => {
        const icon = chip.kind === 'hope' ? 'hope-d12' : chip.kind === 'fear' ? 'fear-d12' : chip.kind === 'advantage' ? `adv-d${chip.sides}` : chip.kind === 'disadvantage' ? `dis-d${chip.sides}` : `d${chip.sides}`;
        const label = chip.kind === 'hope' ? 'кость Надежды' : chip.kind === 'fear' ? 'кость Страха' : chip.kind === 'advantage' ? 'преимущество' : chip.kind === 'disadvantage' ? 'помеху' : `${chip.target === 'extra' ? 'дополнительный ' : ''}${chip.sign < 0 ? 'минус ' : ''}d${chip.sides}`;
        return <IconButton key={chip.id} variant="ghost" size="md" aria-label={`Убрать ${label}`} disabled={controlsBlocked} onClick={() => chip.target === 'advantage' || chip.target === 'disadvantage'
          ? update(chip.target === 'advantage' ? { advantageCount: Math.max(0, draft.advantageCount - 1) } : { disadvantageCount: Math.max(0, draft.disadvantageCount - 1) }) : editDice(chip.sides, -1, chip.target, chip.sign)}><DiceIcon kind={icon} label={label} mark={`${chip.sign < 0 && chip.kind === 'die' ? '−' : ''}${chip.count > 1 ? `${chip.count}×` : ''}d${chip.sides}`}  /></IconButton>;
      })}{pool.chips.length === 0 && <span className="unified-roll-empty">Выберите кости ниже</span>}</div>
      <IconButton variant="ghost" size="sm" aria-label="Сбросить набор" onClick={() => unifiedRollDraftService.resetDraft()}>↺</IconButton>
    </div>
    <div className="mini-dice-launcher__dice">
      <IconButton variant="ghost" size="sm" aria-label="Дуальность" disabled={controlsBlocked || draft.actor.kind === 'adversary' || draft.actor.kind === 'environment'} onClick={() => {
        if (isTypedUnifiedRoll(draft) && draft.mode !== 'gmAttack') return;
        changeMode('action');
      }}><DiceIcon kind="duality" label="Дуальность" /></IconButton>
      {SIDES.map((sides) => <IconButton key={sides} variant="ghost" size="sm" aria-label={`Добавить d${sides}`} disabled={controlsBlocked} onClick={() => editDice(sides, 1)}><DiceIcon kind={`d${sides}`} label={`d${sides}`} mark={`d${sides}`} /></IconButton>)}
    </div>
    {draft.mode !== 'damage' && <div className="unified-roll-options-row" aria-label="Преимущество и помеха">
      <Button size="xs" aria-pressed={draft.advantageCount > draft.disadvantageCount} variant={draft.advantageCount > draft.disadvantageCount ? 'primary' : 'ghost'} disabled={controlsBlocked} onClick={() => { update(stepRollAdvantage(draft, 'advantage')); resetFormulaEditor(); }}>Преимущество{draft.advantageCount - draft.disadvantageCount > 1 ? ` ${draft.advantageCount - draft.disadvantageCount}` : ''}</Button>
      <Button size="xs" aria-pressed={draft.disadvantageCount > draft.advantageCount} variant={draft.disadvantageCount > draft.advantageCount ? 'danger' : 'ghost'} disabled={controlsBlocked} onClick={() => { update(stepRollAdvantage(draft, 'disadvantage')); resetFormulaEditor(); }}>Помеха{draft.disadvantageCount - draft.advantageCount > 1 ? ` ${draft.disadvantageCount - draft.advantageCount}` : ''}</Button>
    </div>}
    <div className="unified-roll-options-row unified-roll-modifiers" role="group" aria-label="Прибавки к броску">
      {(draft.mode === 'action' || draft.mode === 'reaction') && character && <span className="unified-roll-control-group unified-roll-control-group--trait" role="group" aria-label="Характеристика и справка">
        <SelectControl
          className="unified-roll-trait-control" aria-label="Характеристика броска" title={selectedTrait ? `${selectedTrait.label} ${signed(selectedTrait.value)}` : 'Выбрать характеристику броска'}
          value={draft.trait ?? ''} disabled={controlsBlocked || eventContext?.kind === 'teamwork'}
          onChange={(event) => { update({ trait: event.currentTarget.value as UnifiedRollDraft['trait'] }); resetFormulaEditor(); }}>
          {character.traits.map((trait) => <option key={trait.id} value={trait.id}>{trait.label} {signed(trait.value)}</option>)}
        </SelectControl>
        {draft.trait && <CompendiumRuleTerm ruleSlug={draft.trait}><span aria-label={`О характеристике ${selectedTrait?.label ?? draft.trait}`}><Info size={12} aria-hidden="true" /></span></CompendiumRuleTerm>}
      </span>}
      <span className="unified-roll-modifier-label" title={isTypedUnifiedRoll(draft) ? 'Дополнительный модификатор броска' : 'Модификатор'} role="group" aria-label={isTypedUnifiedRoll(draft) ? 'Доп. модификатор' : 'Модификатор'}><IconButton size="sm" variant="ghost" aria-label="Уменьшить модификатор" disabled={controlsBlocked} onClick={() => unifiedRollDraftService.setModifier(unifiedRollEditableModifier(draft) - 1)}>−</IconButton><TextControl className="unified-roll-modifier" aria-label="Модификатор" aria-description={isTypedUnifiedRoll(draft) ? 'Дополнительный ручной модификатор сверх характеристики и опытов' : 'Плоский модификатор формулы'} inputMode="numeric" value={modifierInput ?? signed(unifiedRollEditableModifier(draft))} disabled={controlsBlocked} onInput={(event) => unifiedRollDraftService.editModifier(event.currentTarget.value)} /><IconButton size="sm" variant="ghost" aria-label="Увеличить модификатор" disabled={controlsBlocked} onClick={() => unifiedRollDraftService.setModifier(unifiedRollEditableModifier(draft) + 1)}>+</IconButton></span>
    </div>
      {experiences.length > 0 && <div className="unified-roll-control-group unified-roll-experience-toggle" role="group" aria-label="Опыт и справка">
        <Button size="xs" variant={selectedExperiences.length ? 'primary' : 'ghost'} aria-expanded={experiencesOpen} onClick={() => setExperiencesOpen((open) => !open)}>Опыт{selectedExperiences.length > 0 ? ` ${signed(experienceModifier)}` : ''}{experiencesOpen ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}</Button>
        <CompendiumRuleTerm ruleSlug="experience" sectionAnchor="using-experiences"><span aria-label="Об опытах"><Info size={12} aria-hidden="true" /></span></CompendiumRuleTerm>
      </div>}
    {experiencesOpen && experiences.length > 0 && <div className="player-roll-confirm__checks unified-roll-experiences">
      {experiences.map((experience) => <Checkbox key={experience.id} size="sm" boxPosition="start" wrapLabel label={experience.name} meta={signed(experience.modifier)} aria-label={`${experience.name} ${signed(experience.modifier)}`} title={experience.name} checked={draft.experienceIds.includes(experience.id)} disabled={controlsBlocked} onChange={() => { update({ experienceIds: draft.experienceIds.includes(experience.id) ? draft.experienceIds.filter((id) => id !== experience.id) : [...draft.experienceIds, experience.id] }); resetFormulaEditor(); }} />)}
      {draft.experienceIds.length > 0 && !companion && <Button size="xs" variant="ghost" onClick={() => setPaymentOpen((open) => !open)}>Настроить стоимость</Button>}
      {draft.experienceIds.length > 0 && paymentOpen && !companion && <Checkbox label={draft.mode === 'gmAttack' ? 'Потратить Страх за опыт' : 'Потратить Надежду за опыт'} checked={unifiedRollPaysForExperiences(draft)} disabled={controlsBlocked || companion} onChange={(event) => update({ spendHopeForExperiences: event.currentTarget.checked })} />}
    </div>}
    {draft.mode === 'damage' && <Checkbox label="Критический урон" checked={draft.critical} onChange={(event) => update({ critical: event.currentTarget.checked })} />}
    {formulaOpen && <TextField label={draft.mode === 'damage' ? 'Базовая формула урона' : 'Формула броска'} aria-label="Формула броска" value={formulaInput ?? displayedFormula} onInput={(event) => unifiedRollDraftService.editFormula(event.currentTarget.value, staticModifier)} onBlur={() => unifiedRollDraftService.finishFormulaEdit()} />}
    {(visibleError || formulaError || !modifier.valid) && <Notice tone="warning">{formulaError ?? (!modifier.valid ? 'Введите целый модификатор.' : visibleError)}</Notice>}
    {resultMessage && <Notice role="status" aria-live="polite">{resultMessage}</Notice>}
    </div>
    <footer className="unified-roll-composer__footer" role="region" aria-label="Итог броска">
      <div className="unified-roll-formula-row"><output className="unified-roll-formula-summary" aria-label="Итоговая формула">{emptyPool && !proposal && !formulaError ? '' : proposal ? 'Подтвердите ручной набор' : formulaError ? 'Исправьте формулу' : displayedEffectiveFormula || 'Выберите кости'}</output>
<Button size="xs" variant="ghost" className="unified-roll-formula-toggle" aria-expanded={formulaOpen} onClick={() => setFormulaOpen((open) => !open)}>Изменить формулу</Button></div>
      {draft.mode === 'damage' && draft.critical && formulaPresentation.criticalBonus !== 0 && <small>Крит: {signed(formulaPresentation.criticalBonus)}</small>}
    {isTypedUnifiedRoll(draft) && unifiedRollPaysForExperiences(draft) && selectedExperiences.length > 0 && <small className="unified-roll-cost">Цена опыта: {selectedExperiences.length} {draft.mode === 'gmAttack' ? 'Страха' : 'Надежды'}</small>}
    <Button variant="primary" size="md" fullWidth disabled={rollDisabled || rollPending || submitting || Boolean(error || formulaError || proposal) || !modifier.valid} onClick={async () => {
      setSubmitting(true);
      const result = await execution.execute(draft, role, privateRoll ? 'private' : 'public', allowedActorIds);
      setSubmitting(false); setResultMessage(result.ok ? role === 'player' && p2pSessionService.isConnectedPlayerSession() ? 'Бросок отправлен мастеру.' : null : result.error ?? 'Бросок не выполнен.');
    }}>Бросить</Button>
    </footer>
  </section>;
}
