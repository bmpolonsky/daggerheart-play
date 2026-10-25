import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createDomainCard } from '../../src/domain/rules/factories';
import { resolveDomainCardTokenMax } from '../../src/domain/rules/domainCards';

// Reviewed local SRD cache: public/data/domain-cards.json, unleash-chaos.
const chaos = createDomainCard({
  name: 'Высвобождение хаоса',
  text: 'В начале сессии поместите на эту карту количество жетонов, равное вашей Характеристике Заклинателя. В конце каждой сессии снимите все неиспользованные жетоны.'
});
const traits = { agility: 1, strength: 0, finesse: 2, instinct: 3, presence: 4, knowledge: -1 };

test('Chaos token capacity follows the selected Spellcast trait, not a six-token fallback', () => {
  assert.equal(resolveDomainCardTokenMax(chaos, traits, 'instinct'), 3);
  assert.equal(resolveDomainCardTokenMax(chaos, traits, 'presence'), 4);
  assert.equal(resolveDomainCardTokenMax(chaos, traits, 'knowledge'), 0);
});

test('Spellcast token capacity recognizes English rules and leaves explicit caps authoritative', () => {
  const english = createDomainCard({ text: 'Place tokens equal to your Spellcast trait on this card.' });
  assert.equal(resolveDomainCardTokenMax(english, traits, 'finesse'), 2);
  const explicit = createDomainCard({ text: 'Place up to 5 tokens equal to your Spellcast trait on this card.' });
  assert.equal(resolveDomainCardTokenMax(explicit, traits, 'finesse'), 5);
});
