/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { DomainCardTextMacro } from "../../../../domain/rules/domainCards";
import { renderRulesText } from "../sheetText";

export function RulesMacroText({
  text,
  macros,
  onMacro,
  isInteractive = (macro) => macro.kind !== 'reference'
}: {
  text: string;
  macros: DomainCardTextMacro[];
  onMacro?: (macro: DomainCardTextMacro) => void;
  isInteractive?: (macro: DomainCardTextMacro) => boolean;
}) {
  if (macros.length === 0) return <>{renderRulesText(text)}</>;
  const parts: JSX.Element[] = [];
  let cursor = 0;
  macros.forEach((macro, index) => {
    if (macro.start > cursor) {
      parts.push(<span key={`text-${index}`}>{renderRulesText(text.slice(cursor, macro.start))}</span>);
    }
    const macroText = text.slice(macro.start, macro.end);
    if (!onMacro || !isInteractive(macro)) {
      parts.push(
        <strong className="player-domain-card-reference" key={macro.id}>
          {renderRulesText(macroText)}
        </strong>
      );
      cursor = macro.end;
      return;
    }
    parts.push(
      <span
        className="player-domain-card-macro"
        key={macro.id}
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
        {renderRulesText(macroText)}
      </span>
    );
    cursor = macro.end;
  });
  if (cursor < text.length) {
    parts.push(<span key="text-tail">{renderRulesText(text.slice(cursor))}</span>);
  }
  return <>{parts}</>;
}
