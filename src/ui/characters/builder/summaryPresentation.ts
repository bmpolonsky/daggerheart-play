import type { CharacterBuilderIssue, CharacterBuilderIssueId } from '../../../domain/characterBuilder/validation';
import type { BuilderStep } from '../../../domain/characterBuilder/flow';

const ISSUE_STEPS: Record<CharacterBuilderIssueId, BuilderStep> = {
  'class.required': 'class', 'class.invalid': 'class',
  'ancestry.required': 'ancestry', 'ancestry.invalid': 'ancestry', 'ancestry.mixedInvalid': 'ancestry',
  'community.required': 'community', 'community.invalid': 'community',
  'subclass.required': 'subclass', 'subclass.invalid': 'subclass',
  'domainCards.required': 'cards', 'domainCards.invalid': 'cards', 'domainCards.unavailable': 'cards',
  'experiences.required': 'identity', 'experiences.duplicate': 'identity', 'traits.distribution': 'traits',
  'equipment.armor': 'equipment', 'equipment.primaryWeapon': 'equipment', 'equipment.secondaryWeapon': 'equipment',
  'equipment.classItem': 'equipment', 'equipment.consumable': 'equipment'
};

/** Presentation navigation only; readiness remains owned by the validator. */
export function builderIssueStep(id: CharacterBuilderIssueId): BuilderStep {
  return ISSUE_STEPS[id];
}

export function builderIssueLabel(issue: CharacterBuilderIssue, unassignedTraits: string[]): string {
  return issue.id === 'traits.distribution' && unassignedTraits.length
    ? `Выберите значения характеристик: ${unassignedTraits.join(', ')}.`
    : issue.message;
}
