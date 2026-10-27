import { DOMAIN_LABELS } from "../../../domain/rules/constants";
import type { DomainName } from "../../../domain/rules/types";
import { clamp } from '../../../core/utils/clamp';

export function domainLabel(domain: DomainName | string): string {
  return DOMAIN_LABELS[domain as DomainName] ?? domain;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

export function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

/** An effective preview must not make an unassigned starting slot look filled. */
export function builderTraitValue(base: number | undefined, effective?: number, equipmentModifier = 0): string {
  return base === undefined ? 'не выбрано' : signed(clamp((effective ?? base) + equipmentModifier, -10, 20));
}
