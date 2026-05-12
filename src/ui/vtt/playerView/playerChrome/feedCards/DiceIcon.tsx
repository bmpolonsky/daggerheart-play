/** @jsxImportSource preact */
import { useState } from 'preact/hooks';

type DiceTone = 'neutral' | 'hope' | 'fear' | 'advantage' | 'disadvantage' | 'duality';

const DICE_ICON_PATHS: Record<string, string> = {
  duality: assetPath('icon/dice/duality.svg'),
  d4: assetPath('icon/dice/d4.svg'),
  d6: assetPath('icon/dice/d6.svg'),
  d8: assetPath('icon/dice/d8.svg'),
  d10: assetPath('icon/dice/d10.svg'),
  d12: assetPath('icon/dice/d12.svg'),
  d20: assetPath('icon/dice/d20.svg')
};

function assetPath(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`.replace(/\/{2,}/g, '/');
}

const DICE_ICON_SHAPES: Record<string, { shell: string; lines: string }> = {
  d4: {
    shell: 'm50 8.55 45.61 57L50 91.46 4.39 65.55Z',
    lines: 'M50 8.55v82.9Z'
  },
  d6: {
    shell: 'M90.82 72.1 50 95.98 9.18 72.11V27.24L50 4.03l40.82 23.2Z',
    lines: 'M90.82 27.24 50 51.79m0 44.18V51.8M9.18 27.24 50 51.79'
  },
  d8: {
    shell: 'M12.39 33.17 50 5.55l37.61 27.62v35.39L50 94.45l-37.61-25.9Z',
    lines: 'M12.39 68.56H87.6L50 5.56Z'
  },
  d10: {
    shell: 'M5.35 49.8 50 3.65 94.65 49.8 50 96.35Z',
    lines: 'm50 3.65 21.72 42.9M50 3.66l-21.72 42.9m66.37 3.25-22.93-3.24M50 96.35V57.08M5.35 49.8l22.93-3.24M50 57.08l21.72-10.52M50 57.08 28.28 46.56'
  },
  d12: {
    shell: 'm50 95.72-26.07-9.19L6.07 64.27V35.24L23.93 12.5 50 4.28l26.07 8.22 17.86 22.74v29.03L76.07 86.53Z',
    lines: 'M50 4.28v24.75m43.93 6.21-23.01 8.47m5.15 42.82-13.52-18.5m-38.62 18.5 13.52-18.5M6.07 35.25l23.01 8.47M50 29.03 70.92 43.7M50 29.03 29.08 43.7m41.84 0-8.37 24.33m0 0h-25.1m0 0L29.08 43.7'
  },
  d20: {
    shell: 'M11.08 69.89v-40.2L50 3.9l38.92 25.8v40.2L50 96.12z',
    lines: 'M50 3.88v24.97m0 0 38.92.84-14.8 36.39m14.8 3.8-14.8-3.8m-48.24 0L50 96.12l24.12-30.04m-63.04 3.8 14.8-3.8M50 28.85l-38.92.84 14.8 36.39M50 28.85 25.88 66.08M50 28.85l24.12 37.23m-48.24 0h48.24'
  }
};

const DICE_TONE_PALETTE: Record<Exclude<DiceTone, 'duality'>, { fill: string; outline: string; lines: string }> = {
  neutral: { fill: '#bfbfdd', outline: '#383848', lines: '#8d8bac' },
  hope: { fill: '#ffcb5e', outline: '#864707', lines: '#ee9a0c' },
  fear: { fill: '#7654e8', outline: '#24005f', lines: '#4f27c8' },
  advantage: { fill: '#67d982', outline: '#1f6a2f', lines: '#2da34d' },
  disadvantage: { fill: '#ef6a6a', outline: '#7a1717', lines: '#b83232' }
};

export function DiceIcon({ kind, label, mark }: { kind: string; label: string; mark?: string | number }) {
  const [failed, setFailed] = useState(false);
  const dice = parseDiceKind(kind);
  const shape = DICE_ICON_SHAPES[dice.baseKind];
  const path = DICE_ICON_PATHS[dice.baseKind];
  if (!shape && (!path || failed)) {
    return <span className="feed-die-icon-wrap feed-die-icon-wrap--fallback" aria-hidden="true"><span>{mark ?? label}</span></span>;
  }
  if (shape && dice.tone !== 'duality') {
    const palette = DICE_TONE_PALETTE[dice.tone];
    return (
      <span className={`feed-die-icon-wrap feed-die-icon-wrap--${dice.tone}`} aria-hidden="true">
        <svg className="feed-die-icon" viewBox="0 0 100 100" focusable="false">
          <path fill={palette.fill} stroke={palette.outline} strokeLinejoin="round" strokeWidth="10" d={shape.shell} paintOrder="stroke fill" />
          <path fill="none" stroke={palette.lines} strokeWidth="4" d={shape.lines} style={{ mixBlendMode: 'darken' }} />
        </svg>
        {mark !== undefined && <span>{mark}</span>}
      </span>
    );
  }
  return (
    <span className={`feed-die-icon-wrap feed-die-icon-wrap--${dice.tone}`} aria-hidden="true">
      <img
        className="feed-die-icon"
        src={path}
        alt=""
        onError={() => setFailed(true)}
      />
      {mark !== undefined && <span>{mark}</span>}
    </span>
  );
}

function parseDiceKind(kind: string): { baseKind: string; tone: DiceTone } {
  if (kind === 'duality') return { baseKind: 'duality', tone: 'duality' };
  if (kind === 'hope') return { baseKind: 'd12', tone: 'hope' };
  if (kind === 'fear') return { baseKind: 'd12', tone: 'fear' };
  const match = /^(hope|fear|adv|dis)-d(4|6|8|10|12|20)$/.exec(kind);
  if (!match) return { baseKind: kind, tone: 'neutral' };
  const tone = diceToneFromPrefix(match[1]);
  return { baseKind: `d${match[2]}`, tone };
}

function diceToneFromPrefix(prefix: string): 'hope' | 'fear' | 'advantage' | 'disadvantage' {
  if (prefix === 'adv') return 'advantage';
  if (prefix === 'dis') return 'disadvantage';
  return prefix === 'fear' ? 'fear' : 'hope';
}
