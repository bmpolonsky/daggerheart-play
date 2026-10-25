/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import { PreparedDiceRollDialog } from "./CharacterRollDialog";
import type { PreparedDiceRoll } from "../../../services/CharacterRollService";
import type { ComponentChildren } from "preact";
import { ChevronLeft } from "lucide-react";
import { resolveContextualDiceBinding } from "../../../domain/rules/contextualDiceBindings";
import type { DomainCardTextMacro } from "../../../domain/rules/domainCards";
import type { EncounterEnvironment } from "../../../domain/rules/types";
import { feedService, gameService } from "../../../services/serviceRegistry";
import { parseSheetFeatureText, SheetFeatureSection, SheetHero, SheetLeadBlock, SheetTextSection, type SheetFeatureView } from "./SheetContent";
import { IconButton } from "../../components/common/IconButton";

export function EnvironmentSheet({ environment, navigation, onBack }: { environment: EncounterEnvironment; navigation?: ComponentChildren; onBack?: () => void }) {
  const [featureDiceState, setFeatureDiceState] = useState<{ actorId: string; draft: PreparedDiceRoll } | null>(null);
  const featureDiceDraft = featureDiceState?.actorId === environment.id ? featureDiceState.draft : null;
  const setFeatureDiceDraft = (draft: PreparedDiceRoll | null) => setFeatureDiceState(draft ? { actorId: environment.id, draft } : null);
  const portraitUrl = environment.imageUrl ?? '';
  const difficulty = environment.difficulty ? `Сложность ${environment.difficulty}` : 'Сложность не указана';
  return (
    <div className="player-character-panel-shell">
      {featureDiceDraft && <PreparedDiceRollDialog actor={environment} draft={featureDiceDraft} role="gm" onClose={() => setFeatureDiceDraft(null)} />}
      {navigation}
      <aside className="player-character-panel" aria-label="Окружение мастера" data-vtt-side-panel>
        {onBack && (
          <IconButton className="player-character-panel__back" variant="ghost" size="sm" type="button" title="К ростеру" aria-label="К ростеру" onClick={onBack}>
            <ChevronLeft size={17} aria-hidden="true" />
          </IconButton>
        )}
        <SheetHero className="player-character-panel__hero--environment" imageUrl={portraitUrl} title={environment.name} meta={[difficulty]} />
        <SheetLeadBlock text={environmentLeadText(environment)} />
        <SheetTextSection title="Потенциальные противники" text={environment.potentialAdversaries} />
        <EnvironmentFeatureSection environment={environment} openDiceDraft={setFeatureDiceDraft} />
        <SheetTextSection title="Описание" text={environment.body} />
        <SheetTextSection title="Заметки" text={environment.notes} />
      </aside>
    </div>
  );
}

function environmentLeadText(environment: EncounterEnvironment): string {
  return [
    environment.summary,
    environment.impulses ? `Импульсы: ${environment.impulses}` : ''
  ].filter(Boolean).join('\n\n');
}

function EnvironmentFeatureSection({ environment, openDiceDraft }: { environment: EncounterEnvironment; openDiceDraft: (draft: PreparedDiceRoll) => void }) {
  const features = parseSheetFeatureText(environment.featureText).map(feature => ({ ...feature, sourceId: environment.sourceId, collection: 'environment', slug: environment.sourceSlug }));
  if (features.length === 0) return null;
  return (
    <SheetFeatureSection
      features={features}
      macroActor={{ proficiency: Number.NaN, level: Number.NaN }}
      isInteractive={isInteractiveEnvironmentMacro}
      onMacro={(feature, macro) => runEnvironmentMacro(environment, feature, macro, openDiceDraft)}
    />
  );
}

function isInteractiveEnvironmentMacro(macro: DomainCardTextMacro): boolean {
  return macro.kind === 'actionRoll' || macro.kind === 'diceRoll' || macro.kind === 'damageRoll' || macro.kind === 'spendFear' || macro.kind === 'gainFear';
}

function runEnvironmentMacro(environment: EncounterEnvironment, feature: SheetFeatureView, macro: DomainCardTextMacro, openDiceDraft: (draft: PreparedDiceRoll) => void): void {
  const featureName = feature.name || 'Окружение';
  if (macro.kind === 'actionRoll' || macro.kind === 'diceRoll' || macro.kind === 'damageRoll') {
    const binding = macro.kind === 'actionRoll' ? { formula: '1d20' } : resolveContextualDiceBinding({ cardId: feature.id, sourceId: feature.sourceId ?? environment.sourceId, collection: 'environment', slug: feature.slug ?? environment.sourceSlug, text: feature.text }, macro, { proficiency: Number.NaN, level: Number.NaN });
    if ('nonRoll' in binding && binding.nonRoll) return;
    openDiceDraft({
      kind: macro.kind === 'damageRoll' ? 'damage' : 'manualDice',
      ...binding,
      formula: binding.formula,
      source: { cardId: feature.id, sourceId: feature.sourceId ?? environment.sourceId, label: featureName },
      damageType: macro.kind === 'damageRoll' ? macro.damageType ?? undefined : undefined,
      title: `${featureName}: ${macro.label}`,
      notes: environmentMacroNotes(featureName, macro)
    });
    return;
  }
  if (!('amount' in macro)) return;
  if (macro.kind === 'spendFear') {
    const applied = gameService.spendFear(macro.amount);
    feedService.addMessage(environment.name, `${featureName} — ${applied ? '-' : 'не хватает: -'}${macro.amount} Страх`, { title: 'Окружение', publication: 'public' });
    return;
  }
  if (macro.kind === 'gainFear') {
    gameService.gainFear(macro.amount);
    feedService.addMessage(environment.name, `${featureName} — +${macro.amount} Страх`, { title: 'Окружение', publication: 'public' });
  }
}

function environmentMacroNotes(featureName: string, macro: DomainCardTextMacro): string {
  const difficulty = macro.kind === 'actionRoll' && macro.difficulty ? ` / Сложность ${macro.difficulty}` : '';
  return `Окружение: ${featureName}. ${macro.label}${difficulty}`;
}
