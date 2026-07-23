/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { DomainCardTextMacro } from "../../../../domain/rules/domainCards";
import type { FeatureRuleEffect } from "../../../../domain/rules/featureEffects";
import { RuleEffectText } from "../../../components/common";
import { renderRulesText } from "../sheetText";

export interface RulesTextRange {
  start: number;
  end: number;
  macro: DomainCardTextMacro | null;
  effects: FeatureRuleEffect[];
}

export function RulesMacroText({
  text,
  macros,
  effects = [],
  onMacro,
  isInteractive = (macro) => macro.kind !== 'reference'
}: {
  text: string;
  macros: DomainCardTextMacro[];
  effects?: FeatureRuleEffect[];
  onMacro?: (macro: DomainCardTextMacro) => void;
  isInteractive?: (macro: DomainCardTextMacro) => boolean;
}) {
  if (macros.length === 0 && effects.length === 0) return <>{renderRulesText(text)}</>;
  const parts: JSX.Element[] = buildRulesTextRanges(text, macros, effects).map((range) => {
    const rangeText = text.slice(range.start, range.end);
    let content: JSX.Element = <span>{renderRulesText(rangeText)}</span>;
    const macro = range.macro;
    if (macro) {
      const key = `${macro.id}:${range.start}`;
      if (!onMacro || !isInteractive(macro)) {
        content = (
          <strong className="player-domain-card-reference" key={key}>
            {renderRulesText(rangeText)}
          </strong>
        );
      } else {
        content = (
          <span
            className="player-domain-card-macro"
            key={key}
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onMacro(macro);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              onMacro(macro);
            }}
          >
            {renderRulesText(rangeText)}
          </span>
        );
      }
    }

    const interactiveMacro = Boolean(macro && onMacro && isInteractive(macro));
    return (
      <RuleEffectText effects={range.effects} interactiveChild={interactiveMacro} key={`range-${range.start}-${range.end}`}>
        {content}
      </RuleEffectText>
    );
  });
  return <>{parts}</>;
}

export function buildRulesTextRanges(
  text: string,
  macros: readonly DomainCardTextMacro[],
  effects: readonly FeatureRuleEffect[]
): RulesTextRange[] {
  const textLength = text.length;
  const validMacros = macros.filter((macro) => validRange(macro.start, macro.end, textLength));
  const validEffects = effects.filter((effect) => validRange(effect.evidence.start, effect.evidence.end, textLength));
  const boundaries = new Set<number>([0, textLength]);
  validMacros.forEach((macro) => {
    boundaries.add(macro.start);
    boundaries.add(macro.end);
  });
  validEffects.forEach((effect) => {
    boundaries.add(effect.evidence.start);
    boundaries.add(effect.evidence.end);
  });
  const sorted = [...boundaries].sort((left, right) => left - right);

  return sorted.slice(0, -1).flatMap((start, index) => {
    const end = sorted[index + 1];
    if (end <= start) return [];
    return [{
      start,
      end,
      macro: validMacros.find((macro) => macro.start <= start && macro.end >= end) ?? null,
      effects: validEffects.filter((effect) => effect.evidence.start <= start && effect.evidence.end >= end)
    }];
  });
}

function validRange(start: number, end: number, textLength: number): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= textLength;
}
