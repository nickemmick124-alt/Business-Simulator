import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, defaultPlan, advanceMonth } from '../src/simulation.js';
import { STORAGE_KEY, createEnvelope, parseSave, exportSave, saveGame, loadGame, clearGame } from '../src/persistence.js';

function fakeStorage() {
  const data = new Map();
  return {
    writes: 0,
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { this.writes += 1; data.set(key, String(value)); },
    removeItem(key) { this.writes += 1; data.delete(key); },
  };
}

function payload() {
  const state = createInitialState(4821);
  return {
    state,
    plan: defaultPlan(state),
    drafts: [
      { id: 'balanced', name: 'Balanced growth', plan: defaultPlan(state) },
      { id: 'resilience', name: 'Protect cash', plan: defaultPlan(state) },
    ],
    settings: { reducedMotion: true, muted: false, viewMode: 'orbit' },
  };
}

test('save and load preserve exact state, current plan, named drafts, and settings', () => {
  const storage = fakeStorage();
  const game = payload();
  game.state = advanceMonth(game.state, game.plan).state;
  game.plan = defaultPlan(game.state);
  assert.deepEqual(saveGame(game, storage), { ok: true });
  const loaded = loadGame(storage);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.data.format, 'cnh-executive-save');
  assert.equal(loaded.data.version, 1);
  for (const key of Object.keys(game)) assert.deepEqual(loaded.data[key], game[key]);
  assert.deepEqual(advanceMonth(loaded.data.state, loaded.data.plan), advanceMonth(game.state, game.plan));
});

test('export/import round trips without sharing references with the active game', () => {
  const game = payload();
  const envelope = createEnvelope(game);
  const imported = parseSave(exportSave(game));
  for (const key of Object.keys(game)) assert.deepEqual(imported[key], game[key]);
  game.plan.tractorProduction += 1;
  assert.notEqual(envelope.plan.tractorProduction, game.plan.tractorProduction);
  assert.notEqual(imported.plan.tractorProduction, game.plan.tractorProduction);
});

test('missing save is distinguishable from a corrupt save and explicit clear works', () => {
  const storage = fakeStorage();
  assert.deepEqual(loadGame(storage), { ok: true, empty: true });
  saveGame(payload(), storage);
  assert.deepEqual(clearGame(storage), { ok: true });
  assert.deepEqual(loadGame(storage), { ok: true, empty: true });
});

test('malformed and unsupported saves are retained without any write during load', () => {
  for (const content of ['{"state":', JSON.stringify({ ...createEnvelope(payload()), version: 99 })]) {
    const storage = fakeStorage();
    storage.setItem(STORAGE_KEY, content);
    const writes = storage.writes;
    const loaded = loadGame(storage);
    assert.equal(loaded.ok, false);
    assert.match(loaded.error, /malformed JSON|Unsupported save version/);
    assert.equal(storage.getItem(STORAGE_KEY), content);
    assert.equal(storage.writes, writes);
  }
});

test('a different file format, invalid model state, and nonnumerical decisions are rejected', () => {
  const envelope = createEnvelope(payload());
  assert.throws(() => parseSave(JSON.stringify({ ...envelope, format: 'another-game' })), /not a CNH Executive save/);
  assert.throws(() => parseSave(JSON.stringify({ ...envelope, state: {} })), /Company state/);
  assert.throws(() => parseSave(JSON.stringify({ ...envelope, plan: { tractorProduction: '100' } })), /finite number/);
  assert.throws(() => parseSave(JSON.stringify({ ...envelope, plan: {} })), /numerical decisions/);
  assert.throws(() => parseSave(JSON.stringify({ ...envelope, drafts: {} })), /array/);
  assert.throws(() => parseSave(JSON.stringify({ ...envelope, settings: { muted: 'false' } })), /boolean/);
});

test('nonfinite decisions cannot be silently converted to null while saving', () => {
  const storage = fakeStorage();
  saveGame(payload(), storage);
  const existing = storage.getItem(STORAGE_KEY);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    const game = payload();
    game.plan.tractorProduction = invalid;
    const result = saveGame(game, storage);
    assert.equal(result.ok, false);
    assert.match(result.error, /finite/);
    assert.equal(storage.getItem(STORAGE_KEY), existing);
  }
});

test('saved decision drafts require distinct identifiers, names, and finite numeric inputs', () => {
  const envelope = createEnvelope(payload());
  for (const draft of [
    { id: '', name: 'Plan', plan: envelope.plan },
    { id: 'one', name: '', plan: envelope.plan },
    { id: 'one', name: 'Plan', plan: { tractorProduction: null } },
  ]) {
    assert.throws(() => parseSave(JSON.stringify({ ...envelope, drafts: [draft] })), /Saved plan/);
  }
  const duplicate = [envelope.drafts[0], envelope.drafts[0]];
  assert.throws(() => parseSave(JSON.stringify({ ...envelope, drafts: duplicate })), /unique/);
});

test('dangerous prototype keys are rejected at any depth without polluting objects', () => {
  const envelope = createEnvelope(payload());
  for (const key of ['__proto__', 'prototype', 'constructor']) {
    const dangerous = JSON.parse(`{"${key}":{"polluted":true}}`);
    assert.throws(() => parseSave(JSON.stringify({ ...envelope, extra: dangerous })), /unsafe key/);
  }
  assert.equal({}.polluted, undefined);
});

test('oversized exports and imports fail with a bounded-size message', () => {
  assert.throws(() => parseSave(' '.repeat(5 * 1024 * 1024 + 1)), /5 MB/);
  const game = payload();
  game.drafts[0].name = 'x'.repeat(5 * 1024 * 1024);
  assert.throws(() => exportSave(game), /5 MB/);
  const unicodeGame = payload();
  unicodeGame.drafts[0].name = '界'.repeat(2 * 1024 * 1024);
  assert.throws(() => exportSave(unicodeGame), /5 MB/);
});

test('quota and private-mode failures return recoverable errors rather than throw', () => {
  const quotaStore = { setItem() { const error = new Error('quota'); error.name = 'QuotaExceededError'; throw error; } };
  const privateStore = {
    getItem() { const error = new Error('private'); error.name = 'SecurityError'; throw error; },
    removeItem() { const error = new Error('private'); error.name = 'SecurityError'; throw error; },
  };
  assert.match(saveGame(payload(), quotaStore).error, /storage is full/);
  assert.match(loadGame(privateStore).error, /unavailable/);
  assert.match(clearGame(privateStore).error, /unavailable/);
  assert.equal(saveGame(payload(), null).ok, false);
});

test('a throwing localStorage property is also handled', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { const error = new Error('blocked'); error.name = 'SecurityError'; throw error; },
  });
  try {
    assert.equal(saveGame(payload()).ok, false);
    assert.equal(loadGame().ok, false);
    assert.equal(clearGame().ok, false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
