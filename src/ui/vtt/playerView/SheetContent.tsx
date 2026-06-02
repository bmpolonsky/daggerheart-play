/** @jsxImportSource preact */
import type { JSX } from "preact";
import { parseDomainCardTextMacros, type DomainCardTextMacro } from "../../../domain/rules/domainCards";
import { cssImageUrl, initials } from "./helpers";
import { SheetSection } from "./PlayerSheetControls";
import { RulesMacroText } from "./domainCards/RulesMacroText";
import { cleanRulesTextForInlineMacros, renderRulesText } from "./sheetText";

export interface SheetFeatureView {
  id: string;
  name?: string;
  text: string;
}

export function SheetHero({
  className = '',
  imageUrl,
  meta = [],
  subtitle,
  title
}: {
  className?: string;
  imageUrl: string;
  meta?: string[];
  subtitle?: string;
  title: string;
}) {
  const safeImageUrl = imageUrl.trim();
  const heroStyle = {
    '--player-character-portrait': safeImageUrl ? `url("${cssImageUrl(safeImageUrl)}")` : 'none'
  } as JSX.CSSProperties;
  return (
    <header className={['player-character-panel__hero', className].filter(Boolean).join(' ')} style={heroStyle}>
      {safeImageUrl ? (
        <img src={cssImageUrl(safeImageUrl)} alt="" />
      ) : (
        <div className="player-character-panel__portrait-fallback" aria-hidden="true">{initials(title)}</div>
      )}
      <div className="player-character-panel__hero-copy">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
        {meta.length > 0 && (
          <div className="player-character-panel__hero-meta">
            {meta.map((item) => <small key={item}>{item}</small>)}
          </div>
        )}
      </div>
    </header>
  );
}

export function SheetLeadBlock({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <article className="player-sheet-row player-sheet-row--fulltext player-sheet-row--lead">
      <p>{renderRulesText(text)}</p>
    </article>
  );
}

export function SheetTextSection({ icon, text, title }: { icon?: JSX.Element; text: string; title: string }) {
  if (!text.trim()) return null;
  return (
    <SheetSection title={title}>
      <article className="player-sheet-row player-sheet-row--fulltext">
        {icon}
        <p>{renderRulesText(text)}</p>
      </article>
    </SheetSection>
  );
}

export function SheetFeatureSection({
  emptyLabel,
  features,
  isInteractive,
  onMacro,
  title = 'Особенности'
}: {
  emptyLabel?: string;
  features: SheetFeatureView[];
  isInteractive?: (macro: DomainCardTextMacro) => boolean;
  onMacro?: (feature: SheetFeatureView, macro: DomainCardTextMacro) => void;
  title?: string;
}) {
  return (
    <SheetSection title={title} emptyLabel={emptyLabel}>
      {features.map((feature) => {
        const text = cleanRulesTextForInlineMacros(feature.text);
        return (
          <article className="player-sheet-row player-sheet-row--fulltext player-sheet-feature-block" key={feature.id}>
            {feature.name && <strong>{feature.name}</strong>}
            {text && (
              <p>
                <RulesMacroText
                  text={text}
                  macros={parseDomainCardTextMacros(text)}
                  isInteractive={isInteractive}
                  onMacro={onMacro ? (macro) => onMacro(feature, macro) : undefined}
                />
              </p>
            )}
          </article>
        );
      })}
    </SheetSection>
  );
}

export function parseSheetFeatureText(text: string): SheetFeatureView[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const headings = [...trimmed.matchAll(/^###\s+(.+)$/gmu)];
  if (headings.length > 0) {
    return headings.map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = headings[index + 1]?.index ?? trimmed.length;
      return {
        id: `heading-${index}`,
        name: match[1].trim(),
        text: trimmed.slice(start, end).trim()
      };
    }).filter((feature) => feature.name || feature.text);
  }
  return trimmed.split(/\n{2,}/u).map((block, index) => {
    const normalized = block.trim();
    const match = normalized.match(/^(.{2,80}?)(?:\s+[—-]\s+|:\s+)([\s\S]+)$/u);
    return {
      id: `block-${index}`,
      name: match?.[1]?.trim() ?? '',
      text: (match?.[2] ?? normalized).trim()
    };
  }).filter((feature) => feature.name || feature.text);
}
