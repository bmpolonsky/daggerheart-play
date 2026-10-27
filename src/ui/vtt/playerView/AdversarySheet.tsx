/** @jsxImportSource preact */
import styles from './AdversarySheet.module.css';
import { previewAdversaryDamage } from '../../../domain/rules/adversaryDamage';
import { NumberControl } from '../../components/common';
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { ChevronLeft, Heart, Zap } from "lucide-react";
import type { PlayerViewAdversarySummary } from "../../../domain/tabletop/playerView";
import { resolveContextualDiceBinding } from "../../../domain/rules/contextualDiceBindings";
import type { DomainCardTextMacro } from "../../../domain/rules/domainCards";
import { CORE_STATUS_TAGS, ActorStatus, normalizeStatusTag } from "../../../domain/rules/statuses";
import { encounterService, feedService, gameService, sceneTableService } from "../../../services/serviceRegistry";
import { compactDamageTypeLabel, signed } from "./helpers";
import { PreparedDiceRollDialog } from "./CharacterRollDialog";
import type { PreparedDiceRoll } from "../../../services/CharacterRollService";
import { prefillAdversaryAttack, prefillAdversaryDamage } from "./AdversaryAttackConfirm";
import { SheetSection, TrackRow } from "./PlayerSheetControls";
import { SheetFeatureSection, SheetHero, SheetLeadBlock, type SheetFeatureView } from "./SheetContent";
import { StatusChips } from "./StatusChips";
import { Badge } from "../../components/common/Badge";
import { IconButton } from "../../components/common/IconButton";
import { ListItem } from "../../components/common/ListItem";
import { Button } from "../../components/common/Button";

