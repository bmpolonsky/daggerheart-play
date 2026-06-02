export enum ActorStatus {
  Defeated = 'defeated',
  Vulnerable = 'vulnerable',
  Hidden = 'hidden',
  Restrained = 'restrained'
}

export const CORE_STATUS_TAGS = [
  ActorStatus.Vulnerable,
  ActorStatus.Hidden,
  ActorStatus.Restrained
];

export const ACTOR_STATUS_TAGS = [
  ActorStatus.Defeated,
  ...CORE_STATUS_TAGS
];

const STATUS_LABELS: Record<string, string> = {
  [ActorStatus.Defeated]: 'Побеждён',
  [ActorStatus.Vulnerable]: 'Уязвим',
  [ActorStatus.Hidden]: 'Скрыт',
  [ActorStatus.Restrained]: 'Обездвижен'
};

export function statusLabel(tag: string): string {
  return STATUS_LABELS[normalizeStatusTag(tag)] ?? tag;
}

export function normalizeStatusTag(value: string): string {
  return value.trim().toLowerCase();
}
