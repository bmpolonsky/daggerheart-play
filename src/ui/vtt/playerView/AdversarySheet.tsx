/** @jsxImportSource preact */
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { ChevronLeft, Heart, Zap } from "lucide-react";
import type { PlayerViewAdversarySummary } from "../../../domain/tabletop/playerView";
import { parseDomainCardTextMacros, type DomainCardTextMacro } from "../../../domain/rules/domainCards";
import type { DamageType } from "../../../domain/rules/types";
import { diceService, encounterService, feedService, gameService } from "../../../services/serviceRegistry";
import { compactDamageTypeLabel, cssImageUrl, initials, signed } from "./helpers";
import { AdversaryAttackConfirm } from "./AdversaryAttackConfirm";
import { SheetSection, TrackRow } from "./PlayerSheetControls";
import { cleanRulesTextForInlineMacros, renderRulesText } from "./sheetText";
import { RulesMacroText } from "./domainCards/RulesMacroText";

export function AdversarySheet({ adversary, onBack }: { adversary: PlayerViewAdversarySummary; onBack: () => void }) {
  const [adversaryAttackConfirmOpen, setAdversaryAttackConfirmOpen] = useState(false);
  const runFeatureMacro = (feature: AdversaryFeatureView, macro: DomainCardTextMacro) => {
    runAdversaryFeatureMacro(adversary, feature, macro);
  };
  const heroStyle = {
    '--player-character-portrait': adversary.portraitUrl ? `url("${cssImageUrl(adversary.portraitUrl)}")` : 'none'
  } as JSX.CSSProperties;
  return (
    <>
      <aside className="player-character-panel" aria-label="Противник мастера">
        <button className="player-character-panel__back" type="button" title="К ростеру" onClick={onBack}>
          <ChevronLeft size={17} />
        </button>
        <header className="player-character-panel__hero" style={heroStyle}>
          {adversary.portraitUrl ? (
            <img src={cssImageUrl(adversary.portraitUrl)} alt="" />
          ) : (
            <div className="player-character-panel__portrait-fallback" aria-hidden="true">{initials(adversary.name)}</div>
          )}
          <div>
            <strong>{adversary.name}</strong>
            <span>{adversary.subtitle}{adversary.isDefeated ? ' / повержен' : ''}</span>
          </div>
        </header>
        {adversary.notes && (
          <article className="player-sheet-row player-sheet-row--adversary-description">
            <p>{renderRulesText(adversary.notes)}</p>
          </article>
        )}
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
        <SheetSection title="Особенности" emptyLabel="Особенности не указаны">
          {adversary.features.map((feature) => {
            const text = cleanRulesTextForInlineMacros(feature.text);
            const textMacros = parseDomainCardTextMacros(text);
            return (
              <article className="player-sheet-row player-sheet-row--fulltext" key={feature.id}>
                <strong>{feature.name}</strong>
                <p>
                  <RulesMacroText
                    text={text}
                    macros={textMacros}
                    isInteractive={isInteractiveAdversaryFeatureTextMacro}
                    onMacro={(macro) => runFeatureMacro(feature, macro)}
                  />
                </p>
              </article>
            );
          })}
        </SheetSection>
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
  return macro.kind === 'actionRoll' || macro.kind === 'diceRoll' || macro.kind === 'spendFear' || macro.kind === 'gainFear';
}

function runAdversaryFeatureMacro(
  adversary: PlayerViewAdversarySummary,
  feature: AdversaryFeatureView,
  macro: DomainCardTextMacro
): void {
  if (macro.kind === 'actionRoll') {
    diceService.rollManualDice({
      actorId: adversary.id,
      actorName: adversary.name,
      formula: '1d20',
      label: macro.label,
      notes: featureMacroNotes(feature.name, macro)
    });
    return;
  }
  if (macro.kind === 'diceRoll' || macro.kind === 'damageRoll') {
    diceService.rollManualDice({
      actorId: adversary.id,
      actorName: adversary.name,
      formula: macro.formula,
      label: macro.label,
      notes: featureMacroNotes(feature.name, macro)
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
    feedService.addMessage(adversary.name, `${feature.name} · ${detail}`, { title: 'Особенность', publication: 'public' });
  }
  if (!applied && !detail) {
    feedService.addMessage(adversary.name, `${feature.name} · ресурс не применен: нужна ручная цель`, { title: 'Особенность', publication: 'public' });
  }
}

function featureMacroNotes(featureName: string, macro: DomainCardTextMacro): string {
  const difficulty = macro.kind === 'actionRoll' && macro.difficulty ? ` / Сложность ${macro.difficulty}` : '';
  return `Особенность: ${featureName}. ${macro.label}${difficulty}`;
}

type AdversaryFeatureView = PlayerViewAdversarySummary['features'][number];