export function AdversarySheet({ adversary, navigation, onBack, readOnly = false }: { adversary: PlayerViewAdversarySummary; navigation?: ComponentChildren; onBack?: () => void; readOnly?: boolean }) {
  const [featureDiceState, setFeatureDiceState] = useState<{ actorId: string; draft: PreparedDiceRoll } | null>(null);
  const featureDiceDraft = featureDiceState?.actorId === adversary.id ? featureDiceState.draft : null;
  const setFeatureDiceDraft = (draft: PreparedDiceRoll | null) => setFeatureDiceState(draft ? { actorId: adversary.id, draft } : null);
  const runFeatureMacro = (feature: SheetFeatureView, macro: DomainCardTextMacro) => {
    runAdversaryFeatureMacro(adversary, feature, macro, setFeatureDiceDraft);
  };
  const [incomingDamage, setIncomingDamage] = useState<{ actorId: string; value: string }>({ actorId: adversary.id, value: '' });
  const [damageResult, setDamageResult] = useState<{ actorId: string; message: string; applied: boolean } | null>(null);
  const damageValue = incomingDamage.actorId === adversary.id ? incomingDamage.value : '';
  const damagePreview = previewAdversaryDamage(adversary, damageValue.trim() === '' ? null : Number(damageValue));
  const applyIncomingDamage = () => {
    if (!damagePreview.valid) return;
    const result = encounterService.applyAdversaryDamage(damagePreview);
    setDamageResult({ actorId: adversary.id, applied: result.applied, message: result.applied && result.appliedWounds !== undefined
      ? `Отмечено Ран: ${result.appliedWounds} (${damagePreview.markedAfter}/${damagePreview.hpMax}).`
      : result.message });
    if (result.applied) setIncomingDamage({ actorId: adversary.id, value: '' });
  };
  const addStatus = (name: string) => {
    if (normalizeStatusTag(name) === ActorStatus.Defeated) {
      encounterService.updateAdversarySlots(adversary.id, 'hp', { marked: adversary.hp.max });
      return;
    }
    encounterService.addCondition(adversary.id, name);
    if (normalizeStatusTag(name) === ActorStatus.Hidden) {
      sceneTableService.setActorTokensHidden({ kind: 'adversary', id: adversary.id }, true);
    }
  };
  const removeStatus = (conditionId: string) => {
    const condition = adversary.conditions.find((item) => item.id === conditionId);
    if (condition && normalizeStatusTag(condition.name) === ActorStatus.Defeated) {
      encounterService.updateAdversarySlots(adversary.id, 'hp', { marked: Math.max(0, adversary.hp.max - 1) });
      return;
    }
    encounterService.removeCondition(adversary.id, conditionId);
  };
  return (
    <>
      {featureDiceDraft && <PreparedDiceRollDialog actor={adversary} draft={featureDiceDraft} role="gm" onClose={() => setFeatureDiceDraft(null)} />}
      <div className="player-character-panel-shell">
        {navigation}
        <aside className="player-character-panel" aria-label="Противник мастера" data-vtt-side-panel>
          {onBack && (
            <IconButton className="player-character-panel__back" variant="ghost" size="sm" type="button" title="К ростеру" aria-label="К ростеру" onClick={onBack}>
              <ChevronLeft size={17} aria-hidden="true" />
            </IconButton>
          )}
          <SheetHero
            imageUrl={adversary.portraitUrl}
            title={adversary.name}
            subtitle={adversary.subtitle}
          />
          {readOnly && <Badge tone="gold">Подготовленный шаблон</Badge>}
          <SheetLeadBlock text={adversary.notes} />
          <SheetSection title="Состояние">
          <section className="player-track-list">
            <TrackRow
              icon={<Heart size={16} />}
              label="Раны"
              value={adversary.hp.marked}
              max={adversary.hp.max}
              onSet={readOnly ? undefined : (next) => encounterService.updateAdversarySlots(adversary.id, 'hp', { marked: next })}
            />
            <TrackRow
              icon={<Zap size={16} />}
              label="Стресс"
              value={adversary.stress.marked}
              max={adversary.stress.max}
              onSet={readOnly ? undefined : (next) => encounterService.updateAdversarySlots(adversary.id, 'stress', { marked: next })}
            />
            {adversary.hordePerHp && <ListItem title="Противников на Рану" value={String(adversary.hordePerHp)} density="compact" />}
          </section>
          <section className="player-threshold-row" aria-label="Пороги противника">
            <div>
              <span>Сложность</span>
              <strong>{adversary.difficulty}</strong>
            </div>
            <div>
              <span>Ощутимый</span>
              <strong>{adversary.thresholds.major}+</strong>
            </div>
            <div>
              <span>Тяжелый</span>
              <strong>{adversary.thresholds.severe}+</strong>
            </div>
          </section>
          {!readOnly && <details className={styles.incomingDamage}>
            <summary>Входящий урон</summary>
            <div className={styles.damageControls}>
              <NumberControl className={styles.damageInput} aria-label="Полученный урон" placeholder="Урон" min={0} step={1} inputMode="numeric" value={damageValue}
                aria-describedby={`incoming-damage-hint-${adversary.id}`}
                onInput={(event) => { setIncomingDamage({ actorId: adversary.id, value: event.currentTarget.value }); setDamageResult(null); }} />
              <Button size="sm" aria-label="Применить урон" disabled={!damagePreview.valid || damagePreview.appliedWounds === 0} onClick={applyIncomingDamage}>Применить</Button>
            </div>
            <p id={`incoming-damage-hint-${adversary.id}`} className={styles.damageHint}>После сопротивлений и особых свойств.</p>
            {damageValue.trim() !== '' && <p className={`${styles.damageMessage} ${!damagePreview.valid ? styles.damageError : ''}`} aria-live="polite">{damagePreview.valid
              ? `Раны: +${damagePreview.appliedWounds} (${damagePreview.markedBefore} → ${damagePreview.markedAfter} из ${damagePreview.hpMax}).`
              : damagePreview.reason}</p>}
            {damageResult?.actorId === adversary.id && <p className={`${styles.damageMessage} ${!damageResult.applied ? styles.damageError : ''}`} role={damageResult.applied ? 'status' : 'alert'}>{damageResult.message}</p>}
          </details>}
          <section className="player-sheet-status-block">
            <header>
              <span>Состояния</span>
            </header>
            {!readOnly && <StatusChips
              conditions={adversary.conditions}
              options={CORE_STATUS_TAGS}
              onAdd={addStatus}
              onRemove={removeStatus}
            />}
            {readOnly && adversary.conditions.length > 0 && <span>{adversary.conditions.map((condition) => condition.name).join(', ')}</span>}
          </section>
          </SheetSection>
          <SheetSection title="Атака">
          <ListItem
            title={adversary.standardAttack.name}
            className="player-sheet-weapon-row"
            subtitle={`${signed(adversary.attackModifier)} / ${adversary.standardAttack.range} / ${adversary.standardAttack.damage} ${compactDamageTypeLabel(adversary.standardAttack.damageType)}`}
            tone="featured"
            rightAccessory={readOnly ? undefined : <span className="player-sheet-weapon-actions">
              <Button size="xs" variant="ghost" onClick={(event) => { event.stopPropagation(); prefillAdversaryAttack(adversary); }}>Атака</Button>
              <Button size="xs" variant="ghost" onClick={(event) => { event.stopPropagation(); prefillAdversaryDamage(adversary); }}>Урон</Button>
            </span>}
            onClick={readOnly ? undefined : () => prefillAdversaryAttack(adversary)}
          />
          </SheetSection>
          <SheetSection title="Опыт" emptyLabel="Опыт не указан">
          {adversary.experiences.map((experience) => (
            <ListItem key={experience.id} title={experience.name} value={signed(experience.modifier)} density="compact" />
          ))}
          </SheetSection>
          <SheetFeatureSection
            emptyLabel="Особенности не указаны"
            features={adversary.features.map(feature => ({ ...feature, sourceId: adversary.sourceId, featureId: feature.id, collection: 'adversary', slug: adversary.sourceSlug }))}
            macroActor={{ proficiency: Number.NaN, level: Number.NaN, hp: adversary.hp }}
            isInteractive={readOnly ? undefined : isInteractiveAdversaryFeatureTextMacro}
            onMacro={readOnly ? undefined : runFeatureMacro}
          />
        </aside>
      </div>
    </>
  );
}

