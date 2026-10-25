import type { TraitId } from './types';

/** Context is supplied by the source of the text, never inferred from its title. */
export interface ContextualDiceSource {
  sourceId?: string | number;
  cardId?: string;
  featureId?: string | number;
  collection?: string;
  slug?: string;
  name?: string;
  /** Must be the same cleaned text used to produce macro.start/end. */
  text: string;
}

export interface ContextualDiceMacro {
  formula: string;
  start: number;
  end: number;
}

export interface ContextualDiceActor {
  proficiency: number;
  level: number;
  spellcastTrait?: TraitId | null;
  traits?: Partial<Record<TraitId, number>> | Array<{ id: TraitId; value: number }>;
}

export interface ContextualDiceQuantity {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  formulaTemplate: string;
  flatPerCount?: number;
  explanation?: string;
}

export interface ContextualDiceBranch {
  id: string;
  label: string;
  formula: string;
  quantity?: ContextualDiceQuantity;
}

export interface ContextualDiceBinding {
  formula: string;
  quantity?: ContextualDiceQuantity;
  branches?: ContextualDiceBranch[];
  selectedBranchId?: string;
  hint?: string;
  nonRoll?: boolean;
}

type RuleKind = 'fixed' | 'single' | 'proficiency' | 'spellcast' | 'proficiency-pool' | 'quantity' | 'reference' | 'tracker';
interface Rule {
  kind: RuleKind;
  guard: RegExp;
  formulas?: string[];
  label?: string;
  hint?: string;
  flatPerCount?: number;
}

