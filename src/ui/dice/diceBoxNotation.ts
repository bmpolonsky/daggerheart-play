import type { PolyhedralDiceRoll, PolyhedralDieVisual } from './types';

export function diceBoxNotationForRoll(roll: PolyhedralDiceRoll): string {
  const groups = new Map<number, PolyhedralDieVisual[]>();
  roll.dice.forEach((die) => {
    const value = Math.max(1, Math.min(die.sides, Math.round(die.value)));
    const current = groups.get(die.sides) ?? [];
    current.push({ ...die, value });
    groups.set(die.sides, current);
  });
  const groupedDice = [...groups.entries()];
  const notation = groupedDice
    .map(([sides, dice]) => `${dice.length}d${sides}`)
    .join('+');
  const results = groupedDice.flatMap(([, dice]) => dice.map((die) => die.value));
  return results.length > 0 ? `${notation}@${results.join(',')}` : notation;
}
