/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { useStream } from '../../../core/hooks/useStream';
import { cleanMarkdownText } from '../../../core/utils/markdownText';
import { contentService } from '../../../services/serviceRegistry';
import { RuleTerm } from '../../components/common';
import { navigateToRuleArticle } from './routedUiState';

export function CompendiumRuleTerm({
  children,
  ruleSlug,
  sectionAnchor,
  tooltipOnly = false
}: {
  children: ComponentChildren;
  ruleSlug: string;
  sectionAnchor?: string;
  tooltipOnly?: boolean;
}) {
  const content = useStream(contentService.content$);
  const article = content.rules.find((rule) => rule.slug === ruleSlug);
  if (!article) return <>{children}</>;
  const summary = sectionAnchor
    ? ruleSectionSummary(article.body, sectionAnchor) || plainRuleSummary(article.summary || article.body)
    : plainRuleSummary(article.summary || article.body);

  return (
    <RuleTerm
      title={article.name}
      summary={summary}
      onOpen={tooltipOnly ? undefined : () => navigateToRuleArticle(article.slug)}
    >
      {children}
    </RuleTerm>
  );
}

export function plainRuleSummary(value: string): string {
  const summary = cleanMarkdownText(value, { stripEmphasis: true })
    .replace(/<\/?div\b[^>]*>/gi, '')
    .replace(/\s*\{#[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return summary.length > 360 ? `${summary.slice(0, 357).trim()}...` : summary;
}

export function ruleSectionSummary(body: string, sectionAnchor: string): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const anchorPattern = new RegExp(`\\{#${escapeRegExp(sectionAnchor)}\\}`);
  const startIndex = lines.findIndex((line) => anchorPattern.test(line));
  if (startIndex < 0) return '';
  const headingLevel = lines[startIndex].match(/^(#{1,6})\s/)?.[1].length ?? 6;
  const sectionLines: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const nextHeadingLevel = line.match(/^(#{1,6})\s/)?.[1].length;
    if (nextHeadingLevel && nextHeadingLevel <= headingLevel) break;
    if (/^\s*<\/?div\b/i.test(line)) continue;
    if (!line.trim() && sectionLines.some((entry) => entry.trim())) break;
    sectionLines.push(line);
  }
  return plainRuleSummary(sectionLines.join(' '));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