// These rules describe the existing local corpus. Identity AND a matching text
// fragment are required; edited/custom text safely falls back to manual input.
const DOMAIN_RULES: Record<string, Rule> = {
  'rune-ward': { kind: 'fixed', guard: /уменьшить этот урон/ },
  'i-see-it-coming': { kind: 'fixed', guard: /увеличить ваше уклонение/ },
  'book-of-tyfar': { kind: 'fixed', guard: /языки пламени/, hint: '2d6 для поражённых целей; число целей не умножает количество костей.' },
  'vicious-entangle': { kind: 'fixed', guard: /корни и лозы/ },
  'cinder-grasp': { kind: 'fixed', guard: /подожжен|воспламеняется/ },
  'conjure-swarm': { kind: 'fixed', guard: /целям, против которых вы преуспели/ },
  'book-of-korvax': { kind: 'fixed', guard: /магического круга/ },
  'chokehold': { kind: 'fixed', guard: /уязвимой таким образом/ },
  'terrify': { kind: 'fixed', guard: /цель отмечает/ },
  'book-of-grynn': { kind: 'fixed', guard: /пройдут через стену/ },
  'book-of-exota': { kind: 'fixed', guard: /его атаки наносят/ },
  'death-grip': { kind: 'fixed', guard: /от лиан/ },
  'chain-lightning': { kind: 'fixed', guard: /провалили бросок/ },
  'rousing-strike': { kind: 'fixed', guard: /очистить рану или/ },
  'forager': { kind: 'fixed', guard: /что вы добыли/, hint: 'Результат определяет добычу по таблице; предметы добавляются вручную.' },
  'shrug-it-off': { kind: 'fixed', guard: /при результате 3 или ниже/ },
  'breaking-blow': { kind: 'fixed', guard: /следующая успешная атака/ },
  'rejuvenation-barrier': { kind: 'fixed', guard: /очищаете/ },
  'stunning-sunlight': { kind: 'fixed', guard: /цели, которые (?:успешно прошли|провалили)/, hint: 'Выберите формулу по результату реакции цели. Надежда определяет число целей, не число костей.' },
  'ground-pound': { kind: 'fixed', guard: /цели, которые провалили бросок/ },
  'earthquake': { kind: 'fixed', guard: /временно становятся/ },
  'tempest': { kind: 'fixed', guard: /метель|ураган|песчаная буря/, hint: 'Используется формула выбранной бури; варианты не складываются.' },
  'resurrection': { kind: 'fixed', guard: /при результате 5 или ниже/ },
  'unbreakable': { kind: 'fixed', guard: /очистить количество ран/ },
  'forceful-push': { kind: 'single', guard: /добавьте d6/, formulas: ['d6'], hint: 'Одна дополнительная d6; не Мастерство.' },
  'strategic-approach': { kind: 'single', guard: /добавляете d8/, formulas: ['d8'], hint: 'Одна дополнительная d8 за выбранный вариант жетона.' },
  'natural-familiar': { kind: 'single', guard: /добавляете d6/, formulas: ['d6'], hint: 'Одна дополнительная d6; не Мастерство.' },
  'boost': { kind: 'single', guard: /добавляете d10/, formulas: ['d10'], hint: 'Одна дополнительная d10; не Мастерство.' },
  'book-of-ava': { kind: 'proficiency', guard: /используя ваше мастерство/, formulas: ['d10+2', 'd6'] },
  'rain-of-blades': { kind: 'proficiency', guard: /используя ваше мастерство|дополнительно 1d8/, formulas: ['d8+2', '1d8'] },
  'blighting-strike': { kind: 'proficiency', guard: /броске с надеждой|броске со страхом/, formulas: ['d6+1', 'd10+1'], hint: 'Формула соответствует успешной ветви с Надеждой или со Страхом.' },
  'bolt-beacon': { kind: 'proficiency', guard: /используя ваше мастерство/, formulas: ['d8+2'] },
  'hideous-retribution': { kind: 'proficiency', guard: /используя ваше мастерство/, formulas: ['d6'] },
  'siphon-essence': { kind: 'proficiency', guard: /при успехе со страхом вы получаете \+1 к мастерству/, formulas: ['d12+4'] },
  'book-of-norai': { kind: 'proficiency', guard: /используя ваше мастерство/, formulas: ['d20+5'] },
  'corrosive-projectile': { kind: 'proficiency', guard: /используя ваше мастерство/, formulas: ['d6+4'] },
  'towering-stalk': { kind: 'proficiency', guard: /с использованием вашего мастерства/, formulas: ['d8'] },
  'telekinesis': { kind: 'proficiency', guard: /используя свое мастерство/, formulas: ['d12+4'] },
  'midnight-spirit': { kind: 'spellcast', guard: /равное вашей характеристике заклинателя/, formulas: ['d6'] },
  'preservation-blast': { kind: 'spellcast', guard: /используя вашу характеристику заклинателя/, formulas: ['d8+3'] },
  'summon-horror': { kind: 'spellcast', guard: /используя вашу характеристику заклинателя/, formulas: ['d8+1'] },
  'banish': { kind: 'spellcast', guard: /равное вашей характеристике заклинателя/, formulas: ['d20'], hint: 'Используйте наивысшее отдельное значение d20 как Сложность; сумма не является результатом способности.' },
  'nether-flames': { kind: 'spellcast', guard: /используя вашу характеристику заклинателя/, formulas: ['d8+6'], hint: 'Количество d8 равно Характеристике Заклинателя. Надежда определяет число целей.' },
  'troublemaker': { kind: 'proficiency-pool', guard: /равное вашему мастерству/, formulas: ['d4'], hint: 'Цель отмечает Стресс по наибольшему отдельному d4; не по сумме.' },
  'redirect': { kind: 'proficiency-pool', guard: /равное вашему мастерству/, formulas: ['d6'], hint: 'Проверьте наличие хотя бы одной 6 среди отдельных костей. Сумма не применяется.' },
  'unyielding-armor': { kind: 'proficiency-pool', guard: /равное вашему мастерству/, formulas: ['d6'], hint: 'Проверьте наличие хотя бы одной 6 среди отдельных костей. Сумма не применяется.' },
  'unleash-chaos': { kind: 'quantity', guard: /равное количеству потраченных жетонов/, formulas: ['d10'], label: 'Жетонов потрачено на эту атаку', hint: 'Введите уже выбранное/оплаченное количество для этой атаки, не остаток жетонов. Здесь ресурс не списывается.' },
  'book-of-illiat': { kind: 'quantity', guard: /равное потраченной надежде/, formulas: ['d6'], label: 'Надежды потрачено на эти магические снаряды', hint: 'Используется количество этой активации, не текущий запас Надежды. Здесь ресурс не списывается.' },
  'thorn-skin': { kind: 'quantity', guard: /потратить любое количество жетонов/, formulas: ['d6'], label: 'Жетонов потрачено для этого снижения урона', hint: 'Один пул используется для снижения и ответного урона; выбранные жетоны учитываются один раз.' },
  'sigil-of-retribution': { kind: 'quantity', guard: /поместите d8|количество d8/, formulas: ['d8'], label: 'Костей d8 накоплено на карте сейчас', hint: 'Уровень ограничивает запас, но не определяет его текущее количество. Бросок выполняется при успешной атаке.' },
  'confusing-aura': { kind: 'quantity', guard: /равное числу активных слоев/, formulas: ['d6'], label: 'Активных слоёв ауры сейчас', hint: 'Исходный + добавленные − разрушенные слои; не весь отмеченный Стресс. Проверьте хотя бы одну 5 или 6; сумма не применяется.' },
  'arcane-reflection': { kind: 'quantity', guard: /потратить любое количество надежды/, formulas: ['d6'], label: 'Надежды потрачено на это отражение', hint: 'Проверьте наличие хотя бы одной 6; сумма не применяется. Здесь Надежда не списывается.' },
  'spellcharge': { kind: 'quantity', guard: /за каждый потраченный жетон/, formulas: ['d6'], label: 'Жетонов потрачено на эту атаку', hint: 'Количество потраченных жетонов этой атаки, не оставшийся запас.' },
  'dark-army': { kind: 'quantity', guard: /за каждый потраченный жетон/, formulas: ['1d8'], label: 'Жетонов потрачено для выбранного эффекта', hint: 'Дополнительный урон или снижение урона — отдельные применения. Здесь жетоны не списываются.' },
  'night-terror': { kind: 'quantity', guard: /равное количеству украденного страха/, formulas: ['d6'], label: 'Страха реально украдено этим эффектом', hint: 'Ограничено испуганными целями и доступным Страхом мастера; не число всех целей сцены.' },
  'twilight-toll': { kind: 'quantity', guard: /за каждый потраченный жетон/, formulas: ['d12'], label: 'Жетонов потрачено на эту атаку', hint: 'Количество этой атаки против выбранной цели, не остаток/максимум жетонов. Здесь жетоны не списываются.' },
  'damnation': { kind: 'quantity', guard: /отметьте любое количество стресса/, formulas: ['d20'], label: 'Стресса отмечено для этого заклинания', hint: 'Не весь уже отмеченный Стресс персонажа. Здесь Стресс не отмечается.' },
  'invigoration': { kind: 'quantity', guard: /потратить любое количество надежды/, formulas: ['d6'], label: 'Надежды потрачено на эту попытку', hint: 'Проверьте наличие хотя бы одной 6; сумма не применяется. Здесь Надежда не списывается.' },
  'falling-sky': { kind: 'quantity', guard: /за каждый отмеченный стресс/, formulas: ['1d20+2'], label: 'Стресса отмечено для этого заклинания', flatPerCount: 2, hint: 'Каждый Стресс даёт весь пакет 1d20+2: постоянный бонус тоже умножается. Здесь Стресс не отмечается.' },
  'avatar-of-malice': { kind: 'quantity', guard: /за каждый страх у мастера/, formulas: ['1d6'], label: 'Страха у мастера на момент этого броска', hint: 'Введите актуальное доступное значение; не Мастерство и не максимум Страха.' },
  'tactician': { kind: 'reference', guard: /в качестве кости надежды/, formulas: ['d20'], hint: 'Это замена Кости Надежды в командном броске, а не отдельный бросок d20.' },
  'signature-move': { kind: 'reference', guard: /в качестве кости надежды/, formulas: ['d20'], hint: 'Это замена Кости Надежды в действии, а не отдельный бросок d20.' },
  'wild-surge': { kind: 'tracker', guard: /стороной с цифрой 1/, formulas: ['d6'], hint: 'Эта d6 — счётчик со стартовым значением 1; случайный бросок не требуется.' },
  'zone-of-protection': { kind: 'tracker', guard: /стороной с цифрой 1/, formulas: ['1d6'], hint: 'Эта d6 — счётчик со стартовым значением 1; случайный бросок не требуется.' }
};

