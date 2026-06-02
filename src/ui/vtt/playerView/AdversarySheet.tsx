/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import { ChevronLeft, Heart, Zap } from "lucide-react";
import type { PlayerViewAdversarySummary } from "../../../domain/tabletop/playerView";
import type { DomainCardTextMacro } from "../../../domain/rules/domainCards";
import { ACTOR_STATUS_TAGS, ActorStatus, normalizeStatusTag } from "../../../domain/rules/statuses";
import type { DamageType } from "../../../domain/rules/types";
import { diceService, encounterService, feedService, gameService } from "../../../services/serviceRegistry";
import { compactDamageTypeLabel, signed } from "./helpers";
import { AdversaryAttackConfirm } from "./AdversaryAttackConfirm";
import { SheetSection, TrackRow } from "./PlayerSheetControls";
import { SheetFeatureSection, SheetHero, SheetLeadBlock, type SheetFeatureView } from "./SheetContent";
import { StatusChips } from "./StatusChips";

const ADVERSARY_STATUS_OPTIONS = ACTOR_STATUS_TAGS;

export function AdversarySheet({ adversary, onBack }: { adversary: PlayerViewAdversarySummary; onBack: () => void }) {
  const [adversaryAttackConfirmOpen, setAdversaryAttackConfirmOpen] = useState(false);
  const runFeatureMacro = (feature: SheetFeatureView, macro: DomainCardTextMacro) => {
    runAdversaryFeatureMacro(adversary, feature, macro);
  };
  const addStatus = (name: string) => {
    if (normalizeStatusTag(name) === ActorStatus.Defeated) {
      encounterService.updateAdversarySlots(adversary.id, 'hp', { marked: adversary.hp.max });
      return;
    }
    encounterService.addCondition(adversary.id, name);
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
      <aside className="player-character-panel" aria-label="Противник мастера">
        <button className="player-character-panel__back" type="button" title="К ростеру" onClick={onBack}>
          <ChevronLeft size={17} />
        </button>
        <SheetHero
          imageUrl={adversary.portraitUrl}
          title={adversary.name}
          subtitle={adversary.subtitle}
        />
        <SheetLeadBlock text={adversary.notes} />
        <SheetSection title="Статус">
          <section className="player-track-list">
            <TrackRow
              icon={<Heart size={16} />}
              label="Раны"
              value={adversary.hp.marked}
              max={adversary.hp.max}
              onSet={(next) => encounterService.updateAdversarySlots(adversary.id, 'hp', { marked: next })}
            />
            <TrackRow
              icon={<Zap size={16} />}
              label="Стресс"
              value={adversary.stress.marked}
              max={adversary.stress.max}
              onSet={(next) => encounterService.updateAdversarySlots(adversary.id, 'stress', { marked: next })}
            />
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
          <section className="player-sheet-status-block">
            <header>
              <span>Статусы</span>
            </header>
            <StatusChips
              conditions={adversary.conditions}
              options={ADVERSARY_STATUS_OPTIONS}
              onAdd={addStatus}
              onRemove={removeStatus}
            />
          </section>
        </SheetSection>
        <SheetSection title="Атака">
          <button
            className="player-sheet-row player-sheet-row--featured player-sheet-row--button"
            type="button"
            onClick={() => setAdversaryAttackConfirmOpen(true)}
          >
            <strong>{adversary.standardAttack.name}</strong>
            <span>{signed(adversary.attackModifier)} / {adversary.standardAttack.range} / {adversary.standardAttack.damage} {compactDamageTypeLabel(adversary.standardAttack.damageType)}</span>
          </button>
        </SheetSection>
        <SheetSection title="Опыт" emptyLabel="Опыт не указан">
          {adversary.experiences.map((experience) => (
            <article className="player-sheet-row player-sheet-row--compact" key={experience.id}>
              <strong>{experience.name}</strong>
              <b>{signed(experience.modifier)}</b>
            </article>
          ))}
        </SheetSection>
        <SheetFeatureSection
          emptyLabel="Особенности не указаны"
          features={adversary.features}
          isInteractive={isInteractiveAdversaryFeatureTextMacro}
          onMacro={runFeatureMacro}
        />
      </aside>
      {adversaryAttackConfirmOpen && (
        <AdversaryAttackConfirm
          adversary={adversary}
          onAttack={(options) => {
            diceService.rollGmAttackCheck({
              adversaryId: adversary.id,
              ...options,
              notes: `Атака Мастера: ${adversary.standardAttack.name}`
            });
            setAdversaryAttackConfirmOpen(false);
          }}
          onClose={() => setAdversaryAttackConfirmOpen(false)}
          onDamage={(options) => {
            diceService.rollDamage({
              actorId: adversary.id,
              actorName: adversary.name,
              formula: adversary.standardAttack.damage,
              critical: options.critical,
              damageType: adversary.standardAttack.damageType as DamageType,
              publication: options.publication,
              notes: `Атака Мастера: ${adversary.standardAttack.name}`
            });
            setAdversaryAttackConfirmOpen(false);
          }}
        />
      )}
    </>
  );
}

function isInteractiveAdversaryFeatureTextMacro(macro: DomainCardTextMacro): boolean {
  return macro.kind === 'actionRoll' || macro.kind === 'diceRoll' || macro.kind === 'damageRoll' || macro.kind === 'spendFear' || macro.kind === 'gainFear';
}

function runAdversaryFeatureMacro(
  adversary: PlayerViewAdversarySummary,
  feature: SheetFeatureView,
  macro: DomainCardTextMacro
): void {
  const featureName = feature.name || 'Особенность';
  if (macro.kind === 'actionRoll') {
    diceService.rollManualDice({
      actorId: adversary.id,
      actorName: adversary.name,
      formula: '1d20',
      label: macro.label,
      notes: featureMacroNotes(featureName, macro)
    });
    return;
  }
  if (macro.kind === 'diceRoll' || macro.kind === 'damageRoll') {
    diceService.rollManualDice({
      actorId: adversary.id,
      actorName: adversary.name,
      formula: macro.formula,
      label: macro.label,
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
    feedService.addMessage(adversary.name, `${featureName} · ${detail}`, { title: 'Особенность', publication: 'public' });
  }
  if (!applied && !detail) {
    feedService.addMessage(adversary.name, `${featureName} · ресурс не применен: нужна ручная цель`, { title: 'Особенность', publication: 'public' });
  }
}

function featureMacroNotes(featureName: string, macro: DomainCardTextMacro): string {
  const difficulty = macro.kind === 'actionRoll' && macro.difficulty ? ` / Сложность ${macro.difficulty}` : '';
  return `Особенность: ${featureName}. ${macro.label}${difficulty}`;
}