function isInteractiveAdversaryFeatureTextMacro(macro: DomainCardTextMacro): boolean {
  return macro.kind === 'actionRoll' || macro.kind === 'diceRoll' || macro.kind === 'damageRoll' || macro.kind === 'spendFear' || macro.kind === 'gainFear';
}

function runAdversaryFeatureMacro(
  adversary: PlayerViewAdversarySummary,
  feature: SheetFeatureView,
  macro: DomainCardTextMacro,
  openDiceDraft: (draft: PreparedDiceRoll) => void
): void {
  const featureName = feature.name || 'Особенность';
  if (macro.kind === 'actionRoll' || macro.kind === 'diceRoll' || macro.kind === 'damageRoll') {
    const binding = macro.kind === 'actionRoll' ? { formula: '1d20' } : resolveContextualDiceBinding({ cardId: feature.id, sourceId: feature.sourceId ?? adversary.sourceId, featureId: feature.featureId ?? feature.id, collection: 'adversary', slug: feature.slug ?? adversary.sourceSlug, text: feature.text }, macro, { proficiency: Number.NaN, level: Number.NaN, hp: adversary.hp });
    if ('nonRoll' in binding && binding.nonRoll) return;
    openDiceDraft({
      kind: macro.kind === 'damageRoll' ? 'damage' : 'manualDice',
      ...binding,
      formula: binding.formula,
      source: { cardId: feature.id, sourceId: feature.sourceId ?? adversary.sourceId, label: featureName },
      damageType: macro.kind === 'damageRoll' ? macro.damageType ?? undefined : undefined,
      title: `${featureName}: ${macro.label}`,
      notes: featureMacroNotes(featureName, macro)
    });
    return;
  }
  if (!('amount' in macro)) return;
  let applied = false;
  let detail = '';
  if (macro.kind === 'spendFear') {
    applied = gameService.spendFear(macro.amount);
    detail = applied ? `-${macro.amount} Страх` : `не хватает: -${macro.amount} Страх`;
  } else if (macro.kind === 'gainFear') {
    gameService.gainFear(macro.amount);
    applied = true;
    detail = `+${macro.amount} Страх`;
  }
  if (detail) {
    feedService.addMessage(adversary.name, `${featureName} — ${detail}`, { title: 'Особенность', publication: 'public' });
  }
  if (!applied && !detail) {
    feedService.addMessage(adversary.name, `${featureName} — ресурс не применен: нужна ручная цель`, { title: 'Особенность', publication: 'public' });
  }
}

function featureMacroNotes(featureName: string, macro: DomainCardTextMacro): string {
  const difficulty = macro.kind === 'actionRoll' && macro.difficulty ? ` / Сложность ${macro.difficulty}` : '';
  return `Особенность: ${featureName}. ${macro.label}${difficulty}`;
}
