/** @jsxImportSource preact */
import type { VNode } from 'preact';
import { cleanMarkdownText, stripMarkdownLinks } from '../../../../core/utils/markdownText';

export function RichText({ text }: { text: string }) {
  const blocks = richBlocks(text);
  if (blocks.length === 0) return <p className="player-library-detail__text">Описание отсутствует в импортированных данных.</p>;
  return <div className="player-library-richtext">{blocks}</div>;
}

function richBlocks(text: string): VNode[] {
  const normalized = normalizeDetailText(cleanMarkdownText(text, { emphasizeLinks: true }))
    .replace(/<\/?div\b[^>]*>/gi, '')
    .replace(/\s*\{#[^}]+\}\s*$/gm, '');
  const blocks: VNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems;
    listItems = [];
    blocks.push(
      <ul className="player-library-richtext__list" key={`list-${blocks.length}`}>
        {items.map((item, index) => <li key={`${index}-${item}`}>{inlineRichText(item)}</li>)}
      </ul>
    );
  };

  normalized.split(/\n{2,}/).forEach((paragraph) => {
    const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return;

    if (isTable(lines)) {
      flushList();
      blocks.push(renderTable(lines, blocks.length));
      return;
    }

    lines.forEach((line) => {
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushList();
        const level = Math.min(6, Math.max(4, heading[1].length));
        blocks.push(
          <h5
            className={`player-library-richtext__heading player-library-richtext__heading--level-${level}`}
            key={`heading-${blocks.length}`}
          >
            {inlineRichText(heading[2])}
          </h5>
        );
        return;
      }

      const bullet = line.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        listItems.push(bullet[1]);
        return;
      }

      flushList();
      blocks.push(<p className="player-library-detail__text" key={`paragraph-${blocks.length}`}>{inlineRichText(line)}</p>);
    });
  });
  flushList();

  return blocks;
}

function inlineRichText(text: string): Array<string | VNode> {
  const cleaned = cleanRuleLinks(text);
  const pieces: Array<string | VNode> = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleaned))) {
    if (match.index > cursor) pieces.push(cleaned.slice(cursor, match.index));
    const token = match[0];
    const value = token.replace(/^\*+|\*+$/g, '');
    pieces.push(<strong key={`${match.index}-${value}`}>{value}</strong>);
    cursor = match.index + token.length;
  }
  if (cursor < cleaned.length) pieces.push(cleaned.slice(cursor));
  return pieces.length > 0 ? pieces : [cleaned];
}

function cleanRuleLinks(text: string): string {
  return stripMarkdownLinks(text);
}

function normalizeDetailText(value: string): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isTable(lines: string[]): boolean {
  return lines.length >= 2 && lines.every((line) => line.includes('|')) && lines.some((line) => /^\|?\s*-+/.test(line));
}

function renderTable(lines: string[], keyIndex: number): VNode {
  const rows = lines
    .filter((line) => !/^\|?\s*:?-{2,}/.test(line))
    .map((line) => line.split('|').map((cell) => cell.trim()).filter(Boolean));
  const [head = [], ...body] = rows;
  return (
    <div className="player-library-richtext__table-wrap" key={`table-${keyIndex}`}>
      <table className="player-library-richtext__table">
        {head.length > 0 && (
          <thead>
            <tr>{head.map((cell) => <th key={cell}>{inlineRichText(cell)}</th>)}</tr>
          </thead>
        )}
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.join('-')}`}>
              {row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{inlineRichText(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
