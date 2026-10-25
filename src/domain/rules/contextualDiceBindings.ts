import type { TraitId } from './types';
import { parseDomainCardTextMacros, type DomainCardTextMacro } from './domainCards';
import { parseDiceFormula } from './diceFormula';

/** Context is supplied by the source of the text, never inferred from its title. */
export interface ContextualDiceSource {
  sourceId?: string | number;
  cardId?: string;
  featureId?: string | number;
  collection?: string;
  slug?: string;
  name?: string;
  weaponFormula?: string;
  countdownValue?: number;
  targetMajorThreshold?: number;
  /** Must be the same cleaned text used to produce macro.start/end. */
  text: string;
}

export interface ContextualDiceMacro {
  formula: string;
  start: number;
  end: number;
  contextualBinding?: string;
}

export interface ContextualDiceActor {
  proficiency: number;
  level: number;
  spellcastTrait?: TraitId | null;
  traits?: Partial<Record<TraitId, number>> | Array<{ id: TraitId; value: number }>;
  features?: Array<{ id: string; sourceId?: string | number; featureId?: string | number; collection?: string; slug?: string; text?: string; name?: string }>;
  hp?: { marked: number; max: number };
  companion?: { stress: { marked: number; max: number }; attackFormula?: string } | null;
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

// Normalized length + FNV-1a metadata fingerprint, not an authentication primitive.
// Generated from the audited corpus: rendered full card, body-only full card,
// and individual named/unnamed feature bodies. Unknown edited text fails closed.
const DOMAIN_SOURCE_FINGERPRINTS: Record<string, readonly string[]> = {
  "rune-ward": [
    "466:284b8a1a"
  ],
  "i-see-it-coming": [
    "150:d687a9a9"
  ],
  "book-of-tyfar": [
    "582:385e5e70",
    "533:1c1a17d3",
    "228:5b7cc552",
    "241:4d7f21b6",
    "105:6967034d",
    "122:66c55059",
    "198:481aa502",
    "217:6bf0fc49"
  ],
  "vicious-entangle": [
    "320:2773fe19"
  ],
  "cinder-grasp": [
    "309:5f6af20f"
  ],
  "conjure-swarm": [
    "433:dab3e63b",
    "394:548a678a",
    "224:7b18774f",
    "252:95291dd5",
    "169:1e503522",
    "180:0047f449"
  ],
  "book-of-korvax": [
    "568:35724786",
    "533:1207c6fe",
    "158:0bc3f769",
    "169:b0207bce",
    "160:37554ae6",
    "174:d96661b9",
    "213:717dd4f9",
    "223:8c513fd3"
  ],
  "chokehold": [
    "254:3c117fe6"
  ],
  "terrify": [
    "286:0149299f"
  ],
  "book-of-grynn": [
    "804:f69e7a2c",
    "747:1d713ef7",
    "157:0da68ee2",
    "180:ccb9aec6",
    "288:50ffec7b",
    "306:2c0541cf",
    "300:bdceaf1e",
    "316:6edd984d"
  ],
  "book-of-exota": [
    "663:5cf9b085",
    "629:4f6a54b7",
    "219:23682f9f",
    "232:e59d3152",
    "409:66c6d6cf",
    "430:d63e0276"
  ],
  "death-grip": [
    "467:92378422"
  ],
  "chain-lightning": [
    "624:9b8bce88"
  ],
  "rousing-strike": [
    "170:554bd267"
  ],
  "forager": [
    "509:6173b9df"
  ],
  "shrug-it-off": [
    "195:e0e4d86c"
  ],
  "breaking-blow": [
    "146:e1c97efa"
  ],
  "rejuvenation-barrier": [
    "418:40a7808e"
  ],
  "stunning-sunlight": [
    "560:b3132b57"
  ],
  "ground-pound": [
    "338:cb1dcf79"
  ],
  "earthquake": [
    "523:6aeeedfa"
  ],
  "tempest": [
    "554:7e958854"
  ],
  "resurrection": [
    "286:9220f0ae"
  ],
  "unbreakable": [
    "198:75b1afcd"
  ],
  "forceful-push": [
    "274:b9c28479"
  ],
  "strategic-approach": [
    "532:a07d1988"
  ],
  "natural-familiar": [
    "577:fd48a122"
  ],
  "boost": [
    "289:fc0c4f2b"
  ],
  "book-of-ava": [
    "657:cb825c35",
    "614:23f1551f",
    "175:ca6556b6",
    "191:373554f1",
    "163:6c4cc562",
    "177:14686aab",
    "274:f4007fcb",
    "287:cca4c3bf"
  ],
  "rain-of-blades": [
    "321:3c0ccb42"
  ],
  "blighting-strike": [
    "365:d0ed7b26"
  ],
  "bolt-beacon": [
    "305:ff663421"
  ],
  "hideous-retribution": [
    "283:f13a91fa"
  ],
  "siphon-essence": [
    "325:c8f5b231"
  ],
  "book-of-norai": [
    "641:0ce0f645",
    "603:c5267da4",
    "226:fffba48f",
    "250:62f4dd7f",
    "376:ecd2756c",
    "390:1e8debbd"
  ],
  "corrosive-projectile": [
    "339:2632c72a"
  ],
  "towering-stalk": [
    "509:fb80805d"
  ],
  "telekinesis": [
    "482:db783d9a"
  ],
  "midnight-spirit": [
    "511:0eccacb5"
  ],
  "preservation-blast": [
    "225:f74cb2a7"
  ],
  "summon-horror": [
    "404:49aed4d4"
  ],
  "banish": [
    "514:1546e082"
  ],
  "nether-flames": [
    "336:bdba7eb9"
  ],
  "troublemaker": [
    "282:44ad18e4"
  ],
  "redirect": [
    "279:5a693d84"
  ],
  "unyielding-armor": [
    "176:82b5a7fa"
  ],
  "unleash-chaos": [
    "566:4a4ee422"
  ],
  "book-of-illiat": [
    "683:0b989a80",
    "651:40eb730d",
    "199:84e7bf09",
    "206:d4887c28",
    "276:e0190ce5",
    "290:3ff97b62",
    "174:747b5e49",
    "185:17fc25e4"
  ],
  "thorn-skin": [
    "487:99cefe21"
  ],
  "sigil-of-retribution": [
    "490:dd5c4d6f"
  ],
  "confusing-aura": [
    "561:20493d2e"
  ],
  "arcane-reflection": [
    "218:9ded9ab6"
  ],
  "spellcharge": [
    "355:44cb1a16"
  ],
  "dark-army": [
    "658:f6563d9f"
  ],
  "night-terror": [
    "519:2e94d68a"
  ],
  "twilight-toll": [
    "477:d5171ce3"
  ],
  "damnation": [
    "322:737738eb"
  ],
  "invigoration": [
    "335:686a3751"
  ],
  "falling-sky": [
    "250:dc36c116"
  ],
  "avatar-of-malice": [
    "407:ae32be2b"
  ],
  "tactician": [
    "238:3b0e19e0"
  ],
  "signature-move": [
    "211:b4ae07f0"
  ],
  "wild-surge": [
    "575:ebd20c4b"
  ],
  "zone-of-protection": [
    "494:2b84c5d4"
  ]
};

interface SupplementalRule {
  key: string;
  collection: string;
  slug: string;
  featureId?: number;
  parentId?: number;
  behavior: string;
  fingerprints: readonly string[];
}

// Existing source metadata only: no catalog content or user data is added.
const SUPPLEMENTAL_RULES: readonly SupplementalRule[] = [
  {
    "key": "equipment:vial-of-darksmoke",
    "collection": "equipment",
    "slug": "vial-of-darksmoke",
    "parentId": 6947,
    "behavior": "agilityPool",
    "fingerprints": [
      "170:115c8e78"
    ]
  },
  {
    "key": "adversary:volcanic-dragon-molten-scourge:1369",
    "collection": "adversary",
    "slug": "volcanic-dragon-molten-scourge",
    "featureId": 1369,
    "parentId": 2275,
    "behavior": "markedHpPool",
    "fingerprints": [
      "146:3780430e",
      "177:a3e4ec5b",
      "1866:d1ad20e6",
      "1652:4236851a",
      "1887:21c60a37"
    ]
  },
  {
    "key": "adversary:stag-knight:1465",
    "collection": "adversary",
    "slug": "stag-knight",
    "featureId": 1465,
    "parentId": 2298,
    "behavior": "targetMajor",
    "fingerprints": [
      "191:2dd8e72a",
      "215:81032ed8",
      "514:701d33b0",
      "440:5013b9dd",
      "523:30f5d541"
    ]
  },
  {
    "key": "class:seraph:135",
    "collection": "class",
    "slug": "seraph",
    "featureId": 135,
    "behavior": "prayer",
    "fingerprints": [
      "532:ff207659",
      "547:a721c102",
      "645:781ed059",
      "611:d787da7c",
      "651:61f9d7af"
    ]
  },
  {
    "key": "subclass:divine-wielder:189",
    "collection": "subclass",
    "slug": "divine-wielder",
    "featureId": 189,
    "behavior": "prayerUpgrade",
    "fingerprints": [
      "229:67954641",
      "239:928f9cca",
      "904:f1298bbb",
      "840:f9f2715c",
      "916:1fbf9919"
    ]
  },
  {
    "key": "class:playtest-assassin:2061",
    "collection": "class",
    "slug": "playtest-assassin",
    "featureId": 2061,
    "behavior": "assassin",
    "fingerprints": [
      "450:76fce3de",
      "464:cbfcce2d",
      "768:0a5b6101",
      "715:dbe0a703",
      "777:3618177e"
    ]
  },
  {
    "key": "subclass:executioners-guild:2068",
    "collection": "subclass",
    "slug": "executioners-guild",
    "featureId": 2068,
    "behavior": "assassinUpgrade",
    "fingerprints": [
      "60:1728c2c3",
      "77:39d2615d",
      "641:84f79e6f",
      "550:1499eb6d",
      "659:f3633961"
    ]
  },
  {
    "key": "subclass:executioners-guild:2067",
    "collection": "subclass",
    "slug": "executioners-guild",
    "featureId": 2067,
    "behavior": "assassinUpgrade",
    "fingerprints": [
      "60:94b53403",
      "74:e42833c8",
      "641:84f79e6f",
      "550:1499eb6d",
      "659:f3633961"
    ]
  },
  {
    "key": "class:bard:123",
    "collection": "class",
    "slug": "bard",
    "featureId": 123,
    "behavior": "rally",
    "fingerprints": [
      "435:d659c8df",
      "446:ac3e399a",
      "578:4cb1d111",
      "551:2ddcdd90",
      "584:c675d9c7"
    ]
  },
  {
    "key": "subclass:wordsmith:153",
    "collection": "subclass",
    "slug": "wordsmith",
    "featureId": 153,
    "behavior": "rallyUpgrade",
    "fingerprints": [
      "244:20e44054",
      "262:50158054",
      "972:fff496f4",
      "906:62499bed",
      "984:081d774a"
    ]
  },
  {
    "key": "class:playtest-warlock:1972",
    "collection": "class",
    "slug": "playtest-warlock",
    "featureId": 1972,
    "behavior": "patronSingle",
    "fingerprints": [
      "557:b3a81940",
      "578:0e166de6",
      "1033:8ce741cb",
      "986:d8fffac7",
      "1042:3379520c"
    ]
  },
  {
    "key": "subclass:playtest-pact-of-the-wraithful:1978",
    "collection": "subclass",
    "slug": "playtest-pact-of-the-wraithful",
    "featureId": 1978,
    "behavior": "patronTier",
    "fingerprints": [
      "282:85537253",
      "302:40030253",
      "1472:fd44a56a",
      "1353:97f15a58",
      "1490:0cd5f0dc"
    ]
  },
  {
    "key": "subclass:playtest-pact-of-the-wraithful:2123",
    "collection": "subclass",
    "slug": "playtest-pact-of-the-wraithful",
    "featureId": 2123,
    "behavior": "patronWounds",
    "fingerprints": [
      "217:45f763b2",
      "236:307c97c3",
      "1472:fd44a56a",
      "1353:97f15a58",
      "1490:0cd5f0dc"
    ]
  },
  {
    "key": "subclass:playtest-pact-of-the-wraithful:2109",
    "collection": "subclass",
    "slug": "playtest-pact-of-the-wraithful",
    "featureId": 2109,
    "behavior": "patronGrace",
    "fingerprints": [
      "284:420ccea2",
      "301:f21c91b6",
      "1472:fd44a56a",
      "1353:97f15a58",
      "1490:0cd5f0dc"
    ]
  },
  {
    "key": "subclass:playtest-pact-of-the-endless:1974",
    "collection": "subclass",
    "slug": "playtest-pact-of-the-endless",
    "featureId": 1974,
    "behavior": "patronGrace",
    "fingerprints": [
      "170:7d6fe3ef",
      "188:c8098248",
      "1352:83f3b51c",
      "1242:a5b83c33",
      "1370:89d5a996"
    ]
  },
  {
    "key": "class:playtest-fighter:1969",
    "collection": "class",
    "slug": "playtest-fighter",
    "featureId": 1969,
    "behavior": "fighterWeapon",
    "fingerprints": [
      "364:f6f7e53c",
      "381:74b17b61",
      "1120:6c7317a4",
      "1076:4c8633f9",
      "1129:51945d7b"
    ]
  },
  {
    "key": "class:playtest-fighter:1970",
    "collection": "class",
    "slug": "playtest-fighter",
    "featureId": 1970,
    "behavior": "combo",
    "fingerprints": [
      "611:b1a6471c",
      "624:97aad1f5",
      "1120:6c7317a4",
      "1076:4c8633f9",
      "1129:51945d7b"
    ]
  },
  {
    "key": "subclass:beastbound",
    "collection": "subclass",
    "slug": "beastbound",
    "behavior": "companion",
    "fingerprints": [
      "4381:e592700f",
      "290:87127543",
      "69:df10838e",
      "111:74021246",
      "73:e5798772",
      "297:736d6d1b",
      "936:ae284d66",
      "844:31ba7606",
      "951:dd4d9985",
      "5333:a1e8153d"
    ]
  },
  {
    "key": "ancestry:drakona:223",
    "collection": "ancestry",
    "slug": "drakona",
    "featureId": 223,
    "behavior": "mastery",
    "fingerprints": [
      "271:b133d0b7",
      "294:62fa4623",
      "440:76b9f00c",
      "410:1500a308",
      "1050:1b58bd4a",
      "446:65825cfc",
      "1497:e6ac3dc3"
    ]
  },
  {
    "key": "ancestry:firbolg:232",
    "collection": "ancestry",
    "slug": "firbolg",
    "featureId": 232,
    "behavior": "fixed",
    "fingerprints": [
      "222:a4b31989",
      "229:5579017c",
      "328:9edc4503",
      "305:fb9c59f1",
      "1272:b75ab3b4",
      "334:9c01f283",
      "1607:68d44e22"
    ]
  },
  {
    "key": "ancestry:firbolg:233",
    "collection": "ancestry",
    "slug": "firbolg",
    "featureId": 233,
    "behavior": "fixed",
    "fingerprints": [
      "82:943836a3",
      "98:de90f7fe",
      "328:9edc4503",
      "305:fb9c59f1",
      "1272:b75ab3b4",
      "334:9c01f283",
      "1607:68d44e22"
    ]
  },
  {
    "key": "subclass:winged-sentinel:194",
    "collection": "subclass",
    "slug": "winged-sentinel",
    "featureId": 194,
    "behavior": "fixed",
    "fingerprints": [
      "101:4fa64fdd",
      "113:e1e27ed1",
      "712:ea7fa8ed",
      "658:e1886ee3",
      "724:7bba6633"
    ]
  },
  {
    "key": "subclass:winged-sentinel:191",
    "collection": "subclass",
    "slug": "winged-sentinel",
    "featureId": 191,
    "behavior": "fixed",
    "fingerprints": [
      "243:5180c904",
      "257:dfba4f59",
      "712:ea7fa8ed",
      "658:e1886ee3",
      "724:7bba6633"
    ]
  },
  {
    "key": "beastform:mighty-strider:2007",
    "collection": "beastform",
    "slug": "mighty-strider",
    "featureId": 2007,
    "parentId": 280,
    "behavior": "mastery",
    "fingerprints": [
      "288:fc586aea",
      "299:75de37e6",
      "369:2f6577ab",
      "346:b7c27044",
      "375:dd169c51",
      "527:33a9223f"
    ]
  },
  {
    "key": "beastform:massive-behemoth:2032",
    "collection": "beastform",
    "slug": "massive-behemoth",
    "featureId": 2032,
    "parentId": 270,
    "behavior": "mastery",
    "fingerprints": [
      "264:9ab32155",
      "270:f3d05a2c",
      "402:7999bda8",
      "370:3f0c4938",
      "411:b704b7f1",
      "576:fcf722fb"
    ]
  },
  {
    "key": "environment:cliffside-ascent:1870",
    "collection": "environment",
    "slug": "cliffside-ascent",
    "featureId": 1870,
    "parentId": 248,
    "behavior": "countdownBranch",
    "fingerprints": [
      "417:5a4cfd6f",
      "437:e8924a24",
      "1429:f3e4aba9",
      "1354:bc1bc324",
      "1438:110d7fee"
    ]
  },
  {
    "key": "equipment:mythic-dust",
    "collection": "equipment",
    "slug": "mythic-dust",
    "parentId": 6928,
    "behavior": "fixed",
    "fingerprints": [
      "130:2f7773b6"
    ]
  },
  {
    "key": "equipment:redthorn-saliva",
    "collection": "equipment",
    "slug": "redthorn-saliva",
    "parentId": 6930,
    "behavior": "fixed",
    "fingerprints": [
      "132:2ed40460"
    ]
  },
  {
    "key": "equipment:dragonbloom-tea",
    "collection": "equipment",
    "slug": "dragonbloom-tea",
    "parentId": 6915,
    "behavior": "uncertainMastery",
    "fingerprints": [
      "252:b494d31e"
    ]
  },
  {
    "key": "equipment:hammer-of-wrath",
    "collection": "equipment",
    "slug": "hammer-of-wrath",
    "parentId": 7196,
    "behavior": "weaponReplacement",
    "fingerprints": [
      "177:1b0b5e98",
      "112:c52187ff",
      "126:bcb5debd",
      "129:9255f636",
      "307:979e2f0d"
    ]
  },
  {
    "key": "equipment:greatstaff",
    "collection": "equipment",
    "slug": "greatstaff",
    "parentId": 7156,
    "behavior": "weaponExtra",
    "fingerprints": [
      "173:ec27ecb0",
      "99:b4f514dd",
      "107:5201e744",
      "110:a3be57a7",
      "284:da7aa0b2"
    ]
  },
  {
    "key": "equipment:greatsword",
    "collection": "equipment",
    "slug": "greatsword",
    "parentId": 7247,
    "behavior": "weaponExtra",
    "fingerprints": [
      "186:2a87a9fd",
      "115:32a9ab54",
      "126:a7c1aaa2",
      "129:841005e9",
      "316:99ba35ff"
    ]
  },
  {
    "key": "equipment:elder-bow",
    "collection": "equipment",
    "slug": "elder-bow",
    "parentId": 7140,
    "behavior": "weaponExtra",
    "fingerprints": [
      "169:51026db3",
      "99:b4f514dd",
      "107:5201e744",
      "110:a3be57a7",
      "280:dbf01eab"
    ]
  },
  {
    "key": "equipment:yutari-bloodbow",
    "collection": "equipment",
    "slug": "yutari-bloodbow",
    "parentId": 7141,
    "behavior": "weaponSequence",
    "fingerprints": [
      "161:441c4704",
      "95:69780a36",
      "105:38ccfd91",
      "108:504f0e72",
      "270:2d10b1ef"
    ]
  },
  {
    "key": "equipment:improved-greatstaff",
    "collection": "equipment",
    "slug": "improved-greatstaff",
    "parentId": 7146,
    "behavior": "weaponExtra",
    "fingerprints": [
      "175:d36d4dea",
      "99:b4f514dd",
      "107:5201e744",
      "110:a3be57a7",
      "286:21577eb8"
    ]
  },
  {
    "key": "equipment:greatbow",
    "collection": "equipment",
    "slug": "greatbow",
    "parentId": 7215,
    "behavior": "weaponExtra",
    "fingerprints": [
      "169:f5a24738",
      "99:b4f514dd",
      "107:5201e744",
      "110:a3be57a7",
      "280:b72beb7a"
    ]
  },
  {
    "key": "equipment:knuckle-blades",
    "collection": "equipment",
    "slug": "knuckle-blades",
    "parentId": 7221,
    "behavior": "weaponSequence",
    "fingerprints": [
      "165:a8dd8826",
      "95:69780a36",
      "105:38ccfd91",
      "108:504f0e72",
      "274:70d79ce5"
    ]
  },
  {
    "key": "equipment:gilded-falchion",
    "collection": "equipment",
    "slug": "gilded-falchion",
    "parentId": 7222,
    "behavior": "weaponExtra",
    "fingerprints": [
      "172:a4533a86",
      "99:b4f514dd",
      "107:5201e744",
      "110:a3be57a7",
      "283:d558d0ac"
    ]
  },
  {
    "key": "equipment:improved-greatsword",
    "collection": "equipment",
    "slug": "improved-greatsword",
    "parentId": 7234,
    "behavior": "weaponExtra",
    "fingerprints": [
      "186:4ac5745e",
      "115:32a9ab54",
      "126:a7c1aaa2",
      "129:841005e9",
      "316:a758fb78"
    ]
  },
  {
    "key": "equipment:mage-orb",
    "collection": "equipment",
    "slug": "mage-orb",
    "parentId": 7120,
    "behavior": "weaponExtra",
    "fingerprints": [
      "170:c053f906",
      "99:b4f514dd",
      "107:5201e744",
      "110:a3be57a7",
      "281:d42ee02c"
    ]
  },
  {
    "key": "equipment:advanced-greatstaff",
    "collection": "equipment",
    "slug": "advanced-greatstaff",
    "parentId": 7128,
    "behavior": "weaponExtra",
    "fingerprints": [
      "175:7ec44e15",
      "99:b4f514dd",
      "107:5201e744",
      "110:a3be57a7",
      "286:75552641"
    ]
  },
  {
    "key": "equipment:double-flail",
    "collection": "equipment",
    "slug": "double-flail",
    "parentId": 7192,
    "behavior": "weaponExtra",
    "fingerprints": [
      "176:2d890eac",
      "99:b4f514dd",
      "107:5201e744",
      "110:a3be57a7",
      "287:6f8fa1c6"
    ]
  },
  {
    "key": "equipment:talon-blades",
    "collection": "equipment",
    "slug": "talon-blades",
    "parentId": 7191,
    "behavior": "weaponSequence",
    "fingerprints": [
      "164:fad9990d",
      "95:69780a36",
      "105:38ccfd91",
      "108:504f0e72",
      "273:f9d62614"
    ]
  },
  {
    "key": "equipment:advanced-greatsword",
    "collection": "equipment",
    "slug": "advanced-greatsword",
    "parentId": 7210,
    "behavior": "weaponExtra",
    "fingerprints": [
      "186:74ea665f",
      "115:32a9ab54",
      "126:a7c1aaa2",
      "129:841005e9",
      "316:379c3951"
    ]
  },
  {
    "key": "equipment:legendary-greatstaff",
    "collection": "equipment",
    "slug": "legendary-greatstaff",
    "parentId": 7109,
    "behavior": "weaponExtra",
    "fingerprints": [
      "175:5b267a88",
      "99:b4f514dd",
      "107:5201e744",
      "110:a3be57a7",
      "286:e72485ca"
    ]
  },
  {
    "key": "equipment:floating-bladeshards",
    "collection": "equipment",
    "slug": "floating-bladeshards",
    "parentId": 7106,
    "behavior": "weaponExtra",
    "fingerprints": [
      "171:309e14b5",
      "99:b4f514dd",
      "107:5201e744",
      "110:a3be57a7",
      "282:aebd79a1"
    ]
  },
  {
    "key": "equipment:legendary-greatsword",
    "collection": "equipment",
    "slug": "legendary-greatsword",
    "parentId": 7185,
    "behavior": "weaponExtra",
    "fingerprints": [
      "187:f340e517",
      "115:32a9ab54",
      "126:a7c1aaa2",
      "129:841005e9",
      "317:e956b8d9"
    ]
  },
  {
    "key": "equipment:bloodstone",
    "collection": "equipment",
    "slug": "bloodstone",
    "parentId": 6996,
    "behavior": "weaponSequence",
    "fingerprints": [
      "226:0794eff6"
    ]
  },
  {
    "key": "equipment:greatstone",
    "collection": "equipment",
    "slug": "greatstone",
    "parentId": 6995,
    "behavior": "weaponExtra",
    "fingerprints": [
      "222:99ce654f"
    ]
  }
];

/** Declarative coverage, not a claim that every custom/edited text can be bound. */
export const contextualDiceBindingDomainSlugs: readonly string[] = Object.freeze(Object.keys(DOMAIN_RULES));

/** Prepares a truthful pool only. It never pays resources or applies an effect. */
export function resolveContextualDiceBinding(
  source: ContextualDiceSource,
  macro: ContextualDiceMacro,
  actor: ContextualDiceActor
): ContextualDiceBinding {
  if (macro.contextualBinding) return resolveNamedBinding(source, macro, actor);
  const formula = normalizeFormula(macro.formula);
  const fragment = fragmentContext(source.text, macro, formula);
  if (!fragment) return fallback(formula);
  const supplemental = supplementalNotationBinding(source, macro, actor, formula);
  if (supplemental) return supplemental;
  const outside = outsideBinding(source, formula, fragment, actor, cleanText(source.text.slice(macro.end, macro.end + 180)));
  if (outside) return outside;
  const slug = domainSlug(source);
  const rule = slug ? DOMAIN_RULES[slug] : undefined;
  if (!rule || !matchesCanonicalDomainText(slug!, source.text) || !rule.guard.test(fragment) || (rule.formulas && !rule.formulas.includes(formula))) return fallback(formula, fragment);
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

function outsideBinding(source: ContextualDiceSource, formula: string, fragment: string, actor: ContextualDiceActor, followingText: string): ContextualDiceBinding | null {
  if (formula === 'd12' && matchesFeature(source, 'ancestry', 'ribbet', 253)
    && /используя ваше мастерство/.test(fragment)
    && /^физического урона, используя ваше мастерство(?:[.,;!?]|$)/.test(followingText)) {
    return countedBinding(formula, knownCount(actor.proficiency), 'Мастерство персонажа', 'Длинный язык использует Мастерство персонажа, не одну d12.');
  }
  if (formula === 'd12+2' && matchesFeature(source, 'beastform', 'armored-sentry', 2005, 282)
    && /мастерство бросающего/.test(fragment)) {
    return quantityBinding(formula, 'Мастерство бросающего союзника', 'Используется Мастерство союзника, который бросает или запускает вас, а не Мастерство владельца этой способности.');
  }
  if (formula === 'd6' && matchesFeature(source, 'class', 'witch', 2077)
    && /выберите одно значение из полученных/.test(fragment)
    && /^,?\s*равное вашей характеристике заклинателя(?:[.,;!?]|$)/.test(followingText)) {
    return countedBinding(formula, spellcastCount(actor), 'Характеристика Заклинателя', 'Выберите одно отдельное значение по таблице. Можно выбрать не наибольшее; сумма не является результатом гадания.');
  }
  if (formula === 'd6' && matchesFeature(source, 'subclass', 'warden-of-the-elements', 161)
    && /за каждую отмеченную ячейку/.test(fragment)) {
    return quantityBinding(formula, 'Ран отмечено именно этим событием', 'Используются только Раны, отмеченные сейчас, не весь текущий счётчик Ран. За каждую отдельную 6 уменьшите количество отмеченных Ран на 1 вручную.');
  }
  if (formula === 'd6' && matchesFeature(source, 'class', 'rogue', 0)
    && /равное вашему рангу/.test(fragment)
    && /^равное вашему рангу(?:\s|[.,;!?]|$)/.test(followingText)) {
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
  const collectionAliases: Record<string, string> = { ancestries: 'ancestry', beastforms: 'beastform', classes: 'class', subclasses: 'subclass', adversaries: 'adversary', environments: 'environment' };
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

function sourceFingerprint(text: string): string {
  const normalized = cleanText(text);
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index++) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${normalized.length}:${hash.toString(16).padStart(8, '0')}`;
}

function matchesCanonicalDomainText(slug: string, text: string): boolean {
  return DOMAIN_SOURCE_FINGERPRINTS[slug]?.includes(sourceFingerprint(text)) ?? false;
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

function fallback(formula: string, fragment?: string): ContextualDiceBinding {
  const template = implicitTemplate(formula);
  // A bare die always needs its own explicit count. A different nearby clause
  // must not replace that input or lend this die its trait/proficiency count.
  if (template !== formula) return quantityBinding(formula, 'Количество костей: уточните по тексту', 'Контекст не распознан. Укажите количество явно; оно применяется ко всем костям без числа. Для разных количеств настройте полную формулу вручную.');
  if (fragment && /за кажд|равное количеству|равное числу|столько же|бросьте количество|бросьте число/.test(fragment)) return { formula: '', hint: 'Количество зависит от контекста этого применения. Укажите полную формулу вручную; число из отдельного упоминания не является готовым количеством.' };
  return { formula, hint: 'Формула взята из текста. Условия и эффекты способности применяются вручную.' };
}

/** Carries durable source identifiers through view models without using names. */
export function contextualFeatureOrigin(feature: { id: string; sourceId?: string | number; kind?: string }): Pick<ContextualDiceSource, 'sourceId' | 'featureId' | 'collection' | 'slug'> {
  const id = feature.id;
  const generated = id.match(/^sheet-class-(.+)-(\d+)$/)
    ?? id.match(/^sheet-ancestryFeature-(.+)-(\d+)$/)
    ?? id.match(/^sheet-communityFeature-(.+)-(\d+)$/)
    ?? id.match(/^sheet-subclass-(.+)-(?:foundation|specialization|mastery)-(\d+)$/);
  const collection = id.startsWith('sheet-class-') || feature.kind === 'classFeature' ? 'class'
    : id.startsWith('sheet-ancestry') || feature.kind?.startsWith('ancestry') ? 'ancestry'
      : id.startsWith('sheet-subclass') || feature.kind?.startsWith('subclass') ? 'subclass'
        : feature.kind === 'weapon' || feature.kind === 'item' ? 'equipment' : undefined;
  const canonical = typeof feature.sourceId === 'string' ? feature.sourceId.match(/^(class|subclass|ancestry|community|beastform|equipment|environment):(.+)$/) : null;
  return { sourceId: feature.sourceId, ...(generated ? { slug: generated[1], featureId: Number(generated[2]) } : {}),
    ...(collection ? { collection } : {}), ...(canonical ? { collection: canonical[1], slug: canonical[2] } : {}) };
}

/** Notation remains generic; named dice are linked only inside a known source. */
export function parseContextualDiceMacros(source: ContextualDiceSource, actor: ContextualDiceActor = { proficiency: 1, level: 1 }): DomainCardTextMacro[] {
  const macros = parseDomainCardTextMacros(source.text);
  if (domainSlug(source) === 'sigil-of-retribution' && matchesCanonicalDomainText('sigil-of-retribution', source.text)) {
    for (const match of source.text.matchAll(/бросьте\s+(кости\s+с\s+этой\s+карты)/giu)) {
      const start = match.index! + match[0].indexOf(match[1]);
      macros.push({ id: `context:sigil-accumulated:${start}`, kind: 'diceRoll', start, end: start + match[1].length, label: match[1], formula: '', scalesWithProficiency: false, contextualBinding: 'domain-card:sigil-of-retribution:accumulated' });
    }
  }
  for (const rule of matchingSupplementalRules(source)) {
    const pattern = namedPattern(rule.behavior);
    if (!pattern) continue;
    for (const match of source.text.matchAll(pattern)) {
      const label = match[1];
      const start = match.index! + match[0].indexOf(label);
      const end = start + label.length;
      if (macros.some(macro => macro.start < end && macro.end > start)) continue;
      macros.push({ id: `context:${rule.key}:${start}`, kind: 'diceRoll', start, end, label, formula: '', scalesWithProficiency: false, contextualBinding: rule.key });
    }
  }
  return macros.map((macro) => {
    if (macro.kind !== 'diceRoll' && macro.kind !== 'damageRoll') return macro;
    return resolveContextualDiceBinding(source, macro, actor).nonRoll ? { ...macro, kind: 'reference' as const } : macro;
  }).sort((a, b) => a.start - b.start);
}

function matchingSupplementalRules(source: ContextualDiceSource): readonly SupplementalRule[] {
  const fingerprint = sourceFingerprint(source.text);
  return SUPPLEMENTAL_RULES.filter(rule => matchesFeature(source, rule.collection, rule.slug, rule.featureId ?? 0, rule.parentId) && rule.fingerprints.includes(fingerprint));
}

function namedPattern(behavior: string): RegExp | null {
  switch (behavior) {
    case 'rally': return /свою\s+(Кость\s+Сплочения)\s+и\s+бросить/giu;
    case 'patronSingle': return /бросить\s+(кость\s+Покровителя)/giu;
    case 'patronTier': return /бросьте\s+(кости\s+Покровителя)/giu;
    case 'patronWounds': return /бросить\s+(кости\s+Покровителя)/giu;
    case 'patronGrace': return /бросить\s+столько\s+же\s+(костей\s+Покровителя)/giu;
    case 'prayerUpgrade': return /бросаете\s+свои\s+(Кости\s+Молитвы)/giu;
    case 'combo': return /бросьте\s+(Кость\s+Комбо)/giu;
    case 'weaponExtra': case 'weaponSequence': return /бросьте\s+(дополнительную\s+кость\s+урона)/giu;
    default: return null;
  }
}

function namedSpanIsValid(source: ContextualDiceSource, macro: ContextualDiceMacro, rule: SupplementalRule): boolean {
  const pattern = namedPattern(rule.behavior);
  if (!pattern) return false;
  return [...source.text.matchAll(pattern)].some(match => {
    const start = match.index! + match[0].indexOf(match[1]);
    return start === macro.start && start + match[1].length === macro.end;
  });
}

function resolveNamedBinding(source: ContextualDiceSource, macro: ContextualDiceMacro, actor: ContextualDiceActor): ContextualDiceBinding {
  if (macro.contextualBinding === 'domain-card:sigil-of-retribution:accumulated') {
    const valid = domainSlug(source) === 'sigil-of-retribution' && matchesCanonicalDomainText('sigil-of-retribution', source.text)
      && [...source.text.matchAll(/бросьте\s+(кости\s+с\s+этой\s+карты)/giu)].some(match => {
        const start = match.index! + match[0].indexOf(match[1]);
        return start === macro.start && start + match[1].length === macro.end;
      });
    if (!valid) return { formula: '', hint: 'Источник накопленных костей не подтверждён. Укажите полную формулу вручную.' };
    const result = quantityBinding('d8', 'Костей d8 реально накоплено на карте сейчас', 'Бросок при успешной атаке. Введите фактический накопленный запас, а не уровень: уровень только ограничивает его. Здесь кости не удаляются и эффекты не применяются.');
    if (result.quantity && Number.isSafeInteger(actor.level) && actor.level >= 1 && actor.level <= 10) result.quantity.max = actor.level;
    return result;
  }
  const rule = matchingSupplementalRules(source).find(item => item.key === macro.contextualBinding);
  if (!rule || !namedSpanIsValid(source, macro, rule)) return { formula: '', hint: 'Источник именованной кости не подтверждён. Укажите полную формулу вручную.' };
  const patronSides = actor.level >= 5 ? 8 : 6;
  switch (rule.behavior) {
    case 'rally': return { formula: `1d${hasRelatedFeature(actor, 'subclass:wordsmith:153') ? 10 : actor.level >= 5 ? 8 : 6}`, hint: 'Текущая Кость Сплочения; расход и применение результата отмечаются вручную.' };
    case 'prayerUpgrade': return countedBinding('d4', addKnownCount(spellcastCount(actor), 1), 'Характеристика Заклинателя + 1', 'Бросьте дополнительную Кость Молитвы и отбросьте наименьшее отдельное значение вручную. Здесь кости и ресурсы не тратятся.');
    case 'patronSingle': return { formula: `1d${patronSides}`, hint: 'Одна текущая Кость Покровителя. Выбранная Милость отмечается отдельно; здесь расход не повторяется.' };
    case 'patronTier': return countedBinding(`d${patronSides}`, tierCount(actor.level), 'Ранг персонажа', 'Количество Костей Покровителя равно Рангу. Это добавка к урону; расход Милости отмечается отдельно.');
    case 'patronWounds': return quantityBinding(`d${patronSides}`, 'Ран получено именно от этой атаки', 'Не весь счётчик Ран. За каждую отдельную кость 4+ противник отмечает Рану вручную. Здесь Милость не тратится.');
    case 'patronGrace': return quantityBinding(`d${patronSides}`, 'Милости выбрано и потрачено для этого применения', rule.slug === 'playtest-pact-of-the-endless' ? 'За каждую отдельную кость 4+ очистите Рану вручную. Здесь Милость не списывается.' : 'По наибольшему отдельному результату выберите число целей вручную. Сумма не является этим числом; здесь Милость не списывается.');
    case 'combo': return dieChoice('Кость Комбо этого персонажа', 'Один шаг последовательности. Продолжайте вручную, пока новый результат не станет меньше предыдущего; здесь Стресс не отмечается.');
    case 'weaponExtra': return extraWeaponDie(source, false);
    case 'weaponSequence': return extraWeaponDie(source, true);
    default: return { formula: '', hint: 'Уточните формулу этой именованной кости вручную.' };
  }
}

function supplementalNotationBinding(source: ContextualDiceSource, macro: ContextualDiceMacro, actor: ContextualDiceActor, formula: string): ContextualDiceBinding | null {
  for (const rule of matchingSupplementalRules(source)) {
    const tail = cleanText(source.text.slice(macro.end, macro.end + 180));
    switch (rule.behavior) {
      case 'agilityPool': return countedBinding(formula, traitCount(actor, 'agility'), 'Проворность персонажа', 'Добавьте наивысший отдельный результат к Уклонению вручную; сумма не является бонусом. Здесь расходник не используется.');
      case 'markedHpPool': return countedBinding(formula, knownCount(actor.hp?.marked), 'Отмеченных Ран этого противника сейчас', 'Для каждой отдельной 4+ получите Страх вручную. Используется текущий счётчик Ран этого противника, не Раны персонажа игрока.');
      case 'targetMajor': {
        const major = source.targetMajorThreshold;
        if (typeof major === 'number' && Number.isSafeInteger(major) && major >= 0 && major <= 1000) return { formula: `3d4+${major}`, hint: 'Добавлен Ощутимый порог явно выбранной цели; не порог самого атакующего.' };
        return { formula: '', quantity: { label: 'Ощутимый порог выбранной цели', value: null, min: 0, max: 1000, formulaTemplate: '3d4+{count}', explanation: 'Это порог цели, не атакующего; цель выбирается явно.' }, hint: 'Введите Ощутимый порог именно выбранной цели. Без него 3d4 — неполная формула.' };
      }
      case 'prayer': if (formula === 'd4') {
        const upgrade = hasRelatedFeature(actor, 'subclass:divine-wielder:189');
        return countedBinding(formula, addKnownCount(spellcastCount(actor), upgrade ? 1 : 0), upgrade ? 'Характеристика Заклинателя + 1' : 'Характеристика Заклинателя', upgrade ? 'Набожный: отбросьте наименьшую отдельную Кость Молитвы вручную; сумма не является запасом отдельных костей.' : 'Это отдельные Кости Молитвы; сохраняйте и расходуйте их значения вручную, не сумму.');
      } break;
      case 'assassin': if (formula === 'd4') {
        const sides = hasRelatedFeature(actor, 'subclass:executioners-guild:2067') ? 8 : hasRelatedFeature(actor, 'subclass:executioners-guild:2068') ? 6 : 4;
        return countedBinding(`d${sides}`, tierCount(actor.level), 'Ранг персонажа', 'Количество костей Метки Смерти равно Рангу; текущая кость учитывает выбранные свойства подкласса.');
      } break;
      case 'assassinUpgrade': return { formula, nonRoll: true, hint: 'Это изменение размера кости Метки Смерти. Подготовьте бросок из основной способности с текущим размером кости.' };
      case 'rally': return { formula, nonRoll: true, hint: 'Это описание размера Кости Сплочения по уровню. Для подготовки нажмите именованную Кость Сплочения в предложении о её расходе.' };
      case 'rallyUpgrade': return /^в качестве вашей кости преимущества/.test(tail)
        ? { formula: '1d10', hint: 'Одна кость помощи d10. Перенос результата и расход учитываются вручную; здесь Надежда не списывается.' }
        : { formula, nonRoll: true, hint: 'Это улучшение Кости Сплочения до d10; бросок готовится из основного свойства.' };
      case 'patronSingle': return { formula, nonRoll: true, hint: 'Это описание размера Кости Покровителя по уровню. Для подготовки нажмите именованную кость в предложении о броске.' };
      case 'fighterWeapon': return countedBinding(formula, knownCount(actor.proficiency), 'Мастерство этой атаки', 'Мастерство применяется к обеим костям Удара бойца; постоянные бонусы не умножаются.');
      case 'combo': return { formula, nonRoll: true, hint: 'Это начальный размер или пример повышения Кости Комбо. Текущий размер выбирается явно в подготовке именованной кости.' };
      case 'companion': if (formula === 'd6' && /^,?\s*равное количеству неотмеченных ячеек стресса/.test(tail)) {
        const count = actor.companion ? knownCount(actor.companion.stress.max - actor.companion.stress.marked) : null;
        return countedBinding('d6', count, 'Свободных ячеек Стресса вашего компаньона', 'Используется Стресс компаньона, не персонажа. Проверьте хотя бы одну 6 и отметьте ячейки вручную.');
      } return { formula, nonRoll: true, hint: 'Это описание размера/повышения кости компаньона. Текущий урон готовится из строки атаки компаньона.' };
      case 'mastery': return countedBinding(formula, knownCount(actor.proficiency), 'Мастерство этой атаки', 'Количество костей равно Мастерству этой атаки; число целей не умножает пул.');
      case 'fixed': if (rule.slug === 'winged-sentinel' && rule.featureId === 194 && formula === '1d8') return { formula, nonRoll: true, hint: 'Это ссылка на прежнюю кость 1d8; текущее дополнение — 1d12.' };
        return { formula: explicitSingle(formula), hint: 'Фиксированное количество из свойства; не умножается Мастерством или числом целей.' };
      case 'uncertainMastery': return quantityBinding(formula, 'Количество d20 для этой атаки', 'Текст связывает урон с Мастерством; подтвердите количество для этого применения вручную. Здесь расходник не используется.');
      case 'countdownBranch': {
        const value = source.countdownValue;
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 12) return { formula: `${value >= 8 ? 1 : value >= 4 ? 2 : 3}d12`, hint: `Падение: значение именно этого отсчёта ${value}.` };
        return { formula: '', branches: [
          { id: 'countdown-8-12', label: 'Отсчёт 8–12: 1d12', formula: '1d12' },
          { id: 'countdown-4-7', label: 'Отсчёт 4–7: 2d12', formula: '2d12' },
          { id: 'countdown-0-3', label: 'Отсчёт 3 или ниже: 3d12', formula: '3d12' }
        ], hint: 'Выберите текущее значение отсчёта этого падения; общий отсчёт сцены не подставляется автоматически.' };
      }
      case 'weaponExtra': case 'weaponSequence': return { formula, nonRoll: true, hint: 'Это базовая кость в описании оружия. Дополнительная кость готовится из именованного свойства; основной урон — из строки оружия.' };
      case 'weaponReplacement': return { formula, nonRoll: true, hint: 'Это замена кости урона оружия на d20, а не отдельная d20. Измените полную формулу оружия вручную, сохранив количество костей и постоянный бонус.' };
    }
  }
  return null;
}

function hasRelatedFeature(actor: ContextualDiceActor, key: string): boolean {
  return actor.features?.some(feature => matchingSupplementalRules({ cardId: feature.id, ...contextualFeatureOrigin(feature), ...feature, text: feature.text ?? '' }).some(rule => rule.key === key)) ?? false;
}

function traitCount(actor: ContextualDiceActor, trait: TraitId): number | null {
  if (!actor.traits) return null;
  return knownCount(Array.isArray(actor.traits) ? actor.traits.find(item => item.id === trait)?.value : actor.traits[trait]);
}

function addKnownCount(count: number | null, extra: number): number | null {
  return count === null ? null : count + extra;
}

function dieChoice(label: string, hint: string, quantityLabel?: string): ContextualDiceBinding {
  return { formula: '', branches: [4, 6, 8, 10, 12, 20].map(sides => ({ id: `d${sides}`, label: `${label}: d${sides}`, formula: quantityLabel ? '' : `1d${sides}`,
    ...(quantityLabel ? { quantity: { label: quantityLabel, value: null, min: 1, max: 100, formulaTemplate: `{count}d${sides}`, explanation: hint } } : {}) })), hint };
}

function extraWeaponDie(source: ContextualDiceSource, repeated: boolean): ContextualDiceBinding {
  let sides: number | undefined;
  try { const dice = source.weaponFormula ? parseDiceFormula(source.weaponFormula).filter(term => term.kind === 'dice' && term.sign > 0) : []; if (dice.length === 1 && dice[0].kind === 'dice') sides = dice[0].sides; } catch { /* Unknown weapon formula requires explicit choice. */ }
  const hint = repeated ? 'Только дополнительные кости этого срабатывания. Продолжение последовательности и применение к уже брошенному урону выполняются вручную; основной урон не перебрасывается.' : 'Одна дополнительная кость к уже брошенному пулу; отбросьте наименьшее отдельное значение вручную. Основной урон здесь не повторяется.';
  if (!sides) return dieChoice('Размер кости этого оружия', hint, repeated ? 'Дополнительных костей этого срабатывания' : undefined);
  return repeated ? quantityBinding(`d${sides}`, 'Дополнительных костей этого срабатывания', hint) : { formula: `1d${sides}`, hint };
}
