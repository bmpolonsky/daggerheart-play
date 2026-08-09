/** @jsxImportSource preact */
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { ChevronLeft, Heart, Zap } from "lucide-react";
import type { PlayerViewAdversarySummary } from "../../../domain/tabletop/playerView";
import type { DomainCardTextMacro } from "../../../domain/rules/domainCards";
import { CORE_STATUS_TAGS, ActorStatus, normalizeStatusTag } from "../../../domain/rules/statuses";
import type { DamageType } from "../../../domain/rules/types";
import { diceService, encounterService, feedService, gameService, sceneTableService } from "../../../services/serviceRegistry";
import { compactDamageTypeLabel, signed } from "./helpers";
import { AdversaryAttackConfirm } from "./AdversaryAttackConfirm";
import { SheetSection, TrackRow } from "./PlayerSheetControls";
import { SheetFeatureSection, SheetHero, SheetLeadBlock, type SheetFeatureView } from "./SheetContent";
import { StatusChips } from "./StatusChips";
import { IconButton } from "../../components/common/IconButton";
import { ListItem } from "../../components/common/ListItem";

export function AdversarySheet({ adversary, navigation, onBack }: { adversary: PlayerViewAdversarySummary; navigation?: ComponentChildren; onBack?: () => void }) {
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
          <SheetLeadBlock text={adversary.notes} />
          <SheetSection title="Состояние">
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
            {adversary.hordePerHp && <ListItem title="Раны на противника" value={String(adversary.hordePerHp)} density="compact" />}
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
              <span>Состояния</span>
            </header>
            <StatusChips
              conditions={adversary.conditions}
              options={CORE_STATUS_TAGS}
              onAdd={addStatus}
              onRemove={removeStatus}
            />
          </section>
          </SheetSection>
          <SheetSection title="Атака">
          <ListItem
            title={adversary.standardAttack.name}
            subtitle={`${signed(adversary.attackModifier)} / ${adversary.standardAttack.range} / ${adversary.standardAttack.damage} ${compactDamageTypeLabel(adversary.standardAttack.damageType)}`}
            tone="featured"
            onClick={() => setAdversaryAttackConfirmOpen(true)}
          />
          </SheetSection>
          <SheetSection title="Опыт" emptyLabel="Опыт не указан">
          {adversary.experiences.map((experience) => (
            <ListItem key={experience.id} title={experience.name} value={signed(experience.modifier)} density="compact" />
          ))}
          </SheetSection>
          <SheetFeatureSection
            emptyLabel="Особенности не указаны"
            features={adversary.features}
            isInteractive={isInteractiveAdversaryFeatureTextMacro}
            onMacro={runFeatureMacro}
          />
        </aside>
      </div>
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
