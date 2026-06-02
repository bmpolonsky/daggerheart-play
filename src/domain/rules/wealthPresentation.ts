import type { CharacterWealth } from './types';

export function formatWealthSummary(
  wealth: Partial<CharacterWealth> | null | undefined,
  options: { showCoins?: boolean } = {}
): string {
  const showCoins = options.showCoins ?? true;
  const parts = [
    showCoins && wealth?.coins ? `Монеты: ${wealth.coins}` : '',
    wealth?.handfuls ? `Горсти: ${wealth.handfuls}` : '',
    wealth?.bags ? `Мешки: ${wealth.bags}` : '',
    wealth?.chests ? `Сундуки: ${wealth.chests}` : ''
  ].filter(Boolean);
  return parts.join(', ') || 'нет';
}
