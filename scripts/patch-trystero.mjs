import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Временная защита для закреплённой версии. При обновлении Trystero нужно
// проверить исправления upstream, а не применять замену к неизвестному коду.
const version = '0.25.3';
const marker = '// daggerheart-play: Trystero allocation/retry guard v1';
function markPatched(source) {
  // Исходная карта больше не соответствует строкам изменённого dist-файла.
  return `${marker}\n${source.replace(/^\/\/# sourceMappingURL=.*$/m, '')}`;
}
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Trystero patch source mismatch');
  return source.replace(before, after);
}

export function patchOfferPool(source) {
  if (source.startsWith(marker)) return source;
  source = replaceOnce(source, '\tactive = false;', '\tactive = false;\n\tpending = new Set();\n\tgeneration = 0;');
  source = replaceOnce(source,
    '\t\talloc(poolSize, this.makeOffer).forEach((p) => this.push(p));',
    `\t\ttry {
\t\t\tfor (let i = 0; i < poolSize; i++) this.push(this.makeOffer());
\t\t} catch (error) {
\t\t\tthis.destroy();
\t\t\tthrow error;
\t\t}`);
  source = replaceOnce(source, '\t\tconst peers = this.shift(n);',
    `\t\tconst peers = this.shift(n);
\t\tconst generation = this.generation;
\t\tlet aborted = false;
\t\tconst candidates = new Set(peers);
\t\tpeers.forEach(peer => this.pending.add(peer));
\t\tconst makeCandidate = () => {
\t\t\tconst peer = this.makeOffer();
\t\t\tcandidates.add(peer);
\t\t\tthis.pending.add(peer);
\t\t\treturn peer;
\t\t};
\t\tconst discard = peer => {
\t\t\tthis.pending.delete(peer);
\t\t\tthis.claimLeased(peer);
\t\t\tthis.pooled.delete(peer);
\t\t\tif (!peer.isDead) peer.destroy();
\t\t};`);
  source = replaceOnce(source, '\t\tif (missing > 0) peers.push(...alloc(missing, this.makeOffer));',
    `\t\ttry {
\t\t\tfor (let i = 0; i < missing; i++) peers.push(makeCandidate());
\t\t} catch (error) {
\t\t\tcandidates.forEach(discard);
\t\t\tthrow error;
\t\t}`);
  source = replaceOnce(source, '\t\t\t\tconst offer = await encryptOffer(candidate);',
    `\t\t\t\tconst offer = await encryptOffer(candidate);
\t\t\t\tif (aborted || generation !== this.generation || candidate.isDead) throw new Error('Trystero offer checkout cancelled');
\t\t\t\tthis.pending.delete(candidate);`);
  source = replaceOnce(source,
    '\t\t\t\tthis.claimLeased(candidate);\n\t\t\t\tthis.pooled.delete(candidate);\n\t\t\t\tcandidate.destroy();\n\t\t\t\tif (!didRetry) return toRecord(this.makeOffer(), true);',
    '\t\t\t\tdiscard(candidate);\n\t\t\t\tif (!didRetry && !aborted && generation === this.generation) return toRecord(makeCandidate(), true);');
  source = replaceOnce(source, '\t\treturn all(peers.map((peer) => toRecord(peer)));',
    `\t\treturn all(peers.map((peer) => toRecord(peer))).catch(error => {
\t\t\taborted = true;
\t\t\tcandidates.forEach(discard);
\t\t\tthrow error;
\t\t});`);
  source = replaceOnce(source, '\tdestroy() {\n\t\tthis.active = false;',
    '\tdestroy() {\n\t\tthis.generation += 1;\n\t\tthis.pending.forEach(peer => { if (!peer.isDead) peer.destroy(); });\n\t\tthis.pending.clear();\n\t\tthis.active = false;');
  return markPatched(source);
}

export function patchStrategy(source) {
  if (source.startsWith(marker)) return source;
  return markPatched(replaceOnce(source,
    '\t\tconst strategyContext = {\n\t\t\tconfig,',
    '\t\tconst strategyContext = {\n\t\t\tonJoinError,\n\t\t\tconfig,'));
}

