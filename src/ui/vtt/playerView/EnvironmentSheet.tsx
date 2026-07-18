/** @jsxImportSource preact */
import { ChevronLeft } from "lucide-react";
import type { DomainCardTextMacro } from "../../../domain/rules/domainCards";
import type { EncounterEnvironment } from "../../../domain/rules/types";
import { diceService, feedService, gameService } from "../../../services/serviceRegistry";
import { parseSheetFeatureText, SheetFeatureSection, SheetHero, SheetLeadBlock, SheetTextSection, type SheetFeatureView } from "./SheetContent";
import { IconButton } from "../../components/common/IconButton";

export function EnvironmentSheet({ environment, onBack }: { environment: EncounterEnvironment; onBack: () => void }) {
  const portraitUrl = environment.imageUrl ?? '';
  const difficulty = environment.difficulty ? `Сложность ${environment.difficulty}` : 'Сложность не указана';
  return (
    <aside className="player-character-panel" aria-label="Окружение мастера" data-vtt-side-panel>
      <IconButton className="player-character-panel__back" variant="ghost" size="sm" type="button" title="К ростеру" aria-label="К ростеру" onClick={onBack}>
        <ChevronLeft size={17} aria-hidden="true" />
      </IconButton>
      <SheetHero className="player-character-panel__hero--environment" imageUrl={portraitUrl} title={environment.name} meta={[difficulty]} />
      <SheetLeadBlock text={environmentLeadText(environment)} />
      <SheetTextSection title="Потенциальные противники" text={environment.potentialAdversaries} />
      <EnvironmentFeatureSection environment={environment} />
      <SheetTextSection title="Описание" text={environment.body} />
      <SheetTextSection title="Заметки" text={environment.notes} />
    </aside>
  );
}

function environmentLeadText(environment: EncounterEnvironment): string {
  return [
    environment.summary,
    environment.impulses ? `Импульсы: ${environment.impulses}` : ''
  ].filter(Boolean).join('\n\n');
}

function EnvironmentFeatureSection({ environment }: { environment: EncounterEnvironment }) {
  const features = parseSheetFeatureText(environment.featureText);
  if (features.length === 0) return null;
  return (
    <SheetFeatureSection
      features={features}
      isInteractive={isInteractiveEnvironmentMacro}
      onMacro={(feature, macro) => runEnvironmentMacro(environment, feature, macro)}
    />
  );
}

function isInteractiveEnvironmentMacro(macro: DomainCardTextMacro): boolean {
  return macro.kind === 'actionRoll' || macro.kind === 'diceRoll' || macro.kind === 'damageRoll' || macro.kind === 'spendFear' || macro.kind === 'gainFear';
}

function runEnvironmentMacro(environment: EncounterEnvironment, feature: SheetFeatureView, macro: DomainCardTextMacro): void {
  const featureName = feature.name || 'Окружение';
  if (macro.kind === 'actionRoll') {
    diceService.rollManualDice({
      actorId: environment.id,
      actorName: environment.name,
      formula: '1d20',
      label: macro.label,
      notes: environmentMacroNotes(featureName, macro)
    });
    return;
  }
  if (macro.kind === 'diceRoll' || macro.kind === 'damageRoll') {
    diceService.rollManualDice({
      actorId: environment.id,
      actorName: environment.name,
      formula: macro.formula,
      label: macro.label,
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
