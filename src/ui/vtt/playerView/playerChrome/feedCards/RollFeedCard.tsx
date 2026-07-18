/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { Eye, Info, LockKeyhole, Trophy } from 'lucide-react';
import { useState } from 'preact/hooks';
import { TRAIT_LABELS } from '../../../../../domain/rules/constants';
import type { TraitId } from '../../../../../domain/rules/types';
import type { TableFeedDiceSummary, TableFeedItem } from '../../../../../domain/tabletop/feed';
import { Button } from '../../../../components/common/Button';
import { IconButton } from '../../../../components/common/IconButton';
import { compactDamageTypeLabel } from '../../helpers';
import type { TableViewRole } from '../../types';
import { DiceIcon } from './DiceIcon';

export function RollFeedCard({
  item,
  waitingForResult,
  role,
  onRevealToPublic
}: {
  item: TableFeedItem;
  waitingForResult: boolean;
  role: TableViewRole;
  onRevealToPublic: (item: TableFeedItem) => void;
}) {
  const roll = item.roll;
  const canReveal = role === 'gm' && item.publication === 'private' && !waitingForResult;
  const rollDetails = roll ? rollDetailRows(roll) : [];
  return (
    <>
      <FeedCardHeader item={item} label={item.kicker}>
        {canReveal && (
          <Button
            className="feed-card-action"
            variant="ghost"
            size="xs"
            type="button"
            aria-label={`Показать всем бросок ${item.title}`}
            title="Показать всем"
            onClick={() => onRevealToPublic(item)}
            iconBefore={<Eye size={13} aria-hidden="true" />}
          >
            Всем
          </Button>
        )}
      </FeedCardHeader>
      <div className="feed-roll-card">
        {waitingForResult ? <PendingDiceSummary /> : roll?.dice && <DiceSummary dice={roll.dice} />}
        <div className="feed-roll-result">
          {waitingForResult ? (
            <b className="feed-roll-total feed-roll-total--pending" aria-label="Итог появится после броска">
              <span className="feed-roll-total__value">...</span>
            </b>
          ) : (
            <>
              {typeof roll?.total === 'number' && <RollTotalBadge roll={roll} />}
              {rollDetails.length > 0 && <RollDetails rows={rollDetails} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function FeedCardHeader({
  item,
  label,
  children
}: {
  item: TableFeedItem;
  label: string;
  children?: ComponentChildren;
}) {
  return (
    <span className="player-activity-event__kicker">
      <span>{label}</span>
      {item.publication === 'private' && (
        <b>
          <LockKeyhole size={10} />
          Приватно
        </b>
      )}
      {children}
    </span>
  );
}

function RollDetails({ rows }: { rows: Array<{ label: string; value: string }> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        className="feed-roll-details-toggle"
        variant={open ? 'primary' : 'ghost'}
        size="xs"
        type="button"
        aria-expanded={open}
        aria-label="Подробности броска"
        title="Подробности броска"
        onClick={() => setOpen((current) => !current)}
      >
        <Info size={13} aria-hidden="true" />
      </IconButton>
      {open && (
        <dl className="feed-roll-details-panel">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

function PendingDiceSummary() {
  return (
    <div className="feed-dice-row feed-dice-row--pending" aria-label="Ожидание броска костей">
      <span className="feed-roll-pending-dice">В процессе...</span>
    </div>
  );
}

function DiceSummary({ dice }: { dice: TableFeedDiceSummary }) {
  if (dice.kind === 'duality') {
    const staticModifierTotal = dualityStaticModifierTotal(dice);
    return (
      <div className="feed-dice-row" aria-label="Кости Надежды и Страха">
        <DieChip tone="hope" iconKind="hope-d12" iconLabel="Надежда" label="Надежда" value={dice.hope.value} />
        <DieChip tone="fear" iconKind="fear-d12" iconLabel="Страх" label="Страх" value={dice.fear.value} />
        {dice.keptExtraDie !== 0 && (
          <DieChip tone="neutral" iconKind={`${dice.keptExtraDie > 0 ? 'adv' : 'dis'}-d6`} iconLabel={dice.keptExtraDie > 0 ? 'Преимущество' : 'Помеха'} label={dice.keptExtraDie > 0 ? 'Преимущество' : 'Помеха'} value={Math.abs(dice.keptExtraDie)} sign={dice.keptExtraDie > 0 ? '+' : '-'} />
        )}
        {staticModifierTotal !== 0 && <ModifierChip label="Модификатор" value={staticModifierTotal} />}
      </div>
    );
  }
  return (
    <div className="feed-formula-dice" aria-label={`Формула ${dice.formula}`}>
      {formulaDiceChips(dice)}
    </div>
  );
}

function DieChip({
  tone,
  iconKind,
  iconLabel,
  label,
  value,
  sign
}: {
  tone: 'hope' | 'fear' | 'neutral';
  iconKind: string;
  iconLabel: string;
  label: string;
  value: number;
  sign?: string;
}) {
  return (
    <span className={`feed-die-chip feed-die-chip--${tone}`} title={label}>
      <DiceIcon kind={iconKind} label={iconLabel} mark={`${sign ?? ''}${value}`} />
    </span>
  );
}

function ModifierChip({ label, value }: { label: string; value: number }) {
  return <span className="feed-mod-chip" title={label}>{value > 0 ? '+' : ''}{value}</span>;
}

function RollTotalBadge({ roll }: { roll: NonNullable<TableFeedItem['roll']> }) {
  const presentation = rollTotalPresentation(roll);
  return (
    <b className={`feed-roll-total feed-roll-total--${rollTotalTone(roll)}`} aria-label={`Итог ${presentation.accessibleLabel}`}>
      <span className="feed-roll-total__value">{presentation.value}</span>
      {presentation.caption && (
        <span className="feed-roll-total__caption">
          {roll.dice?.kind === 'duality' && roll.dice.isCritical && <Trophy size={13} />}
          {presentation.caption}
        </span>
      )}
    </b>
  );
}

function formulaDiceChips(dice: Extract<TableFeedDiceSummary, { kind: 'formula' }>): ComponentChildren[] {
  let diceIndex = 0;
  let flatModifierTotal = 0;
  const chips = dice.terms.flatMap((term, termIndex) => {
    if (!('sides' in term)) {
      flatModifierTotal += term.sign * term.value;
      return [];
    }
    const sign = term.sign < 0 ? '-' : '';
    return term.rolls.map((value, rollIndex) => {
      const tone = dice.diceTones?.[diceIndex++] ?? 'neutral';
      const chipTone = tone === 'hope' || tone === 'fear' ? tone : 'neutral';
      return (
        <span className={`feed-die-chip feed-die-chip--${chipTone}`} title={`${sign}${term.count}d${term.sides}`} key={`dice-${termIndex}-${rollIndex}`}>
          <DiceIcon kind={formulaDieIconKind(tone, term.sides)} label={`d${term.sides}`} mark={`${sign}${value}`} />
        </span>
      );
    });
  });
  if (flatModifierTotal !== 0) {
    chips.push(<ModifierChip label="Модификатор" value={flatModifierTotal} key="flat-total" />);
  }
  return chips;
}

function formulaDieIconKind(tone: string, sides: number): string {
  if (tone === 'hope') return `hope-d${sides}`;
  if (tone === 'fear') return `fear-d${sides}`;
  if (tone === 'advantage') return `adv-d${sides}`;
  if (tone === 'disadvantage') return `dis-d${sides}`;
  return `d${sides}`;
}

function rollDetailRows(roll: NonNullable<TableFeedItem['roll']>): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const dice = roll.dice;
  const context = rollContextNote(roll.note);
  if (dice?.kind === 'duality') {
    const staticModifiers = dualityStaticModifiers(dice);
    rows.push({ label: 'Формула', value: dualityFormula(dice) });
    if (staticModifiers.length > 0) rows.push({ label: 'Модификаторы', value: modifierSummary(staticModifiers) });
    if (dice.difficulty > 0) rows.push({ label: 'Сложность', value: String(dice.difficulty) });
  } else if (dice?.kind === 'formula') {
    rows.push({ label: 'Формула', value: formulaFromTerms(dice) || dice.formula });
    if (dice.critical) rows.push({ label: 'Крит', value: dice.criticalBonus ? `+${dice.criticalBonus}` : 'да' });
    if (dice.damageType) rows.push({ label: 'Тип', value: compactDamageTypeLabel(dice.damageType) });
  }
  if (context) rows.push({ label: 'Источник', value: context });
  return rows;
}

function dualityFormula(dice: Extract<TableFeedDiceSummary, { kind: 'duality' }>): string {
  const parts = ['2d12'];
  if (dice.advantageRolls.length > 0) {
    parts.push(`+ ${dice.advantageRolls.length}d6kh`);
  }
  if (dice.disadvantageRolls.length > 0) {
    parts.push(`- ${dice.disadvantageRolls.length}d6kh`);
  }
  const flatModifier = dualityStaticModifierTotal(dice);
  if (flatModifier !== 0) parts.push(formatSignedTerm(flatModifier));
  return parts.join(' ');
}

function dualityStaticModifiers(dice: Extract<TableFeedDiceSummary, { kind: 'duality' }>): Array<{ label: string; value: number }> {
  return dice.modifiers.filter((modifier) => modifier.label !== 'Преимущество' && modifier.label !== 'Помеха');
}

function dualityStaticModifierTotal(dice: Extract<TableFeedDiceSummary, { kind: 'duality' }>): number {
  return dualityStaticModifiers(dice).reduce((sum, modifier) => sum + modifier.value, 0);
}

function formulaFromTerms(dice: Extract<TableFeedDiceSummary, { kind: 'formula' }>): string {
  const parts = dice.terms.map((term, index) => {
    const sign = term.sign < 0 ? '-' : index === 0 ? '' : '+';
    if (!('sides' in term)) {
      return `${sign ? `${sign} ` : ''}${term.value}`;
    }
    const keepSuffix = keepSuffixForTerm(term);
    return `${sign ? `${sign} ` : ''}${term.count}d${term.sides}${keepSuffix}`;
  });
  return parts.join(' ').trim();
}

function keepSuffixForTerm(term: Extract<Extract<TableFeedDiceSummary, { kind: 'formula' }>['terms'][number], { sides: number }>): string {
  if (term.rolls.length <= 1) return '';
  const rolledTotal = term.rolls.reduce((sum, value) => sum + value, 0) * term.sign;
  if (term.subtotal === rolledTotal) return '';
  const kept = Math.abs(term.subtotal);
  if (kept === Math.min(...term.rolls)) return 'kl';
  if (kept === Math.max(...term.rolls)) return 'kh';
  return '';
}

function formatSignedTerm(value: number): string {
  return `${value > 0 ? '+' : '-'} ${Math.abs(value)}`;
}

function modifierSummary(modifiers: Array<{ label: string; value: number }>): string {
  return modifiers.map((modifier) => `${modifierLabel(modifier.label)} ${modifier.value > 0 ? '+' : ''}${modifier.value}`).join(', ');
}

function modifierLabel(label: string): string {
  return isTraitId(label) ? TRAIT_LABELS[label] : label;
}

function isTraitId(value: string): value is TraitId {
  return value === 'agility' || value === 'strength' || value === 'finesse' || value === 'instinct' || value === 'presence' || value === 'knowledge';
}

function rollContextNote(note: string | undefined): string {
  const normalized = note?.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  const withoutServiceText = normalized
    .replace(/(?:^|[.]\s*)Сложность определяет мастер[.]?$/i, '')
    .trim();
  if (!withoutServiceText || /^Бросок Дуальности$/i.test(withoutServiceText)) return '';
  return withoutServiceText.replace(/[.]\s+/g, ' / ');
}

function rollTotalPresentation(roll: NonNullable<TableFeedItem['roll']>): { value: string; caption?: string; accessibleLabel: string } {
  const value = String(roll.total);
  if (roll.dice?.kind !== 'duality') return { value, accessibleLabel: value };
  if (roll.dice.isCritical) return { value, caption: 'критически', accessibleLabel: `${value}, критический успех` };
  const caption = roll.dice.hope.value >= roll.dice.fear.value ? 'с Надеждой' : 'со Страхом';
  return { value, caption, accessibleLabel: `${value} ${caption}` };
}

function rollTotalTone(roll: NonNullable<TableFeedItem['roll']>): 'neutral' | 'hope' | 'fear' | 'critical' {
  if (roll.dice?.kind !== 'duality') return 'neutral';
  if (roll.dice.isCritical) return 'critical';
  return roll.dice.hope.value >= roll.dice.fear.value ? 'hope' : 'fear';
}
