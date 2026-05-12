import type { TemplateFeature } from "@cards/lib/api";
import { stripInlineMarkers, stripMarkdownLinks } from "@cards/lib/text";

export const FALLBACK_FEATURE_NAME = "Без названия";
export { stripMarkdownLinks };

export function normalizeFeatureName(feature?: TemplateFeature) {
  if (!feature) return "";
  const cleaned = stripInlineMarkers(feature.name?.trim() || "");
  return cleaned || FALLBACK_FEATURE_NAME;
}

function formatFeatureContent(feature: TemplateFeature) {
  const text = feature.text?.trim();
  if (text) {
    return text;
  }

  const name = normalizeFeatureName(feature);
  return name;
}

export function buildAggregatedContent(features: TemplateFeature[]) {
  return features.map(formatFeatureContent).filter(Boolean).join("\n\n");
}
