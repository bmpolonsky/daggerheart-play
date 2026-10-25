import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openSharedGmGame, openSharedPlayerGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { createNativeP2PProfiles, nativeRtcEvidence, type NativeSignalingMode } from './native-p2p-helpers';

const mode = process.env.P2P_ACCEPTANCE_SIGNALING ?? 'public';
if (mode !== 'public' && mode !== 'local-nostr') throw new Error('P2P_ACCEPTANCE_SIGNALING must be public or local-nostr.');

async function closeLibrary(page: Page): Promise<void> {
  const library = page.getByRole('dialog', { name: 'Библиотека игры' });
  if (await library.isVisible()) await library.getByRole('button', { name: 'Закрыть библиотеку' }).click();
}
async function joinSeat(page: Page, roomId: string): Promise<void> {
  await openSharedPlayerGame(page, roomId);
  const picker = page.getByRole('region', { name: 'Выбор игрока' });
  await expect(picker).toBeVisible({ timeout: 30_000 });
  const assignedSeat = picker.getByRole('button', { name: `Игрок 1 ${filledCharacterName}` });
  await expect(assignedSeat).toBeVisible({ timeout: 30_000 });
  await assignedSeat.click();
  await expect(page.getByLabel('Персонаж игрока')).toContainText(filledCharacterName, { timeout: 30_000 });
}
async function connectionId(page: Page): Promise<string> {
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки', exact: true }).click();
  await library.getByLabel('Разделы настроек').getByRole('button', { name: 'Диагностика', exact: true }).click();
  const technical = library.locator('details').filter({ has: page.locator('summary', { hasText: 'Технические данные' }) });
  if (!await technical.getByLabel('ID подключения', { exact: true }).isVisible()) await technical.locator('summary').click();
  const id = (await technical.getByLabel('ID подключения', { exact: true }).innerText()).trim();
  await closeLibrary(page);
  return id;
}
async function openGmSheet(gm: Page): Promise<void> {
  await closeLibrary(gm);
  await gm.getByRole('button', { name: filledCharacterName, exact: true }).first().click();
  await expect(gm.getByLabel('Персонаж игрока')).toContainText(filledCharacterName);
}
async function markWounds(player: Page, gm: Page, marked: number): Promise<void> {
  const playerWounds = player.getByLabel('Персонаж игрока').getByRole('group', { name: 'Раны', exact: true });
  await playerWounds.getByRole('button', { name: `Раны ${marked} из 5`, exact: true }).click();
  await expect(playerWounds.getByRole('button', { name: `Раны ${marked} из 5`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  const gmWounds = gm.getByLabel('Персонаж игрока').getByRole('group', { name: 'Раны', exact: true });
  await expect(gmWounds.getByRole('button', { name: `Раны ${marked} из 5`, exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await expect(player.getByLabel('Синхронизация персонажа').getByRole('status')).toContainText('Подтверждено мастером', { timeout: 30_000 });
}

// No trace: signaling frames may contain SDP. Attach safe numeric aggregates only.
// Both modes use real native RTC, Trystero and application transport. local-nostr
// substitutes only Nostr signaling, so it is not a public relay/TURN/NAT test.
test.use({ trace: 'off', video: 'off' });
test(`@native-p2p ${mode}: first roster without GM reload, wound ACK, isolated device identities and reconnect`, async ({ browser, browserName }, testInfo) => {
  test.skip(process.env.RUN_P2P_E2E !== '1', 'Opt-in real native WebRTC acceptance; production-free localhost artifact required.');
  test.skip(browserName !== 'chromium', 'Run native network acceptance once in Chromium.');
  test.setTimeout(210_000);
  const profiles = await createNativeP2PProfiles(browser, mode as NativeSignalingMode, 3);
  const gm = await profiles.contexts[0].newPage();
  const player = await profiles.contexts[1].newPage();
  const phone = await profiles.contexts[2].newPage();
  const evidence = { signalingMode: mode, applicationTransportHook: false, firstRosterBeforeGmReload: false,
    distinctPeerIdentities: false, initialWoundAck: false, playerReloadWoundAck: false, gmReloadWoundAck: false, secondDeviceExplicitRefusal: false };
  const roomId = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  try {
    await openSharedGmGame(gm, roomId);
    await importGameDocument(gm, createPopulatedGameDocument(), 'synthetic-native-acceptance.dhgame');
    await joinSeat(player, roomId);
    for (const page of [gm, player]) {
      expect(await page.evaluate(() => typeof (window as any).__DAGGERHEART_E2E_P2P_TRANSPORT_FACTORY__ === 'undefined')).toBe(true);
    }
    // This roster/character originates in the first authoritative snapshot;
    // there has been no reload of the GM or player since room creation.
    evidence.firstRosterBeforeGmReload = true;
    const gmId = await connectionId(gm);
    const playerId = await connectionId(player);
    evidence.distinctPeerIdentities = gmId.length > 0 && playerId.length > 0 && gmId !== 'нет' && playerId !== 'нет' && gmId !== playerId;
    expect(evidence.distinctPeerIdentities).toBe(true);
    await openGmSheet(gm);
    await markWounds(player, gm, 2);
    evidence.initialWoundAck = true;
    for (const page of [gm, player]) {
      await expect.poll(async () => (await nativeRtcEvidence(page))?.openDataChannels ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);
    }
    // Keep GM running: a player reload must not require a compensating GM
    // reload to make the next character change authoritative.
    await player.reload();
    await expect(player.getByLabel('Персонаж игрока')).toContainText(filledCharacterName, { timeout: 30_000 });
    await markWounds(player, gm, 3);
    evidence.playerReloadWoundAck = true;
    await gm.reload();
    await expect(gm.locator('[data-vtt-root]')).toBeVisible({ timeout: 30_000 });
    await openGmSheet(gm);
    await markWounds(player, gm, 4);
    evidence.gmReloadWoundAck = true;
    // A third isolated profile represents another device choosing the same
    // seat. Existing authority binding must refuse its write explicitly;
    // this test does not add or assume a merge/writer-lock implementation.
    await joinSeat(phone, roomId);
    const phoneId = await connectionId(phone);
    const reconnectedPlayerId = await connectionId(player);
    expect(phoneId.length > 0 && phoneId !== 'нет' && phoneId !== reconnectedPlayerId && phoneId !== gmId).toBe(true);
    const phoneWounds = phone.getByLabel('Персонаж игрока').getByRole('group', { name: 'Раны', exact: true });
    await phoneWounds.getByRole('button', { name: 'Раны 5 из 5', exact: true }).click();
    await expect(phone.getByLabel('Синхронизация персонажа').getByRole('status')).toContainText('Изменение отклонено', { timeout: 30_000 });
    await expect(phoneWounds.getByRole('button', { name: 'Раны 5 из 5', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(gm.getByLabel('Персонаж игрока').getByRole('button', { name: 'Раны 5 из 5', exact: true })).toHaveAttribute('aria-pressed', 'false');
    evidence.secondDeviceExplicitRefusal = true;
    expect(profiles.blockedExternalHttp).toBe(0);
    if (mode === 'local-nostr') expect(profiles.signalingEvents).toBeGreaterThan(0);
  } finally {
    const evidencePath = testInfo.outputPath('native-p2p-safe-evidence.json');
    await writeFile(evidencePath, JSON.stringify({ ...evidence,
      blockedExternalHttp: profiles.blockedExternalHttp, localSignalingEventCount: mode === 'local-nostr' ? profiles.signalingEvents : undefined,
      localSignalingSubscriptionCount: mode === 'local-nostr' ? profiles.signalingSubscriptions : undefined,
      localSignalingDeliveryCount: mode === 'local-nostr' ? profiles.signalingDeliveries : undefined,
      gm: await nativeRtcEvidence(gm), player: await nativeRtcEvidence(player), secondDevice: await nativeRtcEvidence(phone) }, null, 2));
    await testInfo.attach('native-p2p-safe-evidence', { contentType: 'application/json', path: evidencePath });
    await profiles.close();
  }
});
