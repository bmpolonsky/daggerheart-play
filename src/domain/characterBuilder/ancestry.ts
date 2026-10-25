import { cleanMarkdownText } from '../../core/utils/markdownText';
import type { GenericLibraryItem } from '../content/types';

/** The upstream ancestry feature array preserves the SRD's first/second order. */
export function mixedAncestryProblem(first: GenericLibraryItem | null, second: GenericLibraryItem | null): string | null {
  if (!first || !second) return 'Выберите две родословные для смешанного наследия.';
  if (first.id === second.id || first.slug === second.slug) return 'Для смешанного наследия выберите две разные родословные.';
  if (!first.raw.features?.[0] || !second.raw.features?.[1]) return 'У родословных должны быть доступны первое и второе свойства в исходном порядке.';
  return null;
}

export function ancestryFeatureChoices(items: GenericLibraryItem[], position: 0 | 1) {
  return items.map((item) => {
    const feature = item.raw.features?.[position];
    return {
      id: item.id,
      title: item.name,
      subtitle: feature?.name ?? 'Свойство недоступно',
      description: cleanMarkdownText(feature?.main_body ?? feature?.text ?? '', { stripEmphasis: true }),
      imageUrl: item.imageUrl
    };
  });
}
