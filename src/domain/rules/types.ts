import type { MapAsset, TableParticipant, TableScene, TableVisibility } from '../tabletop/types';
import type { SceneMusicDeliveryMode } from '../audio/sceneAudio';
import type { RestFearPlan, RestType } from './rest';
import type { CharacterRuleModifier } from './characterRuleModifiers';

export type TraitId = 'agility' | 'strength' | 'finesse' | 'instinct' | 'presence' | 'knowledge';

export type DaggerheartClass =
  | 'Assassin'
  | 'Bard'
  | 'Druid'
  | 'Fighter'
  | 'Guardian'
  | 'Ranger'
  | 'Rogue'
  | 'Seraph'
  | 'Sorcerer'
  | 'Warlock'
  | 'Warrior'
  | 'Witch'
  | 'Wizard'
  | 'Custom';

export type DomainName =
  | 'Arcana'
  | 'Blade'
  | 'Bone'
  | 'Codex'
  | 'Dread'
  | 'Grace'
  | 'Midnight'
  | 'Sage'
  | 'Splendor'
  | 'Valor'
  | 'Custom';

export type DamageType = 'physical' | 'magic' | 'direct' | 'mixed';
export type RollPublication = 'public' | 'gm' | 'private';
export type DiceVisualTone = 'hope' | 'fear' | 'neutral' | 'advantage' | 'disadvantage' | 'damage' | 'critical';
export type SpotlightSide = 'players' | 'gm';
export type EncounterStatus = 'prep' | 'active' | 'paused' | 'completed';
export type EncounterDifficultyMode = 'easy' | 'standard' | 'hard';
export type AdversaryType =
  | 'Bruiser'
  | 'Horde'
  | 'Leader'
  | 'Minion'
  | 'Ranged'
  | 'Skulk'
  | 'Social'
  | 'Solo'
  | 'Standard'
  | 'Support'
  | 'Custom';

export interface TrackSlots {
  marked: number;
  max: number;
}

export interface HopeTrack {
  value: number;
  max: number;
}

export interface ArmorState {
  name: string;
  sourceId?: string | number;
  sourceSlug?: string;
  tier?: number | null;
  baseMajor: number;
  baseSevere: number;
  score: number;
  markedSlots: number;
  feature?: string;
  featureText?: string;
}

export interface Thresholds {
  major: number;
  severe: number;
}

export interface Experience {
  id: string;
  name: string;
  modifier: number;
  notes?: string;
}

export interface Weapon {
  id: string;
  name: string;
  sourceId?: string | number;
  sourceSlug?: string;
  category?: 'primary' | 'secondary' | 'custom';
  trait: TraitId;
  range: string;
  damageFormula: string;
  damageType: DamageType;
  burden?: 'one-handed' | 'two-handed' | null;
  featureText?: string;
  notes?: string;
}

export interface CharacterInventoryItem {
  id: string;
  name: string;
  kind: 'consumable' | 'item' | 'custom';
  quantity: number;
  uses?: {
    current: number;
    max: number;
  };
  text?: string;
  imageUrl?: string | null;
  sourceId?: string | number;
  sourceSlug?: string;
}

export interface CharacterWealth {
  coins: number;
  handfuls: number;
  bags: number;
  chests: number;
}

export interface DomainCardRecord {
  id: string;
  name: string;
  domain: DomainName;
  level: number;
  cost?: string;
  recallCost?: string;
  text: string;
  inLoadout: boolean;
  permanentlyVaulted?: boolean;
  /** A newly acquired card that could not enter a full Hand still needs an explicit free loadout choice. */
  loadoutChoicePending?: boolean;
  imageUrl?: string | null;
  cardType?: string;
  sourceId?: string | number;
  tokens: {
    value: number;
    max: number;
  };
}

export type CharacterUsageTrackerTargetKind = 'feature' | 'card';
export type CharacterUsageTrackerReset = 'manual' | 'short' | 'long';

export interface CharacterUsageTracker {
  id: string;
  targetKind: CharacterUsageTrackerTargetKind;
  targetId: string;
  label: string;
  current: number;
  max: number;
  reset: CharacterUsageTrackerReset;
}

