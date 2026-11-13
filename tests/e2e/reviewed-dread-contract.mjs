import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const keys = ['slug', 'source_slugs', 'domain_slug', 'name', 'original_name', 'level', 'card_type', 'stress_cost', 'main_body', 'features'];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function dreadFingerprint(data) {
  const cards = data.filter(item => ['dread', 'playtest-dread'].includes(item.domain_slug))
    .map(item => Object.fromEntries(keys.map(key => [key, item[key] ?? null])))
    .sort((a, b) => a.slug.localeCompare(b.slug, 'en'));
  return createHash('sha256').update(JSON.stringify(canonical(cards))).digest('hex');
}
const contracts = [
  { id: 'void-20261102', hfCards: 0, voidCards: 21, hfStarterCards: 3, restricted: true },
  { id: 'hope-and-fear-20261110', hfCards: 21, voidCards: 0, hfStarterCards: 6, restricted: false }
].map(contract => ({ ...contract, fingerprint: dreadFingerprint(JSON.parse(readFileSync(new URL(`../fixtures/reviewed-dread/${contract.id}.json`, import.meta.url), 'utf8'))) }));
export function reviewedDreadContract(data) {
  const fingerprint = dreadFingerprint(data);
  const contract = contracts.find(item => item.fingerprint === fingerprint);
  if (!contract) throw new Error(`Unreviewed Dread corpus: ${fingerprint}. Review source/text changes explicitly; do not regenerate expectations automatically.`);
  return contract;
}
export async function servedDreadContract(request) {
  const response = await request.get('/data/domain-cards.json');
  if (!response.ok()) throw new Error(`Cannot read served Dread corpus: HTTP ${response.status()}`);
  return reviewedDreadContract((await response.json()).data);
}
