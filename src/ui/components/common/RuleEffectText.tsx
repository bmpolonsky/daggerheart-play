/** @jsxImportSource preact */
import { cloneElement, isValidElement, type ComponentChildren, type VNode } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import type { FeatureRuleEffect } from '../../../domain/rules/featureEffects';
import styles from './RuleEffectText.module.css';

export interface RuleEffectTextProps {
  children: ComponentChildren;
  effects: readonly FeatureRuleEffect[];
  /** Lets a nested macro remain the sole keyboard target while sharing this annotation. */
  interactiveChild?: boolean;
}

/**
 * Marks prose recognized as a typed rule effect without turning it into an
 * action. Interactive macros may be nested inside and keep their own input
 * behavior.
 */
export function RuleEffectText({ children, effects, interactiveChild = false }: RuleEffectTextProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipId = `rule-effect-${useId()}`;
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<RuleEffectTooltipPlacement | null>(null);
  const uniqueEffects = uniqueRuleEffectMessages(effects);
  const assistedOnly = uniqueEffects.every((effect) => ruleEffectApplicationLabel(effect) === 'Распознано');

  useEffect(() => {
    if (!open) return;
    const updatePlacement = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const maxWidth = Math.max(180, Math.min(340, window.innerWidth - 24));
      setPlacement({
        left: Math.max(12 + maxWidth / 2, Math.min(window.innerWidth - 12 - maxWidth / 2, rect.left + rect.width / 2)),
        top: rect.top > 128 ? rect.top - 8 : rect.bottom + 8,
        maxWidth,
        above: rect.top > 128
      });
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
    };
  }, [open]);

  if (effects.length === 0) return <>{children}</>;
  const describedChildren = interactiveChild && isValidElement(children)
    ? cloneElement(children as VNode<Record<string, unknown>>, { 'aria-describedby': tooltipId })
    : children;

  const tooltip = (
    <span
      id={tooltipId}
      className={open && placement ? styles.tooltip : styles.srOnly}
      role="tooltip"
      style={open && placement ? {
        left: `${placement.left}px`,
        top: `${placement.top}px`,
        maxWidth: `${placement.maxWidth}px`,
        transform: placement.above ? 'translate(-50%, -100%)' : 'translateX(-50%)'
      } : undefined}
    >
      {uniqueEffects.map((effect) => (
        <span key={`${effect.automatic ? 'automatic' : 'assisted'}:${effect.summary}`}>
          <strong>{ruleEffectApplicationLabel(effect)}:</strong> {effect.summary}
        </span>
      ))}
    </span>
  );

  return (
    <>
      <span
        ref={anchorRef}
        className={`${styles.root} ${assistedOnly ? styles.assisted : ''}`}
        tabIndex={interactiveChild ? undefined : 0}
        aria-describedby={interactiveChild ? undefined : tooltipId}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => {
          if (document.activeElement !== anchorRef.current) setOpen(false);
        }}
        onPointerUp={(event) => {
          if (event.pointerType === 'mouse' || isNestedInteractiveTarget(event.target, event.currentTarget)) return;
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          setOpen(false);
        }}
      >
        {describedChildren}
      </span>
      {typeof document === 'undefined' ? tooltip : createPortal(tooltip, document.body)}
    </>
  );
}

interface RuleEffectTooltipPlacement {
  left: number;
  top: number;
  maxWidth: number;
  above: boolean;
}

export function uniqueRuleEffectMessages(effects: readonly FeatureRuleEffect[]): FeatureRuleEffect[] {
  const seen = new Set<string>();
  return effects.filter((effect) => {
    const key = `${ruleEffectApplicationLabel(effect)}:${effect.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ruleEffectTooltipText(effects: readonly FeatureRuleEffect[]): string {
  return uniqueRuleEffectMessages(effects)
    .map((effect) => `${ruleEffectApplicationLabel(effect)}: ${effect.summary}`)
    .join('. ');
}

export function ruleEffectApplicationLabel(effect: FeatureRuleEffect): 'Применено' | 'При создании' | 'При выборе карт' | 'Распознано' {
  if (!effect.automatic) return 'Распознано';
  if (effect.kind === 'inventoryGrant') return 'При создании';
  if (effect.kind === 'domainCardGrant') return 'При выборе карт';
  return 'Применено';
}

function isNestedInteractiveTarget(target: EventTarget | null, currentTarget: EventTarget | null): boolean {
  if (!(target instanceof Element) || !(currentTarget instanceof Element)) return false;
  const interactive = target.closest('button, a, input, select, textarea, [role="button"]');
  return Boolean(interactive && interactive !== currentTarget && currentTarget.contains(interactive));
}
