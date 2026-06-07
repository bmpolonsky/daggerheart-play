/** @jsxImportSource preact */
import { Hand, LibraryBig, Mic, MicOff, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ActionComposerRollOptions } from '../../domain/rules/actionComposer';
import type { DiceVisualTone, RollPublication, TraitId } from '../../domain/rules/types';
import type { AudioLayerState } from '../../services/AudioService';
import type { PolyhedralDieSides } from '../dice/types';
import { Button } from '../components/common/Button';
import { Checkbox } from '../components/common/Checkbox';
import { IconButton } from '../components/common/IconButton';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { DiceIcon } from './playerView/playerChrome/feedCards/DiceIcon';
import { usePrivateRollPreference } from './playerView/rollPrivacyPreference';
import type { PlayerRollType } from './playerView/types';

const DICE_SIDES: PolyhedralDieSides[] = [4, 6, 8, 10, 12, 20];
const DEFAULT_PLAYER_TRAY: DiceTrayItem[] = [
  { id: 'hope', kind: 'hope' },
  { id: 'fear', kind: 'fear' }
];
const DEFAULT_GM_TRAY: DiceTrayItem[] = [{ id: 'd20-default', kind: 'die', sides: 20 }];
export type MiniDiceLauncherMode = 'duality' | 'd20';
export type MiniDiceSelectedActorKind = 'character' | 'adversary' | null;
export type MiniDiceTrayBonusMode = 'duality' | 'd20' | 'mixed';

type DiceTrayItem =
  | { id: string; kind: 'hope' }
  | { id: string; kind: 'fear' }
  | { id: string; kind: 'advantage' }
  | { id: string; kind: 'disadvantage' }
  | { id: string; kind: 'die'; sides: PolyhedralDieSides };

type MiniDualityRollOptions = ActionComposerRollOptions & { manualModifier?: number };

type MiniDiceLauncherProps = {
  actorName: string;
  selectedActorKind?: MiniDiceSelectedActorKind;
  role: 'player' | 'gm';
  voiceState: AudioLayerState;
  activationRaised?: boolean;
  canRequestActivation?: boolean;
  onOpenTools: () => void;
  onActivationToggle?: () => void;
  onVoiceToggle: () => void;
  onRoll: (formula: string, label?: string, publication?: RollPublication, options?: { advantageCount?: number; disadvantageCount?: number; diceTones?: DiceVisualTone[] }) => void;
  onDualityRoll?: (roll: { rollType: PlayerRollType; trait?: TraitId | null; options: MiniDualityRollOptions; publication?: RollPublication }) => void;
};

