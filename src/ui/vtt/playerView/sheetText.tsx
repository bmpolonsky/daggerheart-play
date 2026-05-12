/** @jsxImportSource preact */
import { cleanMarkdownText } from "../../../core/utils/markdownText";

export function renderRulesText(value: string) {
  const cleanValue = cleanMarkdownText(value, { emphasizeLinks: true, trim: false });
  const parts = cleanValue.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith("***") && part.endsWith("***")) {
      return (
        <strong key={index}>
          <em>{part.slice(3, -3)}</em>
        </strong>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export function cleanRulesTextForInlineMacros(value: string): string {
  return cleanMarkdownText(value, { stripEmphasis: true });
}