export type CharacterAdvancementChoiceId =
  | 'traits'
  | 'hp'
  | 'stress'
  | 'experience'
  | 'domainCard'
  | 'evasion'
  | 'subclass'
  | 'proficiency'
  | 'multiclass'
  | 'manual';

export interface CharacterAdvancementState {
  choiceUsesByRank: Partial<Record<2 | 3 | 4, Partial<Record<CharacterAdvancementChoiceId, number>>>>;
  markedTraits: TraitId[];
  multiclass?: {
    className: DaggerheartClass;
    domain: DomainName;
    subclassName?: string;
    subclassSlug?: string;
  } | null;
}

export type CharacterChangeActorRole = 'player' | 'gm' | 'system';

export interface CharacterChangeActor {
  id: string;
  name: string;
  role: CharacterChangeActorRole;
}

export type CharacterChangeValue = null | boolean | number | string | CharacterChangeValue[] | { [key: string]: CharacterChangeValue };

export interface CharacterFieldChange {
  path: string[];
  beforeExists: boolean;
  afterExists: boolean;
  before?: CharacterChangeValue;
  after?: CharacterChangeValue;
}

export interface CharacterChangeRecord {
  id: string;
  actor: CharacterChangeActor;
  changedAt: string;
  kind: 'edit' | 'levelUp' | 'cardMove' | 'tracker' | 'undo' | 'freeform';
  summary: string;
  changes: CharacterFieldChange[];
  /** Groups several field mutations made during one explicit edit session. */
  historyGroupId?: string;
  undoesChangeId?: string;
  overrideReason?: string;
}

export type SubclassFeatureTier = 'foundation' | 'specialization' | 'mastery';

export interface CharacterSheetCard {
  id: string;
  kind: 'classFeature' | 'ancestry' | 'ancestryFeature' | 'community' | 'communityFeature' | 'subclass' | 'subclassFeature' | 'domainCard' | 'weapon' | 'item' | 'note' | 'custom';
  name: string;
  subtitle?: string;
  text?: string;
  imageUrl?: string | null;
  sourceId?: string | number;
  subclassTier?: SubclassFeatureTier;
}

export interface CharacterCondition {
  id: string;
  name: string;
  notes?: string;
}

export interface CharacterBeastformState {
  sourceId?: string | number;
  slug: string;
  name: string;
  tier: number;
  level: number | null;
  evasionModifier: number;
  traitType: TraitId | null;
  traitBonus: number;
  evolutionTrait?: TraitId | null;
  attackTrait: TraitId;
  attackRange: string;
  attackFormula: string;
  attackDamageType: DamageType;
  featureText: string;
  activatedAt: string;
}

export type RangerMarkTargetKind = 'character' | 'adversary';

export interface CharacterRangerMarkState {
  targetKind: RangerMarkTargetKind;
  targetId: string;
  targetName: string;
  markedAt: string;
}

export interface CharacterCompanionState {
  name: string;
  imageUrl?: string;
  evasion: number;
  stress: TrackSlots;
  attackName: string;
  attackRange: string;
  attackFormula: string;
  attackDamageType: DamageType;
  experiences: Experience[];
  unavailableUntilLongRest: boolean;
  notes?: string;
}

export interface Character {
  id: string;
  name: string;
  playerName: string;
  pronouns: string;
  portraitUrl: string;
  className: DaggerheartClass;
  classSourceId?: string | number;
  classSlug?: string;
  classDisplayName?: string;
  subclassName: string;
  subclassSlug?: string;
  ancestry: string;
  community: string;
  level: number;
  proficiency: number;
  domains: DomainName[];
  traits: Record<TraitId, number>;
  spellcastTrait?: TraitId | null;
  evasion: number;
  thresholds: Thresholds;
  hp: TrackSlots;
  stress: TrackSlots;
  hope: HopeTrack;
  armor: ArmorState;
  actionTokens: number;
  experiences: Experience[];
  weapons: Weapon[];
  domainCards: DomainCardRecord[];
  ruleModifiers: CharacterRuleModifier[];
  advancement?: CharacterAdvancementState;
  usageTrackers?: CharacterUsageTracker[];
  changeHistory?: CharacterChangeRecord[];
  /** Internal monotonic acknowledgement for authoritative player document sync. */
  playerSyncRevision?: { participantId: string; revision: number };
  sheetCards: CharacterSheetCard[];
  inventory: CharacterInventoryItem[];
  wealth: CharacterWealth;
  conditions: CharacterCondition[];
  activeBeastform?: CharacterBeastformState | null;
  rangerMark?: CharacterRangerMarkState | null;
  companion?: CharacterCompanionState | null;
  scars: CharacterScar[];
  notes: string;
  description?: CharacterDescription;
  backgroundAnswers?: CharacterQuestionAnswer[];
  connections?: CharacterConnection[];
  createdAt: string;
  updatedAt: string;
}

