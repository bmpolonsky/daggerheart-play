/** The assigned seat remains the source of player identity; omit only a duplicate caption. */
export function characterRosterPlayerCaption(characterName: string, assignedPlayerName: string | null): string | undefined {
  if (assignedPlayerName === null) return 'Игрок не назначен';
  const playerName = assignedPlayerName.trim();
  if (!playerName) return 'Игрок без имени';
  if (playerName.localeCompare(characterName.trim(), 'ru', { sensitivity: 'base' }) === 0) return undefined;
  return `Игрок: ${playerName}`;
}
