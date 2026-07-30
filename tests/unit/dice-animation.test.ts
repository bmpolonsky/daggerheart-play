import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DiceAnimationPolicy, diceAnimationContextKey, shouldAnimateInitialDiceRoll } from '../../src/domain/tabletop/diceAnimation';

const CONTEXT_A = 'game-a:player:actor-a';

test('dice animation policy completes a historical initial roll without animating it', () => {
  const policy = new DiceAnimationPolicy();

  assert.equal(policy.observe({
    contextKey: CONTEXT_A,
    rollId: 'old-roll',
    animationReady: true,
    animateInitialRoll: false,
    alreadySeen: false
  }), 'complete');
  assert.equal(policy.observe({
    contextKey: CONTEXT_A,
    rollId: 'old-roll',
    animationReady: true,
    animateInitialRoll: false,
    alreadySeen: false
  }), 'none');
});

test('dice animation policy animates a roll that appears after initialization', () => {
  const policy = new DiceAnimationPolicy();

  assert.equal(policy.observe({
    contextKey: CONTEXT_A,
    rollId: null,
    animationReady: true,
    animateInitialRoll: false,
    alreadySeen: false
  }), 'none');
  assert.equal(policy.observe({
    contextKey: CONTEXT_A,
    rollId: 'new-roll',
    animationReady: true,
    animateInitialRoll: false,
    alreadySeen: false
  }), 'animate');
});

test('dice animation policy waits for snapshot classification before consuming a roll', () => {
  const policy = new DiceAnimationPolicy();

  assert.equal(policy.observe({
    contextKey: CONTEXT_A,
    rollId: 'snapshot-roll',
    animationReady: false,
    animateInitialRoll: false,
    alreadySeen: false
  }), 'wait');
  assert.equal(policy.observe({
    contextKey: CONTEXT_A,
    rollId: 'snapshot-roll',
    animationReady: true,
    animateInitialRoll: true,
    alreadySeen: false
  }), 'animate');
});

test('dice animation policy completes a delayed historical initial roll without animating it', () => {
  const policy = new DiceAnimationPolicy();

  assert.equal(policy.observe({
    contextKey: CONTEXT_A,
    rollId: 'historical-snapshot-roll',
    animationReady: false,
    animateInitialRoll: false,
    alreadySeen: false
  }), 'wait');
  assert.equal(policy.observe({
    contextKey: CONTEXT_A,
    rollId: 'historical-snapshot-roll',
    animationReady: true,
    animateInitialRoll: false,
    alreadySeen: false
  }), 'complete');
});

test('dice animation policy baselines a saved roll after switching game context', () => {
  const policy = new DiceAnimationPolicy();

  assert.equal(policy.observe({
    contextKey: CONTEXT_A,
    rollId: null,
    animationReady: true,
    animateInitialRoll: false,
    alreadySeen: false
  }), 'none');
  assert.equal(policy.observe({
    contextKey: CONTEXT_A,
    rollId: 'live-roll-a',
    animationReady: true,
    animateInitialRoll: false,
    alreadySeen: false
  }), 'animate');
  assert.equal(policy.observe({
    contextKey: 'game-b:player:actor-b',
    rollId: 'saved-roll-b',
    animationReady: true,
    animateInitialRoll: false,
    alreadySeen: false
  }), 'complete');
});

test('dice animation context includes game, role, and visible actor', () => {
  assert.equal(diceAnimationContextKey({
    gameId: 'game-a',
    role: 'player',
    actorId: 'actor-a'
  }), CONTEXT_A);
  assert.notEqual(
    diceAnimationContextKey({ gameId: 'game-a', role: 'player', actorId: 'actor-a' }),
    diceAnimationContextKey({ gameId: 'game-a', role: 'player', actorId: 'actor-b' })
  );
});

test('only a fresh player snapshot may animate an initial roll', () => {
  assert.equal(shouldAnimateInitialDiceRoll({
    role: 'player',
    latestRollId: 'roll-1',
    latestRollAnimationId: 'roll-1'
  }), true);
  assert.equal(shouldAnimateInitialDiceRoll({
    role: 'gm',
    latestRollId: 'roll-1',
    latestRollAnimationId: 'roll-1'
  }), false);
  assert.equal(shouldAnimateInitialDiceRoll({
    role: 'player',
    latestRollId: 'roll-1',
    latestRollAnimationId: null
  }), false);
});