/** Declarative coverage, not a claim that every custom/edited text can be bound. */
export const contextualDiceBindingDomainSlugs: readonly string[] = Object.freeze(Object.keys(DOMAIN_RULES));

/** Prepares a truthful pool only. It never pays resources or applies an effect. */
export function resolveContextualDiceBinding(
  source: ContextualDiceSource,
  macro: ContextualDiceMacro,
  actor: ContextualDiceActor
): ContextualDiceBinding {
  const formula = normalizeFormula(macro.formula);
  const fragment = fragmentContext(source.text, macro, formula);
  if (!fragment) return fallback(formula);
  const outside = outsideBinding(source, formula, fragment, actor);
  if (outside) return outside;
  const slug = domainSlug(source);
  const rule = slug ? DOMAIN_RULES[slug] : undefined;
  if (!rule || !rule.guard.test(fragment) || (rule.formulas && !rule.formulas.includes(formula))) return fallback(formula);
  if (rule.kind === 'reference' || rule.kind === 'tracker') return { formula, nonRoll: true, hint: rule.hint };
  if (rule.kind === 'fixed') return { formula, hint: rule.hint };
  if (rule.kind === 'single') return { formula: explicitSingle(formula), hint: rule.hint };
  if (slug === 'sigil-of-retribution') return {
    formula, nonRoll: true,
    hint: 'Это помещение d8 на карту или ограничение запаса, не бросок. При успешной атаке подготовьте внизу Nd8 по числу реально накопленных костей; уровень — только предел.'
  };
  if (rule.kind === 'quantity') return quantityBinding(formula, rule.label!, rule.hint, rule.flatPerCount);
  if (slug === 'siphon-essence') {
    const p = knownCount(actor.proficiency);
    if (p === null) return quantityBinding(formula, 'Мастерство этой успешной атаки', 'При успехе со Страхом добавьте 1 к Мастерству. Исход выбирается явно, не по последнему событию чата.');
    return {
      formula: '',
      branches: [
        { id: 'ordinary-success', label: 'Успех без Страха', formula: `${p}d12+4` },
        { id: 'success-with-fear', label: 'Успех со Страхом: +1 к Мастерству', formula: `${p + 1}d12+4` }
      ],
      hint: 'Выберите исход именно этой успешной атаки. При успехе со Страхом используется +1 к Мастерству.'
    };
  }
  // Rain of Blades includes an explicit, fixed extra die for a vulnerable target.
  if (slug === 'rain-of-blades' && formula === '1d8') return { formula, hint: 'Дополнительная 1d8 только для Уязвимой цели; не масштабируется Мастерством.' };
  if (rule.kind === 'spellcast') {
    return countedBinding(formula, spellcastCount(actor), 'Характеристика Заклинателя', rule.hint);
  }
  return countedBinding(formula, knownCount(actor.proficiency), 'Мастерство этой атаки', rule.hint);
}

