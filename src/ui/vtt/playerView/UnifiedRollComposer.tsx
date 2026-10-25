/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { Info, LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { useStream } from '../../../core/hooks/useStream';
import { charactersStore, encounterStore, gameStore } from '../../../stores/gameStores';
import { addAdvantageDie } from '../../../domain/rules/actionComposer';
import { parseDiceFormula } from '../../../domain/rules/diceFormula';
import { parseManualRollModifier } from '../../../domain/rules/manualRollModifier';
import { appendRollModifier, applyUnifiedFormulaEdit, unifiedRollCompleteFormula } from '../../../domain/rules/unifiedRollPresentation';
import { convertUnifiedRollToManual, editUnifiedRollDice, isTypedUnifiedRoll, selectUnifiedRollBranch, setUnifiedRollQuantity, type UnifiedRollActor, type UnifiedRollDraft, type UnifiedRollMode } from '../../../domain/rules/unifiedRollDraft';
import type { PlayerViewCharacterSummary } from '../../../domain/tabletop/playerView';
import { unifiedRollDraftService } from '../../../services/UnifiedRollDraftService';
import { UnifiedRollExecutionService } from '../../../services/UnifiedRollExecutionService';
import { diceService, p2pSessionService } from '../../../services/serviceRegistry';
import { Button, Checkbox, IconButton, Notice, NumberField, SelectField, TextControl, TextField } from '../../components/common';
import { DiceIcon } from './playerChrome/feedCards/DiceIcon';
import { CompendiumRuleTerm } from './CompendiumRuleTerm';
import { usePrivateRollPreference } from './rollPrivacyPreference';
import { signed } from './helpers';

const execution = new UnifiedRollExecutionService(diceService, p2pSessionService, () => unifiedRollDraftService.currentScopeKey());
const SIDES = [4, 6, 8, 10, 12, 20];

export function UnifiedRollComposer({ role, actorOptions, rollCharacters, rollDisabled = false, rollPending = false }: {
  role: 'gm' | 'player'; actorOptions: UnifiedRollActor[]; rollCharacters: Record<string, PlayerViewCharacterSummary>; rollDisabled?: boolean; rollPending?: boolean;
}) {
  const state = useStream(unifiedRollDraftService.state$);
  const draft = state.draft;
  useStream(charactersStore.toStream());
  const encounter = useStream(encounterStore.toStream());
  const game = useStream(gameStore.toStream());
  const [actorPickerOpen, setActorPickerOpen] = useState(false);
  const [experiencesOpen, setExperiencesOpen] = useState(false);
  const [traitPickerOpen, setTraitPickerOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { formulaInput = null, formulaError = null, proposal = null, modifierInput = null } = state.editor ?? {};
  const setFormulaInput = (value: string | null) => unifiedRollDraftService.setEditor({ formulaInput: value });
  const setFormulaError = (value: string | null) => unifiedRollDraftService.setEditor({ formulaError: value });
  const setProposal = (value: string | null) => unifiedRollDraftService.setEditor({ proposal: value });
  const setModifierInput = (value: string | null) => unifiedRollDraftService.setEditor({ modifierInput: value });
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [privateRoll, setPrivateRoll] = usePrivateRollPreference();
  useEffect(() => { setResultMessage(null); }, [draft?.id]);
  if (!draft) return <p>Выберите кости или действие из листа персонажа.</p>;
  const character = draft.actor.kind === 'character' && draft.actor.id ? rollCharacters[draft.actor.id] : null;
  const adversary = draft.actor.kind === 'adversary' && draft.actor.id ? encounter.adversaries[draft.actor.id] : null;
  const companion = draft.source?.label === 'Компаньон';
  const experiences = draft.mode === 'gmAttack' ? adversary?.experiences ?? []
    : draft.mode === 'action' || draft.mode === 'reaction' ? (companion ? character?.companion?.experiences : character?.experiences) ?? [] : [];
  const selectedExperiences = experiences.filter((item) => draft.experienceIds.includes(item.id));
  const experienceModifier = selectedExperiences.reduce((sum, item) => sum + item.modifier, 0);
  const traitModifier = character?.traits.find((item) => item.id === draft.trait)?.value ?? 0;
  const staticModifier = draft.mode === 'gmAttack' ? (adversary?.attackModifier ?? 0) + experienceModifier : traitModifier + experienceModifier;
  const completeFormula = unifiedRollCompleteFormula(draft, staticModifier);
  const modifier = parseManualRollModifier(modifierInput ?? String(draft.manualModifier));
  const allowedActorIds = actorOptions.flatMap((actor) => actor.id ? [actor.id] : []);
  const error = execution.error(draft, role, allowedActorIds);
  const options = actorOptions.some((actor) => actor.key === draft.actor.key) ? actorOptions : [draft.actor, ...actorOptions];
  const controlsBlocked = Boolean(proposal);
  const update = (patch: Partial<UnifiedRollDraft> | ((current: UnifiedRollDraft) => UnifiedRollDraft)) => {
    unifiedRollDraftService.update(patch); setResultMessage(null);
  };
  const resetFormulaEditor = () => { setFormulaInput(null); setFormulaError(null); };
  const editDice = (sides: number, delta: number) => {
    try {
      const next = editUnifiedRollDice({ ...draft, formula: draft.formula || '0' }, sides, delta);
      if (next.requiresManual) {
        setProposal(appendRollModifier(next.proposedFormula, staticModifier + draft.manualModifier));
        unifiedRollDraftService.update({});
      } else { update(next.draft); resetFormulaEditor(); }
    } catch (caught) { setFormulaError(caught instanceof Error ? caught.message : 'Не удалось изменить кости.'); }
  };
  const changeMode = (mode: UnifiedRollMode) => {
    if (mode === draft.mode) return;
    resetFormulaEditor(); setModifierInput(null);
    update({ mode, formula: mode === 'action' || mode === 'reaction' ? '2d12' : mode === 'gmAttack' ? '1d20' : mode === 'damage' ? draft.damage?.formula ?? draft.formula : completeFormula,
      trait: mode === 'damage' || mode === 'manual' ? undefined : draft.trait ?? character?.spellcastTrait ?? 'agility',
      experienceIds: [], manualModifier: 0, advantageCount: 0, disadvantageCount: 0, quantity: undefined, branches: undefined,
      damageType: mode === 'damage' ? draft.damage?.damageType ?? draft.damageType : undefined,
      hint: mode === 'manual' ? 'Ручной бросок показывает сумму и каждую кость. Исход Дуальности, опыт и его стоимость не применяются автоматически.' : draft.hint });
  };
  let diceTerms: ReturnType<typeof parseDiceFormula> = [];
  try { diceTerms = parseDiceFormula(draft.formula); } catch { /* Unresolved source quantity is editable below. */ }
  return <>
    {state.pending && <Notice tone="warning">
      Подготовлен новый бросок «{state.pending.title}». Текущий набор изменён.
      <Button size="sm" variant="primary" onClick={() => unifiedRollDraftService.choosePending(true)}>Заменить подготовленный бросок</Button>
      <Button size="sm" variant="ghost" onClick={() => unifiedRollDraftService.choosePending(false)}>Оставить текущий</Button>
    </Notice>}
    <div className="unified-roll-heading"><Button variant="ghost" size="sm" aria-label="Выбрать исполнителя броска" aria-expanded={actorPickerOpen} onClick={() => setActorPickerOpen((open) => !open)}>{draft.actor.name}</Button><span className="unified-roll-title">{draft.title}</span>
      {draft.hint && <IconButton variant="ghost" size="sm" aria-label="Контекст способности" title="Контекст способности" aria-expanded={contextOpen} onClick={() => setContextOpen((open) => !open)}><Info size={14} /></IconButton>}
      <IconButton variant="ghost" size="sm" aria-label="Приватный бросок" aria-pressed={privateRoll} title={privateRoll ? "Приватный бросок" : "Публичный бросок"} onClick={() => setPrivateRoll(!privateRoll)}>{privateRoll ? <LockKeyhole size={14} /> : <LockKeyholeOpen size={14} />}</IconButton>
    </div>
    {actorPickerOpen && <SelectField label="Исполнитель броска" value={draft.actor.key} onChange={(event) => {
      const actor = options.find((item) => item.key === event.currentTarget.value);
      if (actor) { update({ actor, experienceIds: [] }); setActorPickerOpen(false); resetFormulaEditor(); }
    }}>{options.map((actor) => <option key={actor.key} value={actor.key}>{actor.name}</option>)}</SelectField>}
    {contextOpen && draft.hint && <small>{draft.hint}</small>}
    {(isTypedUnifiedRoll(draft) || draft.damage) && <div className="unified-roll-modes">
      {character && <Button size="xs" variant={draft.mode === 'action' ? 'primary' : 'ghost'} disabled={controlsBlocked} onClick={() => changeMode('action')}>Действие</Button>}
      {character && <Button size="xs" variant={draft.mode === 'reaction' ? 'primary' : 'ghost'} disabled={controlsBlocked} onClick={() => changeMode('reaction')}>Реакция</Button>}
      {role === 'gm' && adversary && <Button size="xs" variant={draft.mode === 'gmAttack' ? 'primary' : 'ghost'} disabled={controlsBlocked} onClick={() => changeMode('gmAttack')}>Атака</Button>}
      {(draft.damage || draft.mode === 'damage') && <Button size="xs" variant={draft.mode === 'damage' ? 'primary' : 'ghost'} disabled={controlsBlocked} onClick={() => changeMode('damage')}>Урон</Button>}
      {(draft.mode === 'action' || draft.mode === 'reaction') && character && <Button size="xs" variant="ghost" aria-label="Изменить характеристику" onClick={() => setTraitPickerOpen((open) => !open)}>{character.traits.find((trait) => trait.id === draft.trait)?.label ?? draft.trait} {signed(traitModifier)}</Button>}
    </div>}
    {draft.branches?.length && <SelectField label="Вариант способности" value={draft.selectedBranchId ?? ''} onChange={(event) => { update((current) => selectUnifiedRollBranch(current, event.currentTarget.value)); resetFormulaEditor(); }}>
      <option value="">Выберите вариант</option>{draft.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}
    </SelectField>}
    {draft.quantity && <NumberField label={draft.quantity.label} min={draft.quantity.min ?? 1} max={draft.quantity.max ?? 100} value={draft.quantity.value ?? ''} hint={draft.quantity.explanation} onInput={(event) => {
      const value = event.currentTarget.value;
      update((current) => setUnifiedRollQuantity(current, value === '' ? null : Number(value))); resetFormulaEditor();
    }} />}
    <TextField label="Формула броска" value={formulaInput ?? completeFormula} onInput={(event) => {
      const text = event.currentTarget.value; setFormulaInput(text); setFormulaError(null); setProposal(null);
      try {
        const next = applyUnifiedFormulaEdit(draft, text, staticModifier);
        if (next.requiresManual) { setProposal(text); unifiedRollDraftService.update({}); }
        else update(next.draft);
      } catch (caught) { setFormulaError(caught instanceof Error ? caught.message : 'Некорректная формула.'); unifiedRollDraftService.update({}); }
    }} onBlur={() => { if (!formulaError && !proposal) setFormulaInput(null); }} />
    {proposal && <Notice tone="warning">Изменён набор костей проверки. Ручной бросок сохранит указанную формулу и исполнителя, но не определяет исход Дуальности и не списывает стоимость Опытов. Числа в формуле останутся; нужные расходы отметьте вручную.
      <Button size="sm" variant="primary" onClick={() => { try { update(convertUnifiedRollToManual(draft, proposal)); setProposal(null); resetFormulaEditor(); setModifierInput(null); } catch (caught) { setFormulaError(String(caught)); } }}>Сделать ручным броском</Button>
      <Button size="sm" variant="ghost" onClick={() => { setProposal(null); resetFormulaEditor(); }}>Сохранить проверку</Button>
    </Notice>}
    <div className="mini-dice-launcher__tray" aria-label="Подготовленные кости">
      <div className="mini-dice-launcher__tray-list">{diceTerms.map((term, index) => term.kind === 'dice' ? <IconButton key={index} variant="ghost" size="md" aria-label={`Убрать d${term.sides}`} disabled={controlsBlocked} onClick={() => editDice(term.sides, -1)}><DiceIcon kind={`d${term.sides}`} label={`d${term.sides}`} mark={`${term.count}×d${term.sides}`} /></IconButton> : null)}</div>
      <IconButton variant="ghost" size="sm" aria-label="Сбросить набор" onClick={() => { update({ mode: 'manual', formula: '', manualModifier: 0, advantageCount: 0, disadvantageCount: 0, experienceIds: [], quantity: undefined, branches: undefined }); resetFormulaEditor(); setProposal(null); setModifierInput(null); }}>↺</IconButton>
    </div>
    <div className="mini-dice-launcher__dice">{SIDES.map((sides) => <IconButton key={sides} variant="ghost" size="sm" aria-label={`Добавить d${sides}`} disabled={controlsBlocked} onClick={() => editDice(sides, 1)}><DiceIcon kind={`d${sides}`} label={`d${sides}`} mark={`d${sides}`} /></IconButton>)}</div>
    <div className="unified-roll-options-row" aria-label="Преимущество и помеха">
      <Button size="xs" variant={draft.advantageCount ? 'primary' : 'ghost'} disabled={controlsBlocked || draft.mode === 'damage'} onClick={() => { update(addAdvantageDie(draft, 'advantage')); resetFormulaEditor(); }}>Преим.{draft.advantageCount ? ` ${draft.advantageCount}` : ''}</Button>
      <Button size="xs" variant="ghost" disabled={controlsBlocked} onClick={() => { update({ advantageCount: 0, disadvantageCount: 0 }); resetFormulaEditor(); }}>Обычный</Button>
      <Button size="xs" variant={draft.disadvantageCount ? 'danger' : 'ghost'} disabled={controlsBlocked || draft.mode === 'damage'} onClick={() => { update(addAdvantageDie(draft, 'disadvantage')); resetFormulaEditor(); }}>Помеха{draft.disadvantageCount ? ` ${draft.disadvantageCount}` : ''}</Button>
      <TextControl className="unified-roll-modifier" aria-label="Модификатор" title="Итоговая ручная поправка; не дублируйте ей уже учтённое преимущество" value={modifierInput ?? String(draft.manualModifier)} disabled={controlsBlocked} onInput={(event) => {
        const text = event.currentTarget.value; setModifierInput(text); const next = parseManualRollModifier(text);
        if (next.valid) { update({ manualModifier: next.value }); resetFormulaEditor(); }
      }} />
      {experiences.length > 0 && <Button size="xs" variant={selectedExperiences.length ? 'primary' : 'ghost'} aria-expanded={experiencesOpen} onClick={() => setExperiencesOpen((open) => !open)}>Опыт</Button>}
    </div>
    {selectedExperiences.length > 0 && <div className="unified-roll-selected-experiences">{selectedExperiences.map((experience) => <small key={experience.id}>{experience.name} {signed(experience.modifier)}</small>)}</div>}
    {(draft.mode === 'action' || draft.mode === 'reaction') && character && traitPickerOpen && <SelectField label="Характеристика броска" value={draft.trait ?? ''} disabled={controlsBlocked} onChange={(event) => { update({ trait: event.currentTarget.value as UnifiedRollDraft['trait'] }); resetFormulaEditor(); }}>
      {character.traits.map((trait) => <option key={trait.id} value={trait.id}>{trait.label} {signed(trait.value)}</option>)}
    </SelectField>}
    {experiencesOpen && experiences.length > 0 && <div className="player-roll-confirm__checks"><span><CompendiumRuleTerm ruleSlug="experience">Опыт</CompendiumRuleTerm> {experienceModifier ? signed(experienceModifier) : ''}</span>
      {experiences.map((experience) => <Checkbox key={experience.id} label={`${experience.name} ${signed(experience.modifier)}`} checked={draft.experienceIds.includes(experience.id)} disabled={controlsBlocked} onChange={() => { update({ experienceIds: draft.experienceIds.includes(experience.id) ? draft.experienceIds.filter((id) => id !== experience.id) : [...draft.experienceIds, experience.id] }); resetFormulaEditor(); }} />)}
      {draft.experienceIds.length > 0 && !companion && <Button size="xs" variant="ghost" onClick={() => setPaymentOpen((open) => !open)}>Настроить стоимость</Button>}
      {draft.experienceIds.length > 0 && paymentOpen && !companion && <Checkbox label={draft.mode === 'gmAttack' ? 'Потратить Страх за опыт' : 'Потратить Надежду за опыт'} checked={draft.spendHopeForExperiences} disabled={controlsBlocked || companion} onChange={(event) => update({ spendHopeForExperiences: event.currentTarget.checked })} />}
    </div>}
    {draft.mode === 'damage' && <Checkbox label="Критический урон" checked={draft.critical} onChange={(event) => update({ critical: event.currentTarget.checked })} />}
    <output className="unified-roll-formula-summary" aria-label="Итоговая формула">{completeFormula || 'выберите кости'}</output>
    {(error || formulaError || !modifier.valid) && <Notice tone="warning">{formulaError ?? (!modifier.valid ? 'Введите целый модификатор.' : error)}</Notice>}
    {resultMessage && <Notice>{resultMessage}</Notice>}
    {isTypedUnifiedRoll(draft) && draft.spendHopeForExperiences && selectedExperiences.length > 0 && <small className="unified-roll-cost">Цена опыта: {selectedExperiences.length} {draft.mode === 'gmAttack' ? 'Страха' : 'Надежды'}</small>}
    <Button variant="primary" size="md" fullWidth disabled={rollDisabled || rollPending || submitting || Boolean(error || formulaError || proposal) || !modifier.valid} onClick={async () => {
      setSubmitting(true);
      const result = await execution.execute(draft, role, privateRoll ? 'private' : 'public', allowedActorIds);
      setSubmitting(false); setResultMessage(result.ok ? 'Бросок выполнен.' : result.error ?? 'Бросок не выполнен.');
      if (result.ok) unifiedRollDraftService.markRolled();
    }}>Бросить</Button>
  </>;
}