export interface CharacterScar {
  id: string;
  description: string;
  createdAt: string;
}

export interface CharacterDescription {
  appearance: string;
  demeanor: string;
  backstory: string;
}

export interface CharacterQuestionAnswer {
  id: string;
  prompt: string;
  answer: string;
}

export interface CharacterConnection {
  id: string;
  prompt: string;
  answer: string;
  targetName?: string;
}

export interface AdversaryExperience {
  id: string;
  name: string;
  modifier: number;
}

export interface AdversaryFeature {
  id: string;
  name: string;
  kind: 'action' | 'reaction' | 'passive' | 'fear';
  cost?: string;
  text: string;
}

export interface AdversaryAttack {
  name: string;
  range: string;
  damageFormula: string;
  damageType: DamageType;
}

export interface Adversary {
  id: string;
  /** Prepared source used to create this independent scene instance. */
  preparedTemplateId?: string;
  sourceId?: string | number;
  sourceSlug?: string;
  sourceName?: string;
  name: string;
  summary: string;
  motives: string;
  mainBody: string;
  imageUrl: string | null;
  tier: number;
  type: AdversaryType;
  difficulty: number;
  attackModifier: number;
  thresholds: Thresholds;
  hp: TrackSlots;
  stress: TrackSlots;
  standardAttack: AdversaryAttack;
  hordePerHp?: number | null;
  experiences: AdversaryExperience[];
  features: AdversaryFeature[];
  conditions: CharacterCondition[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Countdown {
  id: string;
  name: string;
  current: number;
  max: number;
  direction: 'up' | 'down';
  visibility: 'public' | 'gm';
  notes?: string;
}

export interface EncounterEnvironment {
  id: string;
  /** Prepared source used to create this independent scene instance. */
  preparedTemplateId?: string;
  sourceId?: string | number;
  sourceSlug?: string;
  sourceName?: string;
  name: string;
  tier: number;
  difficulty: number;
  type: string;
  typeName: string;
  summary: string;
  body: string;
  featureText: string;
  impulses: string;
  potentialAdversaries: string;
  imageUrl: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface GameState {
  id: string;
  name: string;
  gmName: string;
  sessionTitle: string;
  sceneTitle: string;
  fear: number;
  maxFear: number;
  spotlight: SpotlightSide;
  actionTokensPerScene: number;
  autoApplyRollConsequences: boolean;
  showLegacyActionTokens: boolean;
  showCoins: boolean;
  includeVoidContent: boolean;
  safetyNotes: string;
  tableNotes: string;
  handouts: GameHandout[];
  presentedHandoutId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GameHandout {
  id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  visibleToPlayers: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CharactersState {
  entities: Record<string, Character>;
  order: string[];
  selectedId: string | null;
  updatedAt: string;
}

export interface EncounterState {
  name: string;
  status: EncounterStatus;
  activeAdversaryId: string | null;
  adversaries: Record<string, Adversary>;
  order: string[];
  environments: Record<string, EncounterEnvironment>;
  countdowns: Countdown[];
  playerCount: number;
  difficultyMode: EncounterDifficultyMode;
  isDamageBoosted: boolean;
  isLowerTierUsed: boolean;
  battlePointBudget: number;
  environmentNotes: string;
  updatedAt: string;
}

export type ActionRollOutcome =
  | 'criticalSuccess'
  | 'successWithHope'
  | 'successWithFear'
  | 'failureWithHope'
  | 'failureWithFear';

export interface ModifierPart {
  label: string;
  value: number;
}

export interface ActionRollEntry {
  id: string;
  type: 'action';
  createdAt: string;
  actorId?: string;
  actorName: string;
  trait?: TraitId;
  difficulty: number;
  hopeDie: number;
  fearDie: number;
  advantageRolls: number[];
  disadvantageRolls: number[];
  keptExtraDie: number;
  modifiers: ModifierPart[];
  total: number;
  success: boolean;
  isCritical: boolean;
  outcome: ActionRollOutcome;
  consequenceApplied: boolean;
  publication?: RollPublication;
  notes?: string;
  warnings?: string[];
}

export interface ReactionRollEntry extends Omit<ActionRollEntry, 'type' | 'consequenceApplied'> {
  type: 'reaction';
  consequenceApplied: false;
}

export interface DiceTermRoll {
  sign: 1 | -1;
  count: number;
  sides: number;
  rolls: number[];
  subtotal: number;
}

export interface FlatTermRoll {
  sign: 1 | -1;
  value: number;
  subtotal: number;
}

export type FormulaTermRoll = DiceTermRoll | FlatTermRoll;

export interface DamageRollEntry {
  id: string;
  type: 'damage';
  createdAt: string;
  actorId?: string;
  actorName: string;
  formula: string;
  terms: FormulaTermRoll[];
  critical: boolean;
  criticalBonus: number;
  total: number;
  damageType: DamageType;
  publication?: RollPublication;
  notes?: string;
}

export interface ManualLogEntry {
  id: string;
  type: 'manual';
  createdAt: string;
  title: string;
  text: string;
}

export interface ManualDiceRollEntry extends ManualLogEntry {
  actorId?: string;
  actorName: string;
  formula: string;
  label?: string;
  terms: FormulaTermRoll[];
  diceTones?: DiceVisualTone[];
  total: number;
  visibility: TableVisibility;
  publication?: RollPublication;
  notes?: string;
}

export type RollLogEntry = ActionRollEntry | ReactionRollEntry | DamageRollEntry | ManualLogEntry | ManualDiceRollEntry;

export type FeedEntryType = 'message' | 'roll' | 'card' | 'handout' | 'rest' | 'teamwork' | 'deathMove' | 'system';

export interface FeedActorReference {
  actorId?: string;
  actorName: string;
  actorType?: 'character' | 'adversary' | 'system';
  playerId?: string;
}

export type RestFeedStatus = 'requested' | 'collecting' | 'resolved' | 'cancelled';
export type RestChoiceStatus = 'pending' | 'selected' | 'resolved';

export interface RestChoiceResult {
  formula?: string;
  rolls?: number[];
  total?: number;
  appliedAmount?: number;
  note: string;
}

export interface RestFeedChoice {
  id: string;
  label: string;
  count: number;
  status: RestChoiceStatus;
  result?: RestChoiceResult;
}

export interface RestFeedParticipant {
  actorId: string;
  actorName: string;
  playerId?: string;
  /** Per-character overrides for ancestry, community, and feature rules. */
  availableMoves?: string[];
  maxChoices?: number;
  /** A short-rest replacement may allow only a limited number of long-rest moves. */
  longRestMoveLabels?: string[];
  maxLongRestMoves?: number;
  ruleNotes?: string[];
  ready: boolean;
  choices: RestFeedChoice[];
}

export interface RestFeedRequest {
  id: string;
  restType: RestType;
  status: RestFeedStatus;
  requestedAt: string;
  requestedBy?: FeedActorReference;
  participants: RestFeedParticipant[];
  availableMoves: string[];
  maxChoicesPerParticipant: number;
  fearPlan?: RestFearPlan;
  resolvedAt?: string;
}

export type TeamworkRollKind = 'groupAction' | 'tagTeam';
export type TeamworkRollStatus = 'draft' | 'collecting' | 'resolved' | 'cancelled';
export type TeamworkRollParticipantRole = 'leader' | 'support' | 'partner';

export interface TeamworkRollActorOption {
  actorId: string;
  actorName: string;
  playerId?: string;
}

export interface TeamworkRollResult {
  rollId: string;
  rollType: 'action' | 'reaction';
  trait?: TraitId;
  total: number;
  difficulty: number;
  success: boolean;
  outcome?: ActionRollOutcome;
  note: string;
}

export interface TeamworkRollParticipantRequest {
  trait?: TraitId;
  requestedAt: string;
  status: 'pending' | 'rejected';
}

export interface TeamworkRollParticipant extends TeamworkRollActorOption {
  role: TeamworkRollParticipantRole;
  pendingRoll?: TeamworkRollParticipantRequest;
  result?: TeamworkRollResult;
}

export interface TeamworkRollRequest {
  id: string;
  kind: TeamworkRollKind;
  status: TeamworkRollStatus;
  requestedAt: string;
  requestedBy?: FeedActorReference;
  difficulty: number;
  prompt?: string;
  participants: TeamworkRollParticipant[];
  availableActors: TeamworkRollActorOption[];
  resolvedAt?: string;
}

export type DeathMoveChoice = 'blazeOfGlory' | 'avoidDeath' | 'riskItAll';
export type DeathMoveFeedStatus = 'pending' | 'resolved' | 'cancelled';
export type RiskItAllOutcome = 'hope' | 'fear' | 'critical';

export interface DeathMoveRollResult {
  kind: 'avoidDeathHope' | 'riskItAll';
  hopeDie: number;
  fearDie?: number;
  outcome?: RiskItAllOutcome;
  scarGained?: boolean;
}

export interface DeathMoveFeedRequest {
  id: string;
  status: DeathMoveFeedStatus;
  requestedAt: string;
  actor: FeedActorReference;
  choice?: DeathMoveChoice;
  roll?: DeathMoveRollResult;
  resolvedAt?: string;
}

export interface BaseFeedEntry {
  id: string;
  type: FeedEntryType;
  createdAt: string;
  visibility: TableVisibility;
  publication?: RollPublication;
  participantId?: string;
  authorName: string;
  title: string;
  body: string;
}

export interface MessageFeedEntry extends BaseFeedEntry {
  type: 'message';
}

export interface SystemFeedEntry extends BaseFeedEntry {
  type: 'system';
}

export interface RollFeedEntry extends BaseFeedEntry {
  type: 'roll';
  roll: RollLogEntry;
}

export interface CardFeedEntry extends BaseFeedEntry {
  type: 'card';
  card: DomainCardRecord;
  actor?: FeedActorReference;
}

export interface HandoutFeedEntry extends BaseFeedEntry {
  type: 'handout';
  handout: Pick<GameHandout, 'id' | 'title' | 'body' | 'imageUrl'>;
}

export interface RestFeedEntry extends BaseFeedEntry {
  type: 'rest';
  rest: RestFeedRequest;
}

export interface TeamworkRollFeedEntry extends BaseFeedEntry {
  type: 'teamwork';
  teamwork: TeamworkRollRequest;
}

export interface DeathMoveFeedEntry extends BaseFeedEntry {
  type: 'deathMove';
  deathMove: DeathMoveFeedRequest;
}

export type FeedEntry = MessageFeedEntry | SystemFeedEntry | RollFeedEntry | CardFeedEntry | HandoutFeedEntry | RestFeedEntry | TeamworkRollFeedEntry | DeathMoveFeedEntry;

export interface UiState {
  activeScreen: 'dashboard' | 'characters' | 'rolls' | 'encounter' | 'library' | 'settings';
  sidebarCollapsed: boolean;
}

export interface SceneTableState {
  schemaVersion: 4;
  /** Session-wide preference. `scene.music.deliveryMode` is kept for legacy saves. */
  musicDeliveryMode: SceneMusicDeliveryMode;
  activeSceneId: string;
  liveSceneId: string;
  scenes: Record<string, TableScene>;
  sceneOrder: string[];
  assets: Record<string, MapAsset>;
  participants: Record<string, TableParticipant>;
  selectedTokenId: string | null;
  updatedAt: string;
}

export interface PersistedState {
  schemaVersion: number;
  game: GameState;
  characters: CharactersState;
  encounter: EncounterState;
  rollLog: RollLogEntry[];
  feed: FeedEntry[];
  ui: UiState;
  sceneTable: SceneTableState;
}