function outsideBinding(source: ContextualDiceSource, formula: string, fragment: string, actor: ContextualDiceActor): ContextualDiceBinding | null {
  if (formula === 'd12' && matchesFeature(source, 'ancestry', 'ribbet', 253)
    && /используя ваше мастерство/.test(fragment)) {
    return countedBinding(formula, knownCount(actor.proficiency), 'Мастерство персонажа', 'Длинный язык использует Мастерство персонажа, не одну d12.');
  }
  if (formula === 'd12+2' && matchesFeature(source, 'beastform', 'armored-sentry', 2005, 282)
    && /мастерство бросающего/.test(fragment)) {
    return quantityBinding(formula, 'Мастерство бросающего союзника', 'Используется Мастерство союзника, который бросает или запускает вас, а не Мастерство владельца этой способности.');
  }
  if (formula === 'd6' && matchesFeature(source, 'class', 'witch', 2077)
    && /выберите одно значение из полученных/.test(fragment)) {
    return countedBinding(formula, spellcastCount(actor), 'Характеристика Заклинателя', 'Выберите одно отдельное значение по таблице. Можно выбрать не наибольшее; сумма не является результатом гадания.');
  }
  if (formula === 'd6' && matchesFeature(source, 'subclass', 'warden-of-the-elements', 161)
    && /за каждую отмеченную ячейку/.test(fragment)) {
    return quantityBinding(formula, 'Ран отмечено именно этим событием', 'Используются только Раны, отмеченные сейчас, не весь текущий счётчик Ран. За каждую отдельную 6 уменьшите количество отмеченных Ран на 1 вручную.');
  }
  if (formula === 'd6' && matchesFeature(source, 'class', 'rogue', 0)
    && /равное вашему рангу/.test(fragment)) {
    return countedBinding(formula, tierCount(actor.level), 'Ранг персонажа', 'Количество d6 равно Рангу, не Мастерству.');
  }
  return null;
}

