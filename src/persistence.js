import { validateState } from './simulation.js';

export const STORAGE_KEY = 'cnh-executive-save-v1';

const FORMAT = 'cnh-executive-save';
const VERSION = 1;
const MAX_BYTES = 5 * 1024 * 1024;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

// Check before stringify as well as after parsing: JSON.stringify silently turns
// Infinity into null and drops undefined, changing a simulation's saved state.
function inspectJson(value, path = 'Save', ancestors = new Set(), depth = 0) {
  if (depth > 100) throw new Error('Save data is nested too deeply.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite numbers.`);
    return;
  }
  if (typeof value !== 'object') throw new Error(`${path} is not JSON-compatible data.`);
  if (ancestors.has(value)) throw new Error('Save data contains a circular reference.');
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must contain plain JSON objects.`);
  }
  if (Object.getOwnPropertySymbols(value).length) {
    throw new Error(`${path} contains unsupported symbol keys.`);
  }
  ancestors.add(value);
  for (const key of Object.keys(value)) {
    if (UNSAFE_KEYS.has(key)) throw new Error(`${path} contains the unsafe key "${key}".`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor.get || descriptor.set) throw new Error(`${path} contains an unsupported accessor.`);
    inspectJson(value[key], `${path}.${key}`, ancestors, depth + 1);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new Error(`${path} contains an incomplete array.`);
    }
  }
  ancestors.delete(value);
}

function validateDecisionPlan(plan, label) {
  record(plan, label);
  if (!Object.keys(plan).length) throw new Error(`${label} must contain numerical decisions.`);
  for (const [key, value] of Object.entries(plan)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${label}.${key} must be a finite number.`);
    }
  }
}

function validateEnvelope(envelope) {
  record(envelope, 'Save');
  inspectJson(envelope);
  if (envelope.format !== FORMAT) throw new Error('This file is not a CNH Executive save.');
  if (envelope.version !== VERSION) {
    throw new Error(`Unsupported save version ${String(envelope.version)}. This game supports version ${VERSION}.`);
  }
  if (typeof envelope.savedAt !== 'string' || !Number.isFinite(Date.parse(envelope.savedAt))) {
    throw new Error('Save date is missing or invalid.');
  }
  record(envelope.state, 'Company state');
  let validation;
  try {
    validation = validateState(envelope.state);
  } catch (error) {
    throw new Error(`Company state is invalid: ${error?.message || 'unrecognized model data'}.`);
  }
  if (!validation.valid) {
    const details = Array.isArray(validation.errors) ? validation.errors.join('; ') : 'invalid company data';
    throw new Error(`Company state is invalid: ${details}.`);
  }
  validateDecisionPlan(envelope.plan, 'Current plan');
  if (!Array.isArray(envelope.drafts)) throw new Error('Saved plans must be an array.');
  const ids = new Set();
  for (const [index, draft] of envelope.drafts.entries()) {
    const label = `Saved plan ${index + 1}`;
    record(draft, label);
    if (typeof draft.id !== 'string' || !draft.id.trim()) throw new Error(`${label} needs an id.`);
    if (ids.has(draft.id)) throw new Error('Saved plan ids must be unique.');
    ids.add(draft.id);
    if (typeof draft.name !== 'string' || !draft.name.trim()) throw new Error(`${label} needs a name.`);
    validateDecisionPlan(draft.plan, label);
  }
  record(envelope.settings, 'Settings');
  for (const [key, value] of Object.entries(envelope.settings)) {
    if (!['string', 'boolean', 'number'].includes(typeof value)) {
      throw new Error(`Setting ${key} must be text, a boolean, or a finite number.`);
    }
  }
  for (const key of ['reducedMotion', 'muted']) {
    if (Object.hasOwn(envelope.settings, key) && typeof envelope.settings[key] !== 'boolean') {
      throw new Error(`Setting ${key} must be a boolean.`);
    }
  }
  if (Object.hasOwn(envelope.settings, 'viewMode') && !['orbit', 'walk'].includes(envelope.settings.viewMode)) {
    throw new Error('Setting viewMode must be orbit or walk.');
  }
  return envelope;
}

function checkSize(json) {
  // The character check rejects oversized files without first allocating another
  // large buffer. TextEncoder then measures actual UTF-8 bytes, including names.
  if (json.length > MAX_BYTES || new TextEncoder().encode(json).byteLength > MAX_BYTES) {
    throw new Error('Save file exceeds the 5 MB limit.');
  }
}

export function createEnvelope({ state, plan, drafts = [], settings = {} }) {
  const envelope = validateEnvelope({
    format: FORMAT,
    version: VERSION,
    savedAt: new Date().toISOString(),
    state,
    plan,
    drafts,
    settings,
  });
  const json = JSON.stringify(envelope);
  checkSize(json);
  // A save is a snapshot, independent of later edits to the active plan.
  return JSON.parse(json);
}

export function parseSave(json) {
  if (typeof json !== 'string') throw new Error('Save file must contain JSON text.');
  checkSize(json);
  let envelope;
  try {
    envelope = JSON.parse(json);
  } catch {
    throw new Error('Save file contains malformed JSON. Your existing save has not been changed.');
  }
  return validateEnvelope(envelope);
}

export function exportSave(payload) {
  const json = JSON.stringify(createEnvelope(payload), null, 2);
  checkSize(json);
  return json;
}

function storageError(error, action) {
  if (error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return 'Browser storage is full. Export your campaign to a file to keep your progress.';
  }
  if (error?.name === 'SecurityError') {
    return 'Browser storage is unavailable in this browser mode. Export your campaign to keep your progress.';
  }
  return `Could not ${action} campaign: ${error?.message || 'browser storage is unavailable'}`;
}

function resolveStorage(storage) {
  // Access can itself throw in private browsing. Call only inside a try block.
  const resolved = storage === undefined ? globalThis.localStorage : storage;
  if (!resolved) throw new Error('browser storage is unavailable');
  return resolved;
}

export function saveGame(payload, storage) {
  try {
    const json = JSON.stringify(createEnvelope(payload));
    resolveStorage(storage).setItem(STORAGE_KEY, json);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: storageError(error, 'save') };
  }
}

export function loadGame(storage) {
  try {
    const json = resolveStorage(storage).getItem(STORAGE_KEY);
    if (json === null) return { ok: true, empty: true };
    return { ok: true, data: parseSave(json) };
  } catch (error) {
    // A malformed or newer save is retained for recovery or download. Loading
    // never writes a replacement company or deletes a user's stored progress.
    return { ok: false, error: storageError(error, 'load') };
  }
}

export function clearGame(storage) {
  try {
    resolveStorage(storage).removeItem(STORAGE_KEY);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: storageError(error, 'clear') };
  }
}
