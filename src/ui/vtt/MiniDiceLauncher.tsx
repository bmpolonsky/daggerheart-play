/** @jsxImportSource preact */
import { Hand, LoaderCircle, Phone, PhoneCall, RotateCcw, Users, X } from 'lucide-react';
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { DraggableSurface, Surface } from '../components/common';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { selectManualDice, type DiceTrayItem, type DiceTraySelectionMode, type ManualDieSides } from '../../domain/rules/manualDiceTray';
import { createId } from '../../core/utils/id';
import type { ActionComposerRollOptions } from '../../domain/rules/actionComposer';
import type { DiceVisualTone, RollPublication, TraitId } from '../../domain/rules/types';
import type { MediaCallState } from '../../services/MediaCallService';
import type { PolyhedralDieSides } from '../dice/types';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Checkbox } from '../components/common/Checkbox';
import { IconButton } from '../components/common/IconButton';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { DiceIcon } from './playerView/playerChrome/feedCards/DiceIcon';
import { usePrivateRollPreference } from './playerView/rollPrivacyPreference';
import type { PlayerRollType } from './playerView/types';

const DICE_SIDES: ManualDieSides[] = [4, 6, 8, 10, 12, 20];
const DEFAULT_PLAYER_TRAY: DiceTrayItem[] = [
  { id: 'hope', kind: 'hope' },
  { id: 'fear', kind: 'fear' }
];
const DEFAULT_GM_TRAY: DiceTrayItem[] = [{ id: 'd20-default', kind: 'die', sides: 20 }];
export type MiniDiceLauncherMode = 'duality' | 'd20';
export type MiniDiceSelectedActorKind = 'character' | 'adversary' | null;
export type MiniDiceTrayBonusMode = 'duality' | 'd20' | 'mixed';

type MiniDualityRollOptions = ActionComposerRollOptions & { manualModifier?: number };

type MiniDiceLauncherProps = {
  composer?: ComponentChildren;
  openRequest?: number;
  onOpenTray?: () => void;
  actorName: string;
  actorControl?: ComponentChildren;
  onOpenCharacterRoll?: () => void;
  selectedActorKind?: MiniDiceSelectedActorKind;
  role: 'player' | 'gm';
  callState: MediaCallState;
  callAvailable?: boolean;
  activationRaised?: boolean;
  activationRequestCount?: number;
  canRequestActivation?: boolean;
  rollPending?: boolean;
  rollDisabled?: boolean;
  onActivationToggle?: () => void;
  onCallJoin: () => void;
  onRosterOpen?: () => void;
  onRoll: (formula: string, label?: string, publication?: RollPublication, options?: { advantageCount?: number; disadvantageCount?: number; diceTones?: DiceVisualTone[] }) => void;
  onDualityRoll?: (roll: { rollType: PlayerRollType; trait?: TraitId | null; options: MiniDualityRollOptions; publication?: RollPublication }) => void;
};