function domainSlug(source: ContextualDiceSource): string | null {
  for (const value of [source.sourceId, source.cardId]) {
    if (typeof value !== 'string') continue;
    const canonical = value.match(/^domain-card:([a-z0-9-]+)$/);
    if (canonical) return canonical[1];
    const sheet = value.match(/^sheet-domainCard-([a-z0-9-]+)$/);
    if (sheet) return sheet[1];
  }
  return source.slug && ['domain-card', 'domain-cards', 'domainCard', 'domainCards'].includes(source.collection ?? '') ? source.slug : null;
}

function matchesFeature(source: ContextualDiceSource, collection: string, slug: string, rawFeatureId: number, parentId?: number): boolean {
  const collectionAliases: Record<string, string> = { ancestries: 'ancestry', beastforms: 'beastform', classes: 'class', subclasses: 'subclass' };
  if (source.slug === slug && (collectionAliases[source.collection ?? ''] ?? source.collection) === collection) return true;
  const featureId = String(source.featureId ?? '');
  const ids = [source.sourceId, source.cardId].filter((value): value is string | number => value !== undefined);
  const parentKnown = ids.some(value => value === `${collection}:${slug}` || (parentId !== undefined && String(value) === String(parentId)));
  if (parentKnown && (!featureId || featureId === String(rawFeatureId) || rawFeatureId === 0)) return true;
  // Generated feature IDs preserve both the parent slug and raw feature ID.
  return ids.some(value => typeof value === 'string' && value.startsWith('sheet-') && value.includes(`-${slug}-`)
    && (rawFeatureId === 0 || value.endsWith(`-${rawFeatureId}`)));
}

function fragmentContext(text: string, macro: ContextualDiceMacro, formula: string): string {
  if (!Number.isSafeInteger(macro.start) || !Number.isSafeInteger(macro.end) || macro.start < 0 || macro.end <= macro.start || macro.end > text.length) return '';
  if (normalizeFormula(cleanText(text.slice(macro.start, macro.end))) !== formula) return '';
  return cleanText(text.slice(Math.max(0, macro.start - 320), Math.min(text.length, macro.end + 360)));
}

function cleanText(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/ё/giu, 'е').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeFormula(formula: string): string {
  return formula.replace(/\s+/g, '').toLowerCase();
}

function implicitTemplate(formula: string): string {
  return formula.replace(/(^|[+-])d(4|6|8|10|12|20)(?=$|[+-])/g, '$1{count}d$2');
}

function explicitSingle(formula: string): string {
  return formula.replace(/(^|[+-])d(4|6|8|10|12|20)(?=$|[+-])/g, (_match, sign: string, sides: string) => `${sign}1d${sides}`);
}

function knownCount(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100 ? value : null;
}

function spellcastCount(actor: ContextualDiceActor): number | null {
  if (!actor.spellcastTrait || !actor.traits) return null;
  const value = Array.isArray(actor.traits) ? actor.traits.find(trait => trait.id === actor.spellcastTrait)?.value : actor.traits[actor.spellcastTrait];
  return knownCount(value);
}

function tierCount(level: number): number | null {
  if (!Number.isSafeInteger(level) || level < 1 || level > 10) return null;
  return level === 1 ? 1 : level < 5 ? 2 : level < 8 ? 3 : 4;
}

function countedBinding(formula: string, count: number | null, label: string, hint?: string): ContextualDiceBinding {
  if (count === null) return quantityBinding(formula, label, hint);
  if (count === 0) return { formula: '0', hint: [hint, `${label}: 0 — костей нет.`].filter(Boolean).join(' ') };
  return { formula: implicitTemplate(formula).replaceAll('{count}', String(count)), hint };
}

function quantityBinding(formula: string, label: string, hint?: string, flatPerCount?: number): ContextualDiceBinding {
  let template = implicitTemplate(formula);
  if (!template.includes('{count}')) template = formula.replace(/^1d/, '{count}d');
  if (flatPerCount) template = template.replace(/[+-]\d+$/, '');
  return {
    formula: '',
    quantity: { label, value: null, min: 1, max: 100, formulaTemplate: template, ...(flatPerCount ? { flatPerCount } : {}), explanation: hint },
    hint
  };
}

function fallback(formula: string): ContextualDiceBinding {
  const template = implicitTemplate(formula);
  if (template !== formula) return quantityBinding(formula, 'Количество костей: уточните по тексту', 'Контекст не распознан. Укажите количество явно; оно применяется ко всем костям без числа. Для разных количеств настройте полную формулу вручную.');
  return { formula, hint: 'Формула взята из текста. Условия и эффекты способности применяются вручную.' };
}