export function MiniDiceLauncher({ actorName, selectedActorKind = null, role, voiceState, activationRaised = false, canRequestActivation = false, onOpenTools, onActivationToggle, onVoiceToggle, onRoll, onDualityRoll }: MiniDiceLauncherProps) {
  const launcherMode = resolveMiniDiceLauncherMode({ role, selectedActorKind });
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [trayItems, setTrayItems] = useState<DiceTrayItem[]>(() => defaultTrayForMode(launcherMode));
  const [modifier, setModifier] = useState(0);
  const [dualityRollType, setDualityRollType] = useState<PlayerRollType>('action');
  const [privateRoll, setPrivateRoll] = usePrivateRollPreference();
  const publication: RollPublication = privateRoll ? 'private' : 'public';
  const manualFormula = useMemo(() => buildTrayFormula(trayItems, modifier), [modifier, trayItems]);
  const traySummary = useMemo(() => buildTraySummary(trayItems, modifier), [modifier, trayItems]);
  const diceTones = useMemo(() => buildTrayDiceTones(trayItems), [trayItems]);
  const trayBonusMode = useMemo(() => resolveMiniDiceTrayBonusMode(toTrayBonusParts(trayItems)), [trayItems]);
  const hasHope = trayItems.some((item) => item.kind === 'hope');
  const hasFear = trayItems.some((item) => item.kind === 'fear');
  const trayDice = trayItems.filter((item): item is Extract<DiceTrayItem, { kind: 'die' }> => item.kind === 'die');
  const advantageCount = trayItems.filter((item) => item.kind === 'advantage').length;
  const disadvantageCount = trayItems.filter((item) => item.kind === 'disadvantage').length;
  const isDualityRoll = hasHope && hasFear && trayDice.length === 0;
  const rollOptions = {
    advantageCount,
    disadvantageCount,
    diceTones
  };
  const dualityRollOptions: MiniDualityRollOptions = {
    advantageCount,
    disadvantageCount,
    experienceIds: [],
    spendHopeForExperiences: true,
    manualModifier: modifier || undefined
  };
  useEffect(() => {
    setTrayItems(defaultTrayForMode(launcherMode));
    setModifier(0);
  }, [launcherMode]);
  const toggleTray = () => {
    setDismissed(false);
    setOpen((current) => !current);
  };
  const closeTray = () => {
    setOpen(false);
    setDismissed(true);
  };
  const resetAdvantage = () => {
    setTrayItems((current) => current.filter((item) => item.kind !== 'advantage' && item.kind !== 'disadvantage'));
  };
  const resetTray = () => {
    setTrayItems([]);
    setModifier(0);
  };
  const addDualityDice = () => {
    setTrayItems((current) => {
      const next = [...current];
      if (!next.some((item) => item.kind === 'hope')) next.unshift({ id: `hope-${Date.now()}`, kind: 'hope' });
      if (!next.some((item) => item.kind === 'fear')) {
        const hopeIndex = next.findIndex((item) => item.kind === 'hope');
        next.splice(hopeIndex + 1, 0, { id: `fear-${Date.now()}`, kind: 'fear' });
      }
      return next;
    });
  };
  const addDie = (sides: PolyhedralDieSides) => {
    setTrayItems((current) => [...current, { id: `d${sides}-${Date.now()}-${current.length}`, kind: 'die', sides }]);
  };
  const addBonusDie = (kind: 'advantage' | 'disadvantage') => {
    const opposite = kind === 'advantage' ? 'disadvantage' : 'advantage';
    setTrayItems((current) => {
      let oppositeIndex = -1;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (current[index].kind === opposite) {
          oppositeIndex = index;
          break;
        }
      }
      if (oppositeIndex >= 0) {
        const next = current.slice();
        next.splice(oppositeIndex, 1);
        return next;
      }
      return [...current, { id: `${kind}-${Date.now()}-${current.length}`, kind }];
    });
  };
  const removeTrayItem = (id: string) => {
    setTrayItems((current) => current.filter((item) => item.id !== id));
  };
  const rollTray = () => {
    if (isDualityRoll) {
      if (onDualityRoll) {
        onDualityRoll({ rollType: dualityRollType, options: dualityRollOptions, publication });
        resetAdvantage();
        return;
      }
      onRoll('2d12', `${actorName}: Дуальность`, publication, rollOptions);
      resetAdvantage();
      return;
    }
    if (trayItems.length === 0 || !manualFormula) return;
    onRoll(manualFormula, `${actorName}: ${manualFormula}`, publication, rollOptions);
    resetAdvantage();
  };
  const voiceActive = voiceState.voiceStatus === 'live';
  const voiceAttention = voiceState.voiceStatus === 'connecting' || voiceState.voiceStatus === 'permission-denied' || voiceState.voiceStatus === 'error' || voiceState.voiceStatus === 'unsupported';
  const voiceTitle = voiceState.voiceStatus === 'live'
    ? 'Заглушить микрофон'
    : voiceState.voiceStatus === 'muted'
      ? 'Включить микрофон'
      : voiceState.voiceMessage;

  return (
    <section
      className={`mini-dice-launcher ${open ? 'dh-is-open' : ''} ${dismissed ? 'dh-is-dismissed' : ''}`}
      aria-label="Бросок костей"
    >
      <IconButton className="mini-dice-launcher__tools" variant="ghost" size="sm" type="button" title="Библиотека" aria-label="Библиотека" onClick={onOpenTools}>
        <LibraryBig size={16} aria-hidden="true" />
      </IconButton>
      <IconButton
        className={`mini-dice-launcher__quick mini-dice-launcher__quick--${launcherMode}`}
        variant="secondary"
        size="xl"
        type="button"
        title={open ? 'Скрыть панель костей' : 'Открыть панель костей'}
        aria-label={open ? 'Скрыть панель костей' : 'Открыть панель костей'}
        aria-expanded={open}
        onClick={toggleTray}
      >
        <span className="mini-dice-launcher__quick-icons" aria-hidden="true">
          <DiceIcon kind="hope-d12" label="Надежда" />
        </span>
      </IconButton>
      <div className="mini-dice-launcher__right-actions">
        <IconButton
          className="mini-dice-launcher__voice"
          variant="ghost"
          tone={voiceAttention ? 'danger' : voiceActive ? 'green' : 'blue'}
          size="sm"
          type="button"
          title={voiceTitle}
          aria-label={voiceTitle}
          onClick={onVoiceToggle}
        >
          {voiceActive ? <Mic size={16} aria-hidden="true" /> : <MicOff size={16} aria-hidden="true" />}
        </IconButton>
        {role === 'player' && (
          <IconButton
            className="mini-dice-launcher__hand"
            variant={activationRaised ? 'primary' : 'ghost'}
            size="sm"
            type="button"
            title={activationRaised ? 'Опустить руку' : 'Поднять руку'}
            aria-label={activationRaised ? 'Опустить руку' : 'Поднять руку'}
            disabled={!canRequestActivation}
            onClick={onActivationToggle}
          >
            <Hand size={16} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      {open && (
      <div className="mini-dice-launcher__panel" aria-hidden={false}>
        <div className="mini-dice-launcher__panel-head">
          <strong>{isDualityRoll ? 'Дуальность' : 'Кости'}</strong>
          <span>{traySummary}</span>
          <IconButton className="mini-dice-launcher__close" variant="ghost" size="sm" type="button" title="Скрыть панель" aria-label="Скрыть панель" onClick={closeTray}>
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
        <div className="mini-dice-launcher__tray" aria-label="Подготовленные кости">
          <div className="mini-dice-launcher__tray-list">
            {trayItems.length > 0 ? (
              trayItems.map((item) => (
                <IconButton className="mini-dice-launcher__tray-button" variant="ghost" size="md" key={item.id} type="button" title={`Убрать ${trayItemTitle(item, trayBonusMode)}`} aria-label={`Убрать ${trayItemTitle(item, trayBonusMode)}`} onClick={() => removeTrayItem(item.id)}>
                  <DiceIcon kind={trayItemIconKind(item, trayBonusMode)} label={trayItemTitle(item, trayBonusMode)} mark={trayItemMark(item, trayBonusMode)} />
                </IconButton>
              ))
            ) : (
              <span>Выберите кости</span>
            )}
          </div>
          <IconButton className="mini-dice-launcher__reset" variant="ghost" size="sm" type="button" title="Сбросить набор" aria-label="Сбросить набор" onClick={resetTray}>
            <RotateCcw size={13} aria-hidden="true" />
          </IconButton>
        </div>
        <div className="mini-dice-launcher__dice">
          <IconButton
            className="mini-dice-launcher__duality"
            variant="ghost"
            size="sm"
            type="button"
            title="Дуальность"
            aria-label="Дуальность"
            onClick={addDualityDice}
          >
            <DiceIcon kind="duality" label="Дуальность" />
          </IconButton>
          {DICE_SIDES.map((sides) => (
            <IconButton
              className="mini-dice-launcher__die-button"
              variant="ghost"
              size="sm"
              key={sides}
              type="button"
              title={`d${sides}`}
              aria-label={`d${sides}`}
              onClick={() => addDie(sides)}
            >
              <DiceIcon kind={`d${sides}`} label={`d${sides}`} mark={`d${sides}`} />
            </IconButton>
          ))}
        </div>
        <div className="mini-dice-launcher__row">
          <div className="mini-dice-launcher__bonus" aria-label="Преимущество и помеха">
            <Button variant={advantageCount > 0 ? 'primary' : 'ghost'} size="sm" grow type="button" onClick={() => addBonusDie('advantage')}>
              Преим.{advantageCount > 0 ? ` ${advantageCount}` : ''}
            </Button>
            <Button variant={disadvantageCount > 0 ? 'danger' : 'ghost'} size="sm" grow type="button" onClick={() => addBonusDie('disadvantage')}>
              Помеха{disadvantageCount > 0 ? ` ${disadvantageCount}` : ''}
            </Button>
          </div>
          <Stepper label="Мод." value={modifier} min={-20} max={20} onChange={setModifier} />
        </div>
        <div className="mini-dice-launcher__controls">
          {isDualityRoll && (
            <SegmentedControl<PlayerRollType>
              className="mini-dice-launcher__segmented"
              label="Тип броска Дуальности"
              layout="equal"
              value={dualityRollType}
              onChange={setDualityRollType}
              options={[
                { value: 'action', label: 'Действие' },
                { value: 'reaction', label: 'Реакция' },
              ]}
            />
          )}
          <Button className="mini-dice-launcher__roll" variant="primary" size="lg" type="button" disabled={trayItems.length === 0} onClick={rollTray}>
            Бросить
          </Button>
        </div>
        <Checkbox
          className="mini-dice-launcher__private"
          size="sm"
          boxPosition="start"
          label="Приватный бросок"
          checked={privateRoll}
          onChange={(event) => setPrivateRoll(event.currentTarget.checked)}
        />
      </div>
      )}
    </section>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <span className="mini-stepper">
      <small>{label}</small>
      <Button size="iconSm" variant="ghost" type="button" onClick={() => onChange(Math.max(min, value - 1))}>-</Button>
      <strong>{value}</strong>
      <Button size="iconSm" variant="ghost" type="button" onClick={() => onChange(Math.min(max, value + 1))}>+</Button>
    </span>
  );
}

export function resolveMiniDiceLauncherMode(input: { role: 'player' | 'gm'; selectedActorKind?: MiniDiceSelectedActorKind }): MiniDiceLauncherMode {
  return input.role === 'player' || input.selectedActorKind === 'character' ? 'duality' : 'd20';
}

export function resolveMiniDiceTrayBonusMode(input: { hasHope: boolean; hasFear: boolean; dieSides: readonly PolyhedralDieSides[] }): MiniDiceTrayBonusMode {
  if (input.hasHope && input.hasFear && input.dieSides.length === 0) return 'duality';
  if (!input.hasHope && !input.hasFear && input.dieSides.length === 1 && input.dieSides[0] === 20) return 'd20';
  return 'mixed';
}

function defaultTrayForMode(mode: MiniDiceLauncherMode): DiceTrayItem[] {
  return (mode === 'duality' ? DEFAULT_PLAYER_TRAY : DEFAULT_GM_TRAY).map((item) => ({ ...item }));
}

function toTrayBonusParts(items: DiceTrayItem[]): { hasHope: boolean; hasFear: boolean; dieSides: PolyhedralDieSides[] } {
  return {
    hasHope: items.some((item) => item.kind === 'hope'),
    hasFear: items.some((item) => item.kind === 'fear'),
    dieSides: items.flatMap((item) => item.kind === 'die' ? [item.sides] : [])
  };
}

function trayItemTitle(item: DiceTrayItem, bonusMode: MiniDiceTrayBonusMode): string {
  if (item.kind === 'hope') return 'Надежда d12';
  if (item.kind === 'fear') return 'Страх d12';
  if (item.kind === 'advantage') return bonusMode === 'd20' ? 'Преимущество d20' : 'Преимущество d6';
  if (item.kind === 'disadvantage') return bonusMode === 'd20' ? 'Помеха d20' : 'Помеха d6';
  return `d${item.sides}`;
}

function trayItemIconKind(item: DiceTrayItem, bonusMode: MiniDiceTrayBonusMode): string {
  if (item.kind === 'hope') return 'hope-d12';
  if (item.kind === 'fear') return 'fear-d12';
  if (item.kind === 'advantage') return bonusMode === 'd20' ? 'adv-d20' : 'adv-d6';
  if (item.kind === 'disadvantage') return bonusMode === 'd20' ? 'dis-d20' : 'dis-d6';
  return `d${item.sides}`;
}

function trayItemMark(item: DiceTrayItem, bonusMode: MiniDiceTrayBonusMode): string {
  if (item.kind === 'advantage' || item.kind === 'disadvantage') return bonusMode === 'd20' ? 'd20' : 'd6';
  return item.kind === 'die' ? `d${item.sides}` : 'd12';
}

function buildTrayFormula(items: DiceTrayItem[], modifier: number): string {
  if (items.length === 0) return '';
  const hopeFearCount = items.filter((item) => item.kind === 'hope' || item.kind === 'fear').length;
  const dice = items.filter((item): item is Extract<DiceTrayItem, { kind: 'die' }> => item.kind === 'die');
  const terms = DICE_SIDES
    .map((sides) => {
      const count = dice.filter((item) => item.sides === sides).length;
      return count > 0 ? `${count}d${sides}` : '';
    })
    .filter(Boolean);
  if (hopeFearCount > 0) terms.unshift(`${hopeFearCount}d12`);
  const diceFormula = terms.join('+');
  if (modifier === 0) return diceFormula;
  if (!diceFormula) return String(modifier);
  return `${diceFormula}${modifier > 0 ? `+${modifier}` : modifier}`;
}

function buildTraySummary(items: DiceTrayItem[], modifier: number): string {
  if (items.length === 0 && modifier === 0) return 'Пустой набор';
  const parts: string[] = [];
  const hope = items.some((item) => item.kind === 'hope');
  const fear = items.some((item) => item.kind === 'fear');
  if (hope && fear) parts.push('Надежда/Страх');
  else if (hope) parts.push('Надежда');
  else if (fear) parts.push('Страх');
  DICE_SIDES.forEach((sides) => {
    const count = items.filter((item) => item.kind === 'die' && item.sides === sides).length;
    if (count > 0) parts.push(`${count > 1 ? count : ''}d${sides}`);
  });
  const advantage = items.filter((item) => item.kind === 'advantage').length;
  const disadvantage = items.filter((item) => item.kind === 'disadvantage').length;
  if (advantage > 0) parts.push(`Преим. ${advantage}`);
  if (disadvantage > 0) parts.push(`Помеха ${disadvantage}`);
  if (modifier !== 0) parts.push(`Мод. ${modifier > 0 ? '+' : ''}${modifier}`);
  return parts.join(' / ') || 'Пустой набор';
}

function buildTrayDiceTones(items: DiceTrayItem[]): DiceVisualTone[] {
  const tones: DiceVisualTone[] = [];
  items.filter((item) => item.kind === 'hope' || item.kind === 'fear').forEach((item) => tones.push(item.kind));
  DICE_SIDES.forEach((sides) => {
    items.forEach((item) => {
      if (item.kind === 'die' && item.sides === sides) tones.push('neutral');
    });
  });
  return tones;
}