export function MiniDiceLauncher({ composer, openRequest = 0, onOpenTray, actorName, actorControl, onOpenCharacterRoll, selectedActorKind = null, role, callState, callAvailable = true, activationRaised = false, activationRequestCount = 0, canRequestActivation = false, rollPending = false, rollDisabled = false, onActivationToggle, onCallJoin, onRosterOpen, onRoll, onDualityRoll }: MiniDiceLauncherProps) {
  const launcherMode = resolveMiniDiceLauncherMode({ role, selectedActorKind });
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastOpenRequest = useRef(0);
  useEffect(() => {
    if (openRequest > lastOpenRequest.current) { setOpen(true); setDismissed(false); }
    lastOpenRequest.current = openRequest;
  }, [openRequest]);
  const [trayItems, setTrayItems] = useState<DiceTrayItem[]>(() => defaultTrayForMode(launcherMode));
  const [modifier, setModifier] = useState(0);
  const [selectionMode, setSelectionMode] = useState<DiceTraySelectionMode>('add');
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
    if (composer) return;
    setTrayItems(defaultTrayForMode(launcherMode));
    setModifier(0);
  }, [launcherMode]);
  const toggleTray = () => {
    if (!open) onOpenTray?.();
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
    setTrayItems((current) => selectManualDice(current, { kind: 'duality' }, selectionMode, createId('tray')));
  };
  const addDie = (sides: ManualDieSides) => {
    setTrayItems((current) => selectManualDice(current, { kind: 'die', sides }, selectionMode, createId('tray')));
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
  const callAttention = callState.status === 'permission-denied' || callState.status === 'error' || callState.status === 'unsupported';
  const callTitle = !callAvailable ? 'Сначала откройте сетевую комнату' : callState.active ? 'Звонок подключён' : 'Подключиться к звонку';
  const rosterTitle = activationRequestCount > 0
    ? `Открыть участников: поднятых рук ${activationRequestCount}`
    : 'Открыть участников';

  return (
    <section
      className={`mini-dice-launcher mini-dice-launcher--${role} ${open ? 'dh-is-open' : ''} ${dismissed ? 'dh-is-dismissed' : ''}`}
      aria-label="Бросок костей"
    >
      <div className="mini-dice-launcher__left-actions">
        <IconButton
          className="mini-dice-launcher__voice"
          variant="ghost"
          tone={callAttention ? 'danger' : callState.active ? 'green' : 'neutral'}
          size="sm"
          type="button"
          disabled={!callAvailable}
          title={callTitle}
          aria-label={callTitle}
          onClick={onCallJoin}
        >
          {callState.active ? <PhoneCall size={16} aria-hidden="true" /> : <Phone size={16} aria-hidden="true" />}
        </IconButton>
      </div>
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
        {role === 'gm' && (
          <IconButton
            className="mini-dice-launcher__roster"
            variant="ghost"
            tone={activationRequestCount > 0 ? 'gold' : 'neutral'}
            size="sm"
            type="button"
            title={rosterTitle}
            aria-label={rosterTitle}
            onClick={onRosterOpen}
          >
            <Users size={16} aria-hidden="true" />
            {activationRequestCount > 0 && <Badge size="xs" tone="gold">{activationRequestCount}</Badge>}
          </IconButton>
        )}
      </div>
      {open && (
      <DiceTraySurface title={composer ? 'Подготовка броска' : `${actorName}: ${isDualityRoll ? 'Дуальность' : 'Кости'}`} onClose={closeTray}>
        {!composer && <span>{traySummary}</span>}
        {composer ? composer : <>
        {actorControl}
        {onOpenCharacterRoll && <Button variant="secondary" size="sm" fullWidth onClick={() => { closeTray(); onOpenCharacterRoll(); }}>Проверка персонажа</Button>}
        <SegmentedControl<DiceTraySelectionMode>
          label="Выбор костей"
          value={selectionMode}
          onChange={setSelectionMode}
          layout="equal"
          options={[{ value: 'add', label: 'Добавлять' }, { value: 'replace', label: 'Заменять набор' }]}
        />
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
            title={selectionMode === 'add' ? 'Добавить Дуальность' : 'Заменить набор на Дуальность'}
            aria-label={selectionMode === 'add' ? 'Добавить Дуальность' : 'Заменить набор на Дуальность'}
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
              title={`${selectionMode === 'add' ? 'Добавить' : 'Заменить набор на'} d${sides}`}
              aria-label={`${selectionMode === 'add' ? 'Добавить' : 'Заменить набор на'} d${sides}`}
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
          <Button className={`mini-dice-launcher__roll ${rollPending ? 'is-pending' : ''}`} variant="primary" size="lg" type="button" disabled={trayItems.length === 0 || rollPending || rollDisabled} onClick={rollTray} iconBefore={rollPending ? <LoaderCircle className="mini-dice-launcher__roll-spinner" size={16} aria-hidden="true" /> : undefined}>
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
        </>}
      </DiceTraySurface>
      )}
    </section>
  );
}

/** This shell remounts on every reopen; only its position resets. Draft lives outside. */
function DiceTraySurface({ title, children, onClose }: { title: string; children: ComponentChildren; onClose: () => void }) {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 920px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 920px)');
    const update = () => setMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const close = <IconButton className="mini-dice-launcher__close" variant="ghost" size="sm" type="button" title="Закрыть панель броска" aria-label="Закрыть панель броска" onClick={onClose}><X size={14} aria-hidden="true" /></IconButton>;
  const heading = <span aria-label="Переместить панель броска" data-testid="dice-tray-drag-handle">{title}</span>;
  const content = <div className="dh-portal-scope mini-dice-launcher-layer">
    {mobile ? <Surface className="mini-dice-launcher__floating-panel mini-dice-launcher__floating-panel--mobile" role="region" aria-label="Подготовка броска" padding="sm">
      <header className="mini-dice-launcher__mobile-head"><strong>{title}</strong>{close}</header>
      <div className="mini-dice-launcher__floating-body">{children}</div>
    </Surface> : <DraggableSurface className="mini-dice-launcher__floating-panel" role="region" aria-label="Подготовка броска" title={heading} actions={close}
      defaultPosition={() => ({ x: Math.max(12, (window.innerWidth - Math.min(360, window.innerWidth - 24)) / 2), y: Math.max(12, window.innerHeight - 640) })}
      bounds={{ top: 12, right: 12, bottom: 12, left: 12 }}>
      {children}
    </DraggableSurface>}
  </div>;
  return typeof document === 'undefined' ? content : createPortal(content, document.body) as typeof content;
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
