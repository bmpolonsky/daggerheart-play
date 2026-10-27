import { cleanMarkdownText } from '../../../core/utils/markdownText';
import { ancestryFeatureChoices, mixedAncestryProblem } from '../../../domain/characterBuilder/ancestry';
import type { GenericLibraryItem } from '../../../domain/content/types';

export function ancestrySelectionPresentation(ancestries: GenericLibraryItem[], firstId: string, secondId?: string) {
  const mixed = secondId !== undefined;
  const firstAncestry = ancestries.find(item => item.id === firstId) ?? null;
  const secondAncestry = ancestries.find(item => item.id === secondId) ?? null;
  const firstOptions = ancestryFeatureChoices(ancestries, 0);
  const secondOptions = ancestryFeatureChoices(ancestries, 1);
  const first = firstOptions.find(item => item.id === firstId) ?? null;
  const second = secondOptions.find(item => item.id === secondId) ?? null;
  const unavailable = Boolean((firstId && !firstAncestry) || (secondId && !secondAncestry));
  const issue = unavailable ? 'Выбранная родословная больше недоступна. Выберите другую.'
    : mixed && firstAncestry && secondAncestry ? mixedAncestryProblem(firstAncestry, secondAncestry) : null;
  return {
    mixed, first, second, firstOptions, secondOptions, issue, firstAncestry,
    // A mixed selection describes exactly its selected position, never the
    // ancestry's body or its other mechanical feature.
    pair: [
      first ? `${first.title} — ${first.subtitle}` : 'Первое свойство не выбрано',
      second ? `${second.title} — ${second.subtitle}` : 'Второе свойство не выбрано'
    ],
    singleOptions: ancestries.map(item => ({ ...item, featureNames: item.raw.features?.map(feature => feature.name).filter(Boolean).join(', ') ?? '' })),
    singleFeatures: firstAncestry?.raw.features?.map((feature, index) => ({
      id: String(feature.id ?? index), name: feature.name ?? 'Свойство',
      description: cleanMarkdownText(feature.main_body ?? feature.text ?? '', { stripEmphasis: true })
    })) ?? [],
    singleDescription: cleanMarkdownText(firstAncestry?.body ?? '', { stripEmphasis: true })
  };
}

export type AncestryFeatureOption = ReturnType<typeof ancestryFeatureChoices>[number];

export function filterAncestryOptions<T extends { title?: string; name?: string; subtitle?: string; featureNames?: string; description?: string }>(options: readonly T[], query: string): T[] {
  const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е');
  const needle = normalize(query.trim());
  if (!needle) return [...options];
  return options.filter(option => normalize([option.title, option.name, option.subtitle, option.featureNames, option.description].filter(Boolean).join(' ')).includes(needle));
}
