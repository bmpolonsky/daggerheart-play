import {test,expect} from 'vitest';
import {builderIssueLabel,builderIssueStep} from '../../src/ui/characters/builder/summaryPresentation';

test('summary issue links lead to their editable steps without changing readiness',()=>{
 expect(builderIssueStep('traits.distribution')).toBe('traits');
 expect(builderIssueStep('experiences.duplicate')).toBe('identity');
 expect(builderIssueStep('ancestry.mixedInvalid')).toBe('ancestry');
 expect(builderIssueStep('domainCards.unavailable')).toBe('cards');
 expect(builderIssueStep('equipment.secondaryWeapon')).toBe('equipment');
});

test('missing-trait copy names only actually unassigned fields and keeps other validator messages',()=>{
 const issue={id:'traits.distribution' as const,severity:'blocking' as const,message:'Распределите массив.'};
 expect(builderIssueLabel(issue,['Проворность'])).toBe('Выберите значения характеристик: Проворность.');
 expect(builderIssueLabel(issue,[])).toBe('Распределите массив.');
});
