import { stripInlineMarkers } from "@cards/lib/text";

const HEADING_REGEX = /^(#{1,3})\s+(.*)$/;
const LIST_ITEM_REGEX = /^-\s+(.*)$/;
const LINK_REGEX = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const BOLD_ITALIC_REGEX = /\*\*\*([^*]+)\*\*\*/g;
const BOLD_REGEX = /\*\*([^*]+)\*\*/g;
const ITALIC_REGEX = /\*([^*]+)\*/g;
const CODE_REGEX = /`([^`]+)`/g;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHref(rawUrl: string) {
  const value = rawUrl.trim();
  if (!value) return null;

  const lowered = value.toLowerCase();
  if (lowered.startsWith("javascript:") || lowered.startsWith("data:")) {
    return null;
  }

  if (
    lowered.startsWith("http://") ||
    lowered.startsWith("https://") ||
    lowered.startsWith("/") ||
    lowered.startsWith("./") ||
    lowered.startsWith("../") ||
    lowered.startsWith("#")
  ) {
    return value;
  }

  return null;
}

function transformInline(markdown: string) {
  let output = stripInlineMarkers(markdown);
  output = escapeHtml(output);

  output = output.replace(LINK_REGEX, (_match, label, url) => {
    const safeLabel = escapeHtml(label);
    const sanitizedUrl = sanitizeHref(url);
    if (!sanitizedUrl) {
      return safeLabel;
    }

    const escapedUrl = escapeHtml(sanitizedUrl);
    const isExternal = /^https?:\/\//i.test(sanitizedUrl);
    const rel = isExternal ? ' rel="noopener noreferrer"' : "";
    const target = isExternal ? ' target="_blank"' : "";
    return `<a href="${escapedUrl}"${target}${rel}>${safeLabel}</a>`;
  });

  output = output.replace(BOLD_ITALIC_REGEX, "<strong><em>$1</em></strong>");
  output = output.replace(BOLD_REGEX, "<strong>$1</strong>");
  output = output.replace(ITALIC_REGEX, "<em>$1</em>");
  output = output.replace(CODE_REGEX, "<code>$1</code>");

  return output;
}

export function renderMarkdown(source: string) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      html.push("<ul>");
      html.push(...listBuffer);
      html.push("</ul>");
      listBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line) {
      flushList();
      continue;
    }

    const headingMatch = line.match(HEADING_REGEX);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const content = transformInline(headingMatch[2].trim());
      html.push(`<h${level}>${content}</h${level}>`);
      continue;
    }

    const listMatch = line.match(LIST_ITEM_REGEX);
    if (listMatch) {
      const content = transformInline(listMatch[1].trim());
      listBuffer.push(`<li>${content}</li>`);
      continue;
    }

    flushList();
    const content = transformInline(line);
    html.push(`<p>${content}</p>`);
  }

  flushList();

  return html.join("");
}
