import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world.js';

// Exercise the actual world interaction methods and scene graph without pretending
// to verify WebGL rendering. Canvas texture creation is the only scene stub.
function makeWorld(t) {
  const world = Object.create(World.prototype);
  Object.assign(world, {
    state: { advisersEnabled: true, advisorsVisited: [], products: [] },
    location: 'headquarters', viewMode: 'orbit', disposed: false,
    materials: new Map(), geometries: new Map(), textures: [],
    advisors: [], clickTargets: [], hotspots: [], animations: [],
    keys: new Set(), camera: new THREE.PerspectiveCamera(39, 1.5),
    controls: { target: new THREE.Vector3() }, scene: new THREE.Scene(),
    headquarters: new THREE.Group(), factory: new THREE.Group(),
    meetings: [], hints: [], onInspect() {}, onLocationChange() {},
    onMeet(id) { this.meetings.push(id); },
    onAdvisorHint(hint) { this.hints.push(hint); },
  });
  world.scene.add(world.headquarters, world.factory);
  world.sign = function(parent, text, width, height, position) {
    const label = this.box(parent, [width, height, 0.02], position, '#263e39');
    label.userData.label = text;
    return label;
  };
  world.buildAdvisors();
  t.after(() => {
    world.geometries.forEach(geometry => geometry.dispose());
    world.materials.forEach(material => material.dispose());
  });
  return world;
}

test('six tangible advisers occupy the corresponding headquarters and factory locations', t => {
  const world = makeWorld(t);
  assert.deepEqual(world.advisors.map(advisor => advisor.id), ['cfo', 'sales', 'strategy', 'operations', 'quality', 'supply']);
  for (const advisor of world.advisors) {
    assert.equal(advisor.group.parent, advisor.location === 'factory' ? world.factory : world.headquarters);
    assert.equal(advisor.group.position.x, advisor.x);
    assert.equal(advisor.group.position.z, advisor.z);
    let meshes = 0;
    advisor.group.traverse(object => { if (object.isMesh) meshes++; });
    assert.ok(meshes >= 12, 'the station contains a person, sign, marker and interaction geometry');
    assert.ok(world.clickTargets.some(target => target.userData.advisorId === advisor.id));
  }
});

test('architectural batching preserves adviser identity, mutable markers and click targets', t => {
  const world = makeWorld(t);
  const adviserGroups = world.advisors.map(advisor => advisor.group);
  world.batchStaticGeometry(world.headquarters);
  world.batchStaticGeometry(world.factory);
  world.advisors.forEach((advisor, index) => {
    assert.equal(advisor.group, adviserGroups[index]);
    assert.equal(advisor.ring.parent, advisor.group);
    assert.equal(advisor.labelMesh.parent, advisor.group);
    assert.ok(world.clickTargets.find(target => target.userData.advisorId === advisor.id).parent);
  });
});

test('consulted markers are individual, refresh each month, and disappear for campaigns without meetings', t => {
  const world = makeWorld(t);
  world.setState({ advisorsVisited: ['cfo', 'quality'] });
  const cfo = world.advisors.find(advisor => advisor.id === 'cfo');
  const sales = world.advisors.find(advisor => advisor.id === 'sales');
  assert.equal(cfo.consulted.visible, true);
  assert.equal(cfo.unread.visible, false);
  assert.equal(sales.consulted.visible, false);
  assert.notEqual(cfo.markerMaterial, sales.markerMaterial);
  assert.notEqual(cfo.markerMaterial.color.getHex(), sales.markerMaterial.color.getHex());
  world.setState({ advisorsVisited: [] });
  assert.equal(cfo.consulted.visible, false);
  assert.equal(cfo.unread.visible, true);
  assert.equal(cfo.markerMaterial.color.getHex(), sales.markerMaterial.color.getHex());
  world.setState({ advisersEnabled: false });
  assert.ok(world.advisors.every(advisor => !advisor.group.visible));
  assert.equal(world.meetAdvisor('cfo'), false);
  assert.equal(world.nearestAdvisor(), null);
});

test('orbit consultations call the application without awarding or recording a visit themselves', t => {
  const world = makeWorld(t);
  world.camera.position.set(100, 30, 100);
  assert.equal(world.meetAdvisor('cfo'), true);
  assert.deepEqual(world.meetings, ['cfo']);
  assert.deepEqual(world.state.advisorsVisited, []);
  assert.equal(world.meetAdvisor('quality'), false, 'another building cannot be consulted through its hidden model');
  assert.equal(world.meetAdvisor('unrecognized'), false);
});