export function patchTorrent(source) {
  if (source.startsWith(marker)) return source;
  source = replaceOnce(source,
    '\t\tif (missingOffers > 0) (await getOffers(missingOffers)).forEach((peerAndOffer) => {\n\t\t\toutstandingOffers[genId(hashLimit)] = {',
    `\t\tif (missingOffers > 0) (await getOffers(missingOffers)).forEach((peerAndOffer) => {
\t\t\tif (!roomSubscriberCounts[rootTopic]) {
\t\t\t\tpeerAndOffer.reclaim?.();
\t\t\t\treturn;
\t\t\t}
\t\t\tgetRoomOutstandingOffers(rootTopic)[genId(hashLimit)] = {`);
  source = replaceOnce(source, '\treturn getRoomOutstandingOffers(rootTopic);',
    '\treturn roomSubscriberCounts[rootTopic] ? getRoomOutstandingOffers(rootTopic) : {};');
  // Оба send относятся к announce. Их отказ тоже должен попадать в общий catch.
  source = replaceOnce(source, '\t\t\t\t\tsend(client, rootTopic, {\n\t\t\t\t\t\tleft: 0,',
    '\t\t\t\t\tawait send(client, rootTopic, {\n\t\t\t\t\t\tleft: 0,');
  source = replaceOnce(source, '\t\t\t\tsend(client, rootTopic, {\n\t\t\t\t\tnumwant: offerPoolSize,',
    '\t\t\t\tconst offers = await ensureOutstandingOffers(rootTopic, getOffers);\n\t\t\t\tif (activeTokens[rootTopic] !== subscriptionToken) return;\n\t\t\t\tawait send(client, rootTopic, {\n\t\t\t\t\tnumwant: offerPoolSize,');
  source = replaceOnce(source, 'entries(await ensureOutstandingOffers(rootTopic, getOffers)).map', 'entries(offers).map');
  source = replaceOnce(source, '\t\tconst { announce } = topicState;',
    `\t\tlet announceInFlight = false;
\t\tlet failureStreak = 0;
\t\tlet retryAt = 0;
\t\tconst announce = async () => {
\t\t\tif (activeTokens[rootTopic] !== subscriptionToken || announceInFlight || Date.now() < retryAt) return;
\t\t\tannounceInFlight = true;
\t\t\ttry {
\t\t\t\tawait topicState.announce();
\t\t\t\tfailureStreak = 0;
\t\t\t\tretryAt = 0;
\t\t\t} catch (error) {
\t\t\t\tif (activeTokens[rootTopic] !== subscriptionToken) return;
\t\t\t\tfailureStreak += 1;
\t\t\t\tconst retryMs = Math.min(300000, maxAnnounceMs * 2 ** Math.min(failureStreak - 1, 4));
\t\t\t\tretryAt = Date.now() + retryMs;
\t\t\t\tconst message = error instanceof Error ? error.message : String(error);
\t\t\t\tif (context?.config.relayConfig?.warnOnRelayFailure !== false) {
\t\t\t\t\tconsole.warn(libName + ': torrent announce failed (attempt ' + failureStreak + ', retry in ' + retryMs + 'ms): ' + message);
\t\t\t\t}
\t\t\t\tif (failureStreak === 1) context?.onJoinError?.({
\t\t\t\t\tappId: context.appId, roomId: context.roomId, peerId: '',
\t\t\t\t\terror: 'torrent_announce_failed: ' + message
\t\t\t\t});
\t\t\t} finally {
\t\t\t\tannounceInFlight = false;
\t\t\t}
\t\t};`);
  return markPatched(source);
}

export async function applyTrysteroPatch(root = fileURLToPath(new URL('..', import.meta.url))) {
  const patches = [
    ['@trystero-p2p/core', 'offer-pool.mjs', patchOfferPool],
    ['@trystero-p2p/core', 'strategy.mjs', patchStrategy],
    ['@trystero-p2p/torrent', 'index.mjs', patchTorrent]
  ];
  const writes = [];
  for (const [name, file, patch] of patches) {
    const packageRoot = resolve(root, 'node_modules', name);
    const installed = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
    if (installed.version !== version) throw new Error(`Review Trystero patch before using ${name}@${installed.version}`);
    const path = resolve(packageRoot, 'dist', file);
    const source = await readFile(path, 'utf8');
    const result = patch(source);
    if (result !== source) writes.push([path, result]);
  }
  // Проверяем все исходники до первой записи, чтобы mismatch не оставил полупатч.
  for (const [path, source] of writes) await writeFile(path, source);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await applyTrysteroPatch();
}
