const DEFAULT_REMOTE_BASE_URL = "https://daggerheart.su";
const ASSET_BASE_ENV = import.meta.env.VITE_ASSET_BASE_URL?.trim() ?? "";
const API_BASE_ENV = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const ASSET_BASE_PATH = ASSET_BASE_ENV
  ? stripTrailingSlash(ASSET_BASE_ENV)
  : stripTrailingSlash(import.meta.env.BASE_URL);
export const API_BASE_URL = API_BASE_ENV ? stripTrailingSlash(API_BASE_ENV) : "";
export const REMOTE_BASE_URL = DEFAULT_REMOTE_BASE_URL;
export const DOMAIN_STRESS_IMAGE = `${ASSET_BASE_PATH}/image/domain/stress-cost.webp`;

export const SPELLCAST_LABEL = "Заклинатель";

export const SPELLCAST_TRAIT_TRANSLATIONS: Record<string, string> = {
  agility: "Проворность",
  strength: "Сила",
  finesse: "Искусность",
  instinct: "Инстинкт",
  presence: "Влияние",
  knowledge: "Знание",
};

export const DOMAIN_CARD_TYPE_LABELS: Record<string, string> = {
  spell: "Заклинание",
  ability: "Умение",
  grimoire: "Гримуар",
};