test('walking consultations require proximity and use only the current building', t => {
  const world = makeWorld(t);
  world.viewMode = 'walk';
  world.camera.position.set(0, 2.1, 7.4);
  assert.equal(world.meetAdvisor('cfo'), false);
  const cfo = world.advisors.find(advisor => advisor.id === 'cfo');
  world.camera.position.set(cfo.x, 2.1, cfo.z + 2.5);
  assert.equal(world.nearestAdvisor().id, 'cfo');
  world.keys.add('KeyW');
  assert.equal(world.meetAdvisor('cfo'), true);
  assert.equal(world.keys.size, 0, 'opening a briefing stops movement');
  world.camera.position.z = cfo.z + 2.7;
  assert.equal(world.meetAdvisor('cfo'), false);
  assert.deepEqual(world.meetings, ['cfo']);
});

test('finding a person switches buildings and approaches without automatically granting a briefing', t => {
  const world = makeWorld(t);
  world.viewMode = 'walk';
  assert.equal(world.focusAdvisor('quality'), true);
  assert.equal(world.location, 'factory');
  const advisor = world.advisors.find(person => person.id === 'quality');
  assert.equal(world.transition.target.x, advisor.x);
  assert.equal(world.transition.target.z, advisor.z);
  assert.ok(Math.hypot(world.transition.position.x - advisor.x, world.transition.position.z - advisor.z) < 2.6);
  assert.deepEqual(world.meetings, []);
  assert.equal(world.focusAdvisor('unknown'), false);
});

test('world hints distinguish approach, consultation and already consulted status without repeated DOM updates', t => {
  const world = makeWorld(t);
  world.viewMode = 'walk';
  const cfo = world.advisors.find(person => person.id === 'cfo');
  world.camera.position.set(cfo.x, 2.1, cfo.z + 3.1);
  world.updateAdvisorHint();
  assert.deepEqual(world.hints.at(-1), { id: 'cfo', label: 'CFO', distance: 3, nearby: false, visited: false, walk: true });
  const count = world.hints.length;
  world.updateAdvisorHint();
  assert.equal(world.hints.length, count);
  world.camera.position.z = cfo.z + 2.5;
  world.updateAdvisorHint();
  assert.equal(world.hints.at(-1).nearby, true);
  world.setState({ advisorsVisited: ['cfo'] });
  assert.equal(world.hints.at(-1).visited, true);
  world.setState({ advisersEnabled: false });
  assert.equal(world.hints.at(-1), null);
});

test('ray picking ignores disabled advisers while retaining existing work-area targets', t => {
  const world = makeWorld(t);
  world.pointer = new THREE.Vector2();
  world.renderer = { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } };
  let selectedTargets;
  world.raycaster = { setFromCamera() {}, intersectObjects(targets) { selectedTargets = targets; return []; } };
  const workArea = { userData: { inspectId: 'boardroom', location: 'headquarters' } };
  world.clickTargets.push(workArea);
  world.pick({ clientX: 50, clientY: 50 });
  assert.equal(selectedTargets.length, 4);
  assert.ok(selectedTargets.includes(workArea));
  world.setState({ advisersEnabled: false });
  world.pick({ clientX: 50, clientY: 50 });
  assert.deepEqual(selectedTargets, [workArea]);
});

test('E consults a nearby adviser once and cannot open another meeting through a dialog', t => {
  const world = makeWorld(t);
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  let dialogOpen = false;
  globalThis.window = { addEventListener() {} };
  globalThis.document = { addEventListener() {}, querySelector: () => dialogOpen ? {} : null };
  t.after(() => {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  });
  world.renderer = { domElement: { addEventListener() {} } };
  world.attachEvents();
  world.viewMode = 'walk';
  const sales = world.advisors.find(person => person.id === 'sales');
  world.camera.position.set(sales.x, 2.1, sales.z + 1.5);
  let prevented = 0;
  const event = { code: 'KeyE', repeat: false, target: { tagName: 'CANVAS' }, preventDefault() { prevented++; } };
  world.onKeyDown(event);
  world.onKeyDown({ ...event, repeat: true });
  assert.deepEqual(world.meetings, ['sales']);
  assert.equal(prevented, 1);
  dialogOpen = true;
  world.onKeyDown(event);
  assert.deepEqual(world.meetings, ['sales']);
});
