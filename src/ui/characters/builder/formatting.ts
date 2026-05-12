import { DOMAIN_LABELS } from "../../../domain/rules/constants";
import type { DomainName } from "../../../domain/rules/types";

export function domainLabel(domain: DomainName | string): string {
  return DOMAIN_LABELS[domain as DomainName] ?? domain;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

export function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}
