import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const C = {
  ground: '#c9d2c7', floor: '#ece9de', concrete: '#bbc2bc', white: '#f3f0e6',
  ink: '#263e39', wall: '#dcded3', steel: '#45665f', steelLight: '#7d938b',
  dark: '#233630', black: '#202b29', glass: '#a7d6cf', red: '#b93432',
  blue: '#356d99', yellow: '#e7b74e', wood: '#704b37', leaf: '#6d8968',
  leafDark: '#4d705a', safety: '#e4bb62', cream: '#e1d6bd', orange: '#db8a45',
};
const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const fmt = value => Math.round(number(value)).toLocaleString('en-US');

/** The rendered world is an inspectable view of the simulation; it never advances its clock. */
export class World {
  constructor({ container, onInspect = () => {}, onLocationChange = () => {}, onReady = () => {}, onError = () => {} }) {
    this.container = container;
    this.onInspect = onInspect;
    this.onLocationChange = onLocationChange;
    this.onReady = onReady;
    this.onError = onError;
    this.state = { month: 1, cash: 0, production: 0, inventory: 0, shortage: 0, quality: 0, serviceLevel: 0, products: [] };
    this.location = 'headquarters';
    this.viewMode = 'orbit';
    this.paused = false;
    this.disposed = false;
    this.materials = new Map();
    this.geometries = new Map();
    this.textures = [];
    this.clickTargets = [];
    this.hotspots = [];
    this.animations = [];
    this.keys = new Set();
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.animationTime = 0;
    this.selected = null;
    this.hovered = null;

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;
      this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D company world. Drag to orbit, scroll to zoom, and select a station to inspect.');
      this.renderer.domElement.setAttribute('role', 'img');
      this.renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;outline:none';
      this.renderer.domElement.tabIndex = 0;
      container.appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(C.ground);
      this.scene.fog = new THREE.Fog(C.ground, 52, 110);
      this.camera = new THREE.PerspectiveCamera(39, 1, 0.1, 150);
      this.camera.position.set(23, 19, 26);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.set(0, 0.9, 0);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.075;
      this.controls.minDistance = 7;
      this.controls.maxDistance = 64;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
      this.controls.minPolarAngle = 0.12;
      this.controls.enablePan = true;
      this.controls.screenSpacePanning = false;
      this.controls.panSpeed = 0.7;
      this.controls.addEventListener('start', () => { this.transition = null; });

      this.scene.add(new THREE.HemisphereLight('#f7f6e7', '#849989', 2.5));
      const sun = new THREE.DirectionalLight('#fff0d8', 4.1);
      sun.position.set(-18, 32, 21);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 85 });
      sun.shadow.normalBias = 0.035;
      sun.shadow.bias = -0.0003;
      sun.shadow.radius = 3;
      this.scene.add(sun);
      const fill = new THREE.DirectionalLight('#d1e8eb', 1.1);
      fill.position.set(18, 12, -20);
      this.scene.add(fill);
      this.box(this.scene, [180, 0.12, 180], [0, -0.65, 0], C.ground, false);

      this.headquarters = new THREE.Group();
      this.factory = new THREE.Group();
      this.scene.add(this.headquarters, this.factory);
      this.buildHeadquarters();
      this.buildFactory();
      [...new Set([...this.animations.map(animation => animation.object), ...this.dispatchMachines])].forEach(group => this.batchStaticGeometry(group));
      this.batchStaticGeometry(this.headquarters);
      this.batchStaticGeometry(this.factory);
      this.factory.visible = false;
      this.attachEvents();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
      this.resize();
      this.renderer.setAnimationLoop(() => this.render());
      onReady();
    } catch (error) {
      onError(error);
      this.dispose();
    }
  }

  material(color, options = {}) {
    const key = `${color}:${JSON.stringify(options)}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.76, ...options }));
    return this.materials.get(key);
  }

  geometry(key, create) {
    if (!this.geometries.has(key)) this.geometries.set(key, create());
    return this.geometries.get(key);
  }

  box(parent, size, position, color, shadow = true, options = {}) {
    const mesh = new THREE.Mesh(this.geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), this.material(color, options));
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  cylinder(parent, radius, height, position, color, options = {}) {
    const mesh = new THREE.Mesh(this.geometry('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 20)), this.material(color, options));
    mesh.scale.set(radius, height, radius);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  sphere(parent, size, position, color) {
    const mesh = new THREE.Mesh(this.geometry('sphere', () => new THREE.IcosahedronGeometry(1, 1)), this.material(color));
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  line(parent, points, color, opacity = 1) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    this.geometries.set(`line-${this.geometries.size}`, geometry);
    const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    this.materials.set(`line-${this.materials.size}`, material);
    const line = new THREE.Line(geometry, material);
    parent.add(line);
    return line;
  }

  sign(parent, text, width, height, position, { background = C.ink, color = C.white, subtitle = '', rotate = 0, fontSize = 68 } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.round(1024 * height / width);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${fontSize}px Arial, sans-serif`;
    ctx.fillText(text, 512, canvas.height * (subtitle ? 0.40 : 0.52), 930);
    if (subtitle) {
      ctx.font = `${fontSize * 0.34}px Arial, sans-serif`;
      ctx.fillStyle = '#b9cdc2';
      ctx.fillText(subtitle, 512, canvas.height * 0.73, 920);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(texture);
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, side: THREE.DoubleSide });
    this.materials.set(`sign-${this.materials.size}`, material);
    const geo = new THREE.PlaneGeometry(width, height);
    this.geometries.set(`sign-${this.geometries.size}`, geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(...position);
    mesh.rotation.y = rotate;
    parent.add(mesh);
    return mesh;
  }

  tree(parent, x, z, scale = 1) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    tree.scale.setScalar(scale);
    this.cylinder(tree, 0.105, 1.65, [0, 0.85, 0], '#87745b');
    this.sphere(tree, [0.94, 1.12, 0.91], [0, 2.0, 0], C.leaf);
    this.sphere(tree, [0.69, 0.78, 0.7], [-0.35, 2.55, -0.12], C.leafDark);
    parent.add(tree);
    return tree;
  }

  planter(parent, x, z, width = 1.2) {
    this.box(parent, [width, 0.5, 0.7], [x, 0.25, z], '#c3c7b7');
    this.box(parent, [width * 0.9, 0.05, 0.58], [x, 0.52, z], '#6c6450');
    for (let n = 0; n < 3; n++) this.sphere(parent, [0.33, 0.45 + n % 2 * 0.15, 0.29], [x - width * 0.3 + n * width * 0.3, 0.8, z], n % 2 ? C.leafDark : C.leaf);
  }

  chair(parent, x, z, rotation = 0, color = '#3e514b') {
    const chair = new THREE.Group();
    chair.position.set(x, 0.12, z);
    chair.rotation.y = rotation;
    this.box(chair, [0.62, 0.13, 0.62], [0, 0.53, 0], color);
    this.box(chair, [0.62, 0.65, 0.13], [0, 0.87, -0.28], color);
    this.cylinder(chair, 0.065, 0.45, [0, 0.27, 0], C.steelLight);
    this.box(chair, [0.65, 0.045, 0.07], [0, 0.06, 0], C.steel);
    this.box(chair, [0.07, 0.045, 0.65], [0, 0.06, 0], C.steel);
    parent.add(chair);
  }

  human(parent, x, z, rotation = 0, hiVis = true) {
    const human = new THREE.Group();
    human.position.set(x, 0.12, z);
    human.rotation.y = rotation;
    this.box(human, [0.28, 0.42, 0.2], [0, 0.76, 0], hiVis ? C.safety : '#425c60');
    this.box(human, [0.075, 0.43, 0.09], [-0.085, 0.34, 0], '#364d54');
    this.box(human, [0.075, 0.43, 0.09], [0.085, 0.34, 0.02], '#364d54');
    this.sphere(human, [0.115, 0.13, 0.11], [0, 1.10, 0], '#bc967b');
    if (hiVis) this.cylinder(human, 0.135, 0.08, [0, 1.21, 0], C.white);
    const arm = this.box(human, [0.08, 0.33, 0.085], [-0.18, 0.74, 0.03], hiVis ? C.safety : '#425c60');
    arm.rotation.z = -0.12;
    const other = this.box(human, [0.08, 0.33, 0.085], [0.18, 0.74, 0.02], hiVis ? C.safety : '#425c60');
    other.rotation.z = 0.2;
    parent.add(human);
    return human;
  }

  wheel(parent, radius, width, x, y, z, hubColor = C.cream) {
    const wheel = this.cylinder(parent, radius, width, [x, y, z], C.black);
    wheel.rotation.z = Math.PI / 2;
    const hub = this.cylinder(parent, radius * 0.53, width + 0.025, [x, y, z], hubColor, { metalness: 0.15 });
    hub.rotation.z = Math.PI / 2;
    // Paired sidewalls give the tires readable depth without expensive tread geometry.
    const wall = this.cylinder(parent, radius * 0.85, width + 0.045, [x, y, z], '#34403a');
    wall.rotation.z = Math.PI / 2;
    const cap = this.cylinder(parent, radius * 0.38, width + 0.06, [x, y, z], hubColor);
    cap.rotation.z = Math.PI / 2;
  }

  machine(parent, type = 'tractor', color = C.red, scale = 1, unfinished = false) {
    const machine = new THREE.Group();
    machine.scale.setScalar(scale);
    const long = type === 'combine';
    const loader = type === 'loader';
    this.box(machine, [1.13, 0.24, long ? 3.2 : 2.4], [0, 0.62, 0], C.dark);
    const rearZ = long ? -0.9 : -0.7;
    const frontZ = long ? 1.10 : 0.8;
    [-1, 1].forEach(side => {
      this.wheel(machine, loader ? 0.48 : 0.63, 0.34, side * 0.66, loader ? 0.5 : 0.64, rearZ, color === C.red ? '#d9cead' : C.white);
      this.wheel(machine, long ? 0.49 : loader ? 0.48 : 0.41, 0.26, side * 0.60, long ? 0.50 : loader ? 0.50 : 0.42, frontZ, C.cream);
    });
    this.box(machine, [1.12, long ? 0.78 : 0.6, long ? 2.6 : 1.36], [0, long ? 1.37 : 0.98, long ? -0.1 : 0.41], unfinished ? C.steelLight : color, true, { roughness: 0.39, metalness: 0.12 });
    if (!unfinished) {
      const cabZ = long ? 0.86 : -0.43;
      this.box(machine, [0.96, 0.87, 0.94], [0, 1.59, cabZ], C.glass, false, { transparent: true, opacity: 0.68, roughness: 0.17, metalness: 0.23 });
      this.box(machine, [1.13, 0.12, 1.09], [0, 2.07, cabZ], color);
      [-0.47, 0.47].forEach(x => [-0.45, 0.45].forEach(z => this.box(machine, [0.045, 0.9, 0.045], [x, 1.60, cabZ + z], C.dark)));
      this.box(machine, [0.43, 0.35, 0.39], [0, 1.37, cabZ - 0.10], C.black);
      this.box(machine, [1.08, 0.12, 0.7], [0, 1.31, -0.79], color);
      this.cylinder(machine, 0.045, 0.72, [0.42, 1.62, 0.46], C.dark);
      this.box(machine, [1.0, 0.3, 0.05], [0, 0.99, 1.11], '#30423c');
      for (let x = -0.3; x <= 0.3; x += 0.3) this.box(machine, [0.16, 0.12, 0.06], [x, 1.18, 1.13], '#fcf2cd', false, { emissive: '#e7d7ac', emissiveIntensity: 0.35 });
      this.box(machine, [0.2, 0.07, 0.5], [0.72, 0.59, -0.23], C.steel);
      if (long) {
        this.box(machine, [3.4, 0.34, 0.75], [0, 0.53, 2.05], color);
        this.box(machine, [3.5, 0.08, 0.12], [0, 0.35, 2.41], C.steel);
        const auger = this.cylinder(machine, 0.14, 2.0, [1.45, 1.65, -0.95], color);
        auger.rotation.z = Math.PI / 2;
        this.box(machine, [0.8, 0.23, 0.85], [0, 1.93, -0.66], color);
      }
      if (loader) {
        [-0.45, 0.45].forEach(x => {
          const arm = this.box(machine, [0.15, 0.15, 1.9], [x, 0.94, 1.4], color);
          arm.rotation.x = 0.35;
        });
        this.box(machine, [1.65, 0.45, 0.65], [0, 0.49, 2.1], color);
        this.box(machine, [1.65, 0.1, 0.9], [0, 0.27, 2.2], C.dark);
      }
    } else {
      this.box(machine, [0.85, 0.18, 0.85], [0, 1.27, -0.40], '#b4c1b6');
      this.box(machine, [0.07, 0.7, 0.07], [-0.42, 1.63, -0.78], C.steel);
      this.box(machine, [0.07, 0.7, 0.07], [0.42, 1.63, -0.78], C.steel);
    }
    parent.add(machine);
    return machine;
  }

  hotspot(parent, location, id, position, radius = 0.7) {
    const group = new THREE.Group();
    group.position.set(...position);
    const ringGeometry = this.geometry('hotspotRing', () => new THREE.RingGeometry(0.74, 1, 48));
    const material = new THREE.MeshBasicMaterial({ color: C.red, transparent: true, opacity: 0.74, side: THREE.DoubleSide, depthWrite: false });
    this.materials.set(`hotspot-${location}-${id}`, material);
    const ring = new THREE.Mesh(ringGeometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(radius);
    ring.position.y = 0.035;
    group.add(ring);
    const inner = new THREE.Mesh(this.geometry('circle', () => new THREE.CircleGeometry(1, 32)), this.material(C.white, { transparent: true, opacity: 0.84, depthWrite: false }));
    inner.scale.setScalar(radius * 0.53);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.034;
    group.add(inner);
    const dot = this.cylinder(group, radius * 0.12, 0.08, [0, 0.09, 0], C.red);
    const target = this.box(group, [radius * 2.4, 1.6, radius * 2.4], [0, 0.8, 0], C.white, false, { transparent: true, opacity: 0, depthWrite: false });
    target.userData.inspectId = id;
    target.userData.location = location;
    this.clickTargets.push(target);
    this.hotspots.push({ group, ring, dot, id, location, base: radius });
    parent.add(group);
  }

  batchStaticGeometry(root) {
    // Preserve animated/interactive groups; merge the architectural fabric by material.
    // The shared geometry cache remains untouched so independent worlds dispose cleanly.
    const excluded = new Set([
      ...this.animations.map(animation => animation.object),
      ...(this.dispatchMachines || []),
      ...this.hotspots.map(hotspot => hotspot.group),
    ]);
    const batches = new Map();
    root.updateWorldMatrix(true, true);
    const worldToLocal = root.matrixWorld.clone().invert();
    root.traverse(object => {
      if (!object.isMesh || object.material.transparent) return;
      for (let ancestor = object; ancestor && ancestor !== root; ancestor = ancestor.parent) {
        if (excluded.has(ancestor)) return;
      }
      const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(object);
    });
    batches.forEach(meshes => {
      if (meshes.length < 2) return;
      const parts = meshes.map(mesh => {
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        return geometry.applyMatrix4(worldToLocal.clone().multiply(mesh.matrixWorld));
      });
      const merged = mergeGeometries(parts, false);
      parts.forEach(part => part.dispose());
      if (!merged) return;
      this.geometries.set(`merged-${this.geometries.size}`, merged);
      const mesh = new THREE.Mesh(merged, meshes[0].material);
      mesh.castShadow = meshes[0].castShadow;
      mesh.receiveShadow = meshes[0].receiveShadow;
      meshes.forEach(source => source.removeFromParent());
      root.add(mesh);
    });
  }

  buildHeadquarters() {
    const g = this.headquarters;
    // A deliberately cut-away floor plate: boardroom, CEO office, and a double-height gallery.
    this.box(g, [24, 0.55, 18], [0, -0.28, 0], '#aebaaa');
    this.box(g, [21.7, 0.18, 15.4], [0, 0.07, -0.25], C.floor);
    this.box(g, [21.9, 0.08, 15.6], [0, -0.04, -0.25], '#fbf7e9');
    this.box(g, [22, 0.16, 1.6], [0, -0.15, 8.1], '#d3d9cb');
    this.box(g, [19, 0.14, 1.3], [0, -0.3, 9], '#dbe0d2');
    // Stone floor joints.
    for (let x = -9; x <= 9; x += 3) this.box(g, [0.015, 0.008, 15.1], [x, 0.165, -0.25], '#d3d4c8', false);
    for (let z = -6; z <= 6; z += 3) this.box(g, [21.5, 0.008, 0.015], [0, 0.165, z], '#d3d4c8', false);

    this.box(g, [21.8, 4.1, 0.25], [0, 2.20, -7.85], C.wall);
    this.box(g, [0.25, 4.1, 15.6], [-10.92, 2.20, -0.1], C.wall);
    // Thin clerestory lintels and glazed rear facade.
    this.box(g, [21.9, 0.25, 0.43], [0, 4.31, -7.75], C.white);
    this.box(g, [0.4, 0.25, 15.5], [-10.85, 4.31, -0.1], C.white);
    for (let x = -9.6; x <= 9.5; x += 2.4) {
      this.box(g, [2.21, 2.6, 0.04], [x, 2.55, -7.68], C.glass, false, { transparent: true, opacity: 0.4, roughness: 0.15 });
      this.box(g, [0.065, 3.25, 0.12], [x - 1.15, 2.35, -7.59], C.steel);
    }
    this.box(g, [21.2, 0.10, 0.14], [0, 3.92, -7.58], C.steel);
    this.box(g, [21.2, 0.10, 0.14], [0, 1.12, -7.58], C.steel);
    this.box(g, [7.7, 0.10, 5.8], [-5.2, 0.21, -2.5], '#80918b');
    // Boardroom table with rounded ends and warm walnut grain.
    this.box(g, [3.0, 0.22, 4.25], [-5.25, 1.12, -2.5], C.wood);
    [-4.63, -0.37].forEach(z => this.cylinder(g, 1.5, 0.22, [-5.25, 1.12, z], C.wood));
    this.box(g, [0.20, 0.85, 3.7], [-5.25, 0.65, -2.5], '#584231');
    for (let n = 0; n < 4; n++) {
      const z = -4.55 + n * 1.35;
      this.chair(g, -7.4, z, -Math.PI / 2);
      this.chair(g, -3.12, z, Math.PI / 2);
      this.box(g, [0.31, 0.025, 0.44], [-6.21, 1.25, z], '#dddccf', false);
      this.box(g, [0.31, 0.025, 0.44], [-4.25, 1.25, z], '#dddccf', false);
    }
    this.chair(g, -5.25, -6.48, 0);
    this.chair(g, -5.25, 1.47, Math.PI);
    this.box(g, [0.62, 0.045, 0.45], [-5.25, 1.26, -2.5], C.steel);
    this.cylinder(g, 0.16, 0.19, [-5.25, 1.34, -3.8], C.white);
    // Ceiling pendants retained in the cutaway.
    [-4.5, -1.1].forEach(z => {
      this.box(g, [0.03, 1.1, 0.03], [-5.25, 4.0, z], C.dark);
      this.box(g, [2.75, 0.12, 0.3], [-5.25, 3.45, z], C.dark);
      this.box(g, [2.60, 0.015, 0.23], [-5.25, 3.38, z], '#fff6d9', false, { emissive: '#fce7b7', emissiveIntensity: 1.1 });
    });
    // Boardroom display, designed as a purposeful in-world object.
    this.box(g, [5.2, 2.5, 0.18], [-5.25, 2.47, -7.45], C.dark);
    this.sign(g, 'CNH', 4.9, 2.2, [-5.25, 2.47, -7.34], { subtitle: 'OFFICE OF THE CHIEF EXECUTIVE', fontSize: 160 });
    this.sign(g, '01 / BOARDROOM', 3.0, 0.35, [-5.2, 0.38, 2.4], { background: C.floor, color: C.ink, fontSize: 68 }).rotation.x = -Math.PI / 2;
    // Glass separation with a clear opening to the gallery.
    [-5.0, -1.9].forEach(z => {
      this.box(g, [0.055, 3.4, 2.8], [-0.80, 1.9, z], C.glass, false, { transparent: true, opacity: 0.21, roughness: 0.12, depthWrite: false });
      this.box(g, [0.07, 3.65, 0.07], [-0.80, 2.0, z - 1.4], C.steel);
    });
    this.box(g, [0.1, 0.13, 6.0], [-0.80, 3.75, -3.45], C.steel);

    // Strategy wall and live network map.
    this.box(g, [6.4, 3.8, 0.28], [4.9, 2.12, -6.75], C.ink);
    this.sign(g, 'THE WORLD WE BUILD', 5.4, 0.62, [4.9, 3.47, -6.58], { fontSize: 58 });
    const nodes = [[2.7, 2.7], [3.5, 2.35], [4.25, 2.72], [5.2, 2.5], [6.3, 2.8], [7.0, 2.1], [4.8, 1.55], [3.25, 1.45], [6.25, 1.6]];
    const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [3, 6], [1, 7], [6, 8], [8, 5], [2, 6]];
    links.forEach(([a, b]) => this.line(g, [[nodes[a][0], nodes[a][1], -6.57], [nodes[b][0], nodes[b][1], -6.57]], '#8caba0', 0.75));
    nodes.forEach(([x, y], n) => this.sphere(g, [n % 3 === 0 ? 0.13 : 0.08, n % 3 === 0 ? 0.13 : 0.08, 0.03], [x, y, -6.54], n % 3 === 0 ? C.red : '#d0dfcc'));
    this.sign(g, 'MARKETS  /  FACILITIES  /  DEALERS', 5.3, 0.34, [4.9, 0.83, -6.57], { fontSize: 41 });
    // Showroom: Case IH red tractor on a lit stone plinth.
    this.box(g, [5.8, 0.22, 4.1], [4.1, 0.31, -0.6], '#d3d8ca');
    this.box(g, [5.72, 0.03, 4.02], [4.1, 0.44, -0.6], C.white);
    const hero = this.machine(g, 'tractor', C.red, 1.15);
    hero.position.set(4.1, 0.48, -0.5);
    hero.rotation.y = -0.62;
    this.sign(g, 'BUILT FOR WHAT’S NEXT.', 4.1, 0.48, [4.1, 0.74, 1.47], { background: C.white, color: C.ink, fontSize: 62 });
    this.box(g, [0.55, 1.2, 0.45], [7.7, 0.78, 0.4], C.steel);
    const kiosk = this.sign(g, 'OPERATIONS', 0.95, 0.61, [7.7, 1.45, 0.50], { fontSize: 80 });
    kiosk.rotation.x = -0.22;
    // Reception and lounge, with a deep red architectural identity wall.
    this.box(g, [3.8, 1.02, 0.95], [4.5, 0.67, 5.4], C.wood);
    this.box(g, [4.05, 0.12, 1.13], [4.5, 1.24, 5.4], C.white);
    this.sign(g, 'CNH', 1.6, 0.46, [4.5, 0.79, 5.89], { background: C.wood, color: C.white, fontSize: 152 });
    this.box(g, [0.5, 0.3, 0.055], [4.2, 1.45, 5.38], C.ink);
    this.box(g, [0.20, 2.7, 2.9], [9.4, 1.52, 4.7], C.red);
    this.sign(g, 'CNH', 2.1, 1.0, [9.25, 2.0, 4.7], { background: C.red, rotate: -Math.PI / 2, fontSize: 170 });
    this.box(g, [5.8, 0.025, 3.1], [-5.0, 0.19, 5.4], '#b4b8a8');
    [-6.8, -3.2].forEach(x => {
      this.box(g, [1.6, 0.40, 0.78], [x, 0.48, 5.3], '#b0a48d');
      this.box(g, [1.6, 0.45, 0.16], [x, 0.80, 4.92], '#b0a48d');
      this.box(g, [0.15, 0.40, 0.78], [x - 0.73, 0.68, 5.3], '#b0a48d');
      this.box(g, [0.15, 0.40, 0.78], [x + 0.73, 0.68, 5.3], '#b0a48d');
    });
    this.cylinder(g, 0.64, 0.10, [-5.0, 0.62, 5.8], C.wood);
    this.cylinder(g, 0.16, 0.45, [-5.0, 0.34, 5.8], C.dark);
    this.human(g, 5.8, 4.75, -0.5, false);
    this.human(g, -8.8, -4.6, 1, false);
    this.planter(g, -9.5, 6.4, 1.5);
    this.planter(g, 9.6, -5.5, 1.2);
    this.planter(g, 0.1, 4.1, 1.3);
    // Campus landscape: planters, trees, paving and shallow reflecting pool.
    [-8, -4, 0, 4, 8].forEach(x => this.box(g, [3.4, 0.035, 1.1], [x, -0.41, 10.4], '#d7dccc'));
    this.box(g, [4.8, 0.08, 1.7], [9.3, -0.37, 10.3], '#8caea3');
    this.box(g, [4.5, 0.02, 1.4], [9.3, -0.32, 10.3], '#b1d0c1', false, { metalness: 0.45, roughness: 0.1 });
    [[-13.4, -6], [-13.1, 0], [-13.1, 6.4], [13.3, -6.5], [13.1, 1], [12.5, 6.6], [-8.5, 11.8], [4, -11.3], [-6, -11.4]].forEach(([x, z], i) => this.tree(g, x, z, 1 + i % 3 * 0.18));
    this.hotspot(g, 'headquarters', 'boardroom', [-1.7, 0.19, 2.0], 0.55);
    this.hotspot(g, 'headquarters', 'assembly', [7.65, 0.19, 2.6], 0.55);
    this.hotspot(g, 'headquarters', 'dispatch', [3.65, 0.19, -4.7], 0.5);
  }

  pallet(parent, x, z, stack = 1, color = '#b39b73') {
    this.box(parent, [1.25, 0.14, 1.0], [x, 0.22, z], '#9e8863');
    for (let n = 0; n < stack; n++) {
      this.box(parent, [1.13, 0.5, 0.87], [x, 0.54 + n * 0.51, z], color);
      this.box(parent, [0.055, 0.51, 0.88], [x - 0.32, 0.54 + n * 0.51, z], '#d3c2a2');
      this.box(parent, [0.055, 0.51, 0.88], [x + 0.32, 0.54 + n * 0.51, z], '#d3c2a2');
    }
  }

  forklift(parent, x, z) {
    const forklift = new THREE.Group();
    forklift.position.set(x, 0.15, z);
    this.box(forklift, [0.9, 0.5, 1.25], [0, 0.48, 0], C.safety);
    [-0.48, 0.48].forEach(s => [-0.4, 0.4].forEach(d => this.wheel(forklift, 0.23, 0.18, s, 0.24, d, C.dark)));
    [-0.37, 0.37].forEach(s => {
      this.box(forklift, [0.07, 1.2, 0.07], [s, 1.15, -0.3], C.dark);
      this.box(forklift, [0.09, 1.6, 0.08], [s, 0.9, 0.70], C.dark);
      this.box(forklift, [0.12, 0.06, 0.94], [s, 0.17, 1.1], C.steel);
    });
    this.box(forklift, [0.88, 0.10, 1.08], [0, 1.78, 0.1], C.safety);
    this.box(forklift, [0.38, 0.45, 0.39], [0, 0.9, -0.15], C.dark);
    parent.add(forklift);
    return forklift;
  }

  buildFactory() {
    const g = this.factory;
    this.box(g, [37, 0.48, 32], [0, -0.29, 1], '#adb9ad');
    this.box(g, [30.5, 0.2, 22.5], [-0.25, 0.03, -2.1], '#d2d5c8');
    this.box(g, [35, 0.08, 8.4], [0, -0.05, 13.1], '#9caea3');
    this.box(g, [0.24, 7.4, 22.3], [-15.4, 3.8, -2.1], C.wall);
    this.box(g, [30.7, 7.4, 0.24], [-0.2, 3.8, -13.35], C.wall);
    this.box(g, [30.6, 0.55, 0.35], [-0.2, 7.26, -13.15], C.steel);
    this.box(g, [0.4, 0.55, 22.5], [-15.3, 7.26, -2.1], C.steel);
    // Repeated clerestory panes give the workshop a real industrial scale.
    for (let x = -13.5; x < 14; x += 3.4) {
      this.box(g, [3.1, 1.6, 0.06], [x, 5.55, -13.19], '#a8c6bc', false, { metalness: 0.15, roughness: 0.25 });
      this.box(g, [0.10, 1.68, 0.10], [x, 5.55, -13.1], C.steel);
      this.box(g, [3.2, 0.08, 0.11], [x, 5.55, -13.1], C.steel);
    }
    for (let x = -15; x <= 15; x += 6) {
      this.box(g, [0.30, 6.9, 0.30], [x, 3.6, -12.9], C.steel);
      this.box(g, [0.52, 0.38, 0.52], [x, 0.29, -12.9], '#879e90');
    }
    [-8, -1.5, 5].forEach(z => {
      this.box(g, [0.3, 6.8, 0.3], [-15.0, 3.5, z], C.steel);
      this.box(g, [1.3, 0.12, 0.6], [-14.8, 5.9, z], C.steel);
    });
    this.sign(g, 'CNH  /  INDUSTRIAL OPERATIONS', 13.2, 1.1, [0.1, 4.0, -13.15], { background: C.wall, color: C.ink, fontSize: 56 });
    this.sign(g, '01   INBOUND', 4.1, 0.65, [-10.4, 2.8, -13.15], { background: C.ink, fontSize: 72 });
    this.sign(g, 'BUILD QUALITY. EVERY MACHINE.', 7.3, 0.57, [8.6, 2.8, -13.15], { background: C.wall, color: C.ink, fontSize: 58 });
    // Aisles and work-cell floors.
    this.box(g, [2.5, 0.012, 20.2], [-6.9, 0.142, -2.3], '#a9b9aa', false);
    this.box(g, [27.3, 0.012, 2.3], [-0.1, 0.142, 3.7], '#a9b9aa', false);
    [-8.3, -5.5].forEach(x => this.box(g, [0.065, 0.018, 19.8], [x, 0.15, -2.4], C.safety, false));
    [2.4, 5.0].forEach(z => this.box(g, [27.6, 0.018, 0.065], [-0.1, 0.15, z], C.safety, false));
    for (let z = -10; z < 7; z += 2) this.box(g, [0.09, 0.02, 0.7], [-6.9, 0.16, z], C.white, false);
    for (let x = -4; x < 14; x += 3) this.box(g, [0.9, 0.02, 0.10], [x, 0.16, 3.7], C.white, false);
    this.box(g, [10.2, 0.02, 13.4], [0.6, 0.15, -4.8], '#bec9bc', false);
    this.box(g, [6.6, 0.02, 7.0], [10.4, 0.15, -6.2], '#b2c7b7', false);
    this.box(g, [6.6, 0.02, 3.5], [10.4, 0.15, -0.65], '#cec7a7', false);
    // Storage racks: steel uprights, palletized components, upper bins.
    [-12.5, -9.65].forEach((x, row) => {
      [-9.6, -5.8, -2.0].forEach((z, bay) => {
        [-0.85, 0.85].forEach(dx => [-1.4, 1.4].forEach(dz => this.box(g, [0.09, 3.6, 0.09], [x + dx, 1.95, z + dz], C.blue)));
        [0.25, 1.85, 3.5].forEach(y => this.box(g, [1.85, 0.12, 3.0], [x, y, z], '#d28c54'));
        this.pallet(g, x, z - 0.67, 2, row % 2 ? '#a8b4a6' : '#bbaa88');
        this.pallet(g, x, z + 0.7, 1, '#bbaa88');
        this.box(g, [1.2, 0.9, 1.05], [x, 2.38, z - 0.7], '#acb5a2');
        this.box(g, [1.2, 0.7, 1.05], [x, 2.28, z + 0.7], '#bda886');
      });
    });
    this.pallet(g, -12, 5.9, 2);
    this.pallet(g, -10.3, 6.0, 1);
    const forklift = this.forklift(g, -6.9, -4.0);
    this.animations.push({ type: 'forklift', object: forklift, baseX: -6.9, baseZ: -4.0 });
    // Main assembly conveyor, with steel chassis rail and repeated roller slats.
    [0, 3.2].forEach(x => {
      this.box(g, [2.65, 0.34, 11.2], [x, 0.37, -5.0], C.steel);
      this.box(g, [2.5, 0.035, 11.0], [x, 0.56, -5.0], '#7c8f81');
      for (let z = -10.0; z <= 0; z += 0.48) this.box(g, [2.45, 0.035, 0.1], [x, 0.59, z], '#a7b7aa', false);
      [-1.3, 1.3].forEach(dx => this.box(g, [0.07, 0.19, 11.2], [x + dx, 0.56, -5.0], C.safety));
    });
    this.assemblyMachines = [];
    const machineSpecs = [
      [0, -8.6, C.red, true], [0, -4.4, C.red, false], [0, -0.3, C.red, false],
      [3.2, -8.8, C.blue, true], [3.2, -4.5, C.blue, false], [3.2, -0.2, C.blue, false],
    ];
    machineSpecs.forEach(([x, z, color, unfinished], i) => {
      const machine = this.machine(g, 'tractor', color, 0.90, unfinished);
      machine.position.set(x, 0.60, z);
      this.assemblyMachines.push(machine);
      this.animations.push({ type: 'assembly', object: machine, baseZ: z, index: i });
    });
    // Overhead gantry remains visible with the roof removed.
    [-4.2, 6.5].forEach(x => {
      [-10.8, 0.8].forEach(z => {
        this.box(g, [0.22, 5.6, 0.22], [x, 2.95, z], C.safety);
        this.box(g, [0.55, 0.15, 0.55], [x, 0.24, z], C.steel);
      });
      this.box(g, [0.22, 0.35, 12.3], [x, 5.80, -5.0], C.safety);
    });
    this.box(g, [10.9, 0.36, 0.32], [1.1, 5.8, -6.6], C.safety);
    this.box(g, [1.12, 0.42, 0.75], [1.3, 5.60, -6.6], C.steel);
    this.box(g, [0.045, 1.9, 0.045], [1.3, 4.46, -6.6], C.dark);
    this.box(g, [0.26, 0.22, 0.20], [1.3, 3.44, -6.6], C.safety);
    this.sign(g, '02   ASSEMBLY', 4.0, 0.53, [1.0, 5.4, 0.86], { background: C.safety, color: C.dark, fontSize: 68 });
    // Workbenches, tool drawers and workers beside the flow.
    [-8.4, -3.7, 0].forEach((z, i) => {
      this.box(g, [1.0, 0.95, 1.7], [-3.6, 0.65, z], C.blue);
      this.box(g, [1.12, 0.12, 1.85], [-3.6, 1.18, z], '#b5b5a2');
      for (let n = 0; n < 3; n++) this.box(g, [0.6, 0.03, 0.04], [-3.6, 0.50 + n * 0.22, z + 0.86], '#c3d0c5');
      this.human(g, -2.4, z + 0.2, -Math.PI / 2);
    });
    this.human(g, 4.9, -4.3, Math.PI / 2);
    this.human(g, -11.8, 3.1, 0.3);
    // Quality / rework cells: a finished loader and a queued tractor.
    for (let z = -8.6; z < -3; z += 1.7) this.box(g, [6.0, 0.025, 0.06], [10.4, 0.19, z], C.white, false);
    const qualityMachine = this.machine(g, 'loader', C.yellow, 1.07);
    qualityMachine.position.set(10.4, 0.17, -6.7);
    qualityMachine.rotation.y = 0.2;
    this.box(g, [0.15, 2.7, 0.15], [7.6, 1.5, -8.6], C.steel);
    this.sign(g, '03  QUALITY', 2.7, 0.62, [8.3, 2.9, -8.5], { background: C.ink, fontSize: 72 });
    this.box(g, [0.7, 1.2, 0.58], [13.5, 0.75, -5.5], C.steel);
    this.sign(g, 'PASS', 0.65, 0.35, [13.5, 1.45, -5.19], { background: '#6a9b7d', fontSize: 120 });
    this.human(g, 12.3, -4.9, -1.0);
    const rework = this.machine(g, 'tractor', C.blue, 0.87, true);
    rework.position.set(10.2, 0.17, -0.6);
    rework.rotation.y = Math.PI / 2;
    this.box(g, [1.35, 0.55, 0.75], [13.0, 0.45, -0.1], C.red);
    this.sign(g, 'REWORK', 2.1, 0.43, [11.2, 0.2, 1.1], { background: '#cec7a7', color: C.ink, fontSize: 90 }).rotation.x = -Math.PI / 2;
    // Dispatch yard. Equipment quantities become visible from the simulation state.
    this.dispatchMachines = [];
    [[-3.8, 8], [0, 8], [3.8, 8], [7.6, 8], [11.4, 8]].forEach(([x, z], i) => {
      this.box(g, [2.9, 0.016, 0.07], [x, 0.152, z + 1.6], C.white, false);
      this.box(g, [0.06, 0.016, 3.3], [x - 1.5, 0.152, z], C.white, false);
      const machine = this.machine(g, i === 4 ? 'combine' : 'tractor', i % 2 === 0 ? C.red : C.blue, i === 4 ? 0.87 : 0.91);
      machine.position.set(x, 0.16, z);
      this.dispatchMachines.push(machine);
    });
    this.box(g, [8.0, 0.025, 0.11], [0.8, 0.15, 10.5], C.safety, false);
    this.sign(g, '04   DISPATCH', 4.9, 0.65, [-2.0, 0.19, 11.2], { background: '#9caea3', color: C.ink, fontSize: 88 }).rotation.x = -Math.PI / 2;
    // Semi trailer parked on the drive, equipment carrier with clear axle detail.
    const truck = new THREE.Group();
    truck.position.set(6.0, -0.015, 13.8);
    truck.rotation.y = Math.PI / 2;
    this.box(truck, [2.15, 0.35, 7.3], [0, 0.78, -1.3], C.steel);
    this.box(truck, [2.2, 0.12, 7.4], [0, 0.98, -1.3], '#a9b8a8');
    this.box(truck, [2.0, 1.5, 1.8], [0, 1.42, 3.2], C.white);
    this.box(truck, [1.85, 0.54, 0.05], [0, 1.80, 4.12], C.glass, false, { roughness: 0.20 });
    this.box(truck, [2.0, 0.22, 0.2], [0, 0.88, 4.15], C.dark);
    [-1.03, 1.03].forEach(x => [-3.9, -2.8, 1.3, 3.3].forEach(z => this.wheel(truck, 0.43, 0.3, x, 0.45, z, '#b9c5b9')));
    const load = this.machine(truck, 'tractor', C.red, 0.91);
    load.position.set(0, 1.06, -1.5);
    g.add(truck);
    this.human(g, 9.0, 11.0, 0.8);
    // Bollards and landscaping bring the yard into the same campus.
    [-13, -8, -3, 2, 7, 12].forEach(x => {
      this.cylinder(g, 0.10, 0.9, [x, 0.43, 16.3], C.safety);
      this.cylinder(g, 0.106, 0.19, [x, 0.66, 16.3], C.dark);
    });
    [[-19, -11], [-19, -4], [-19, 5], [19, -9], [19, -1], [19, 8], [-13, 18], [-5, 18], [16, 18]].forEach(([x, z], i) => this.tree(g, x, z, 1.25 + i % 2 * 0.25));
    this.hotspot(g, 'factory', 'supply', [-9.8, 0.19, 3.7], 0.72);
    this.hotspot(g, 'factory', 'assembly', [0.4, 0.19, 3.7], 0.72);
    this.hotspot(g, 'factory', 'quality', [10.5, 0.19, 3.7], 0.72);
    this.hotspot(g, 'factory', 'dispatch', [-6.4, 0.19, 9.4], 0.72);
  }

  inspection(id) {
    const s = this.state;
    const products = Array.isArray(s.products) ? s.products : [];
    const sum = field => products.reduce((total, product) => total + number(product[field]), 0);
    const completed = sum('completed') || number(s.production);
    const shortage = sum('shortage') || number(s.shortage);
    const inventory = sum('finishedGoods') || number(s.inventory);
    const percent = n => `${number(n) > 1 ? number(n).toFixed(1) : (number(n) * 100).toFixed(1)}%`;
    const inspections = {
      boardroom: { id, title: 'The boardroom', subtitle: 'HEADQUARTERS · EXECUTIVE DECISIONS', description: 'Set the operating plan, compare its forecast, and commit the month. Every decision carries through to your factories, dealers, and cash position.', metrics: [{ label: 'Campaign month', value: fmt(s.month) }, { label: 'Cash position', value: `$${number(s.cash).toLocaleString('en-US', { maximumFractionDigits: 1 })}m` }] },
      supply: { id, title: 'Inbound & supply', subtitle: 'FACTORY · MATERIAL FLOW', description: 'Purchased components arrive here before assembly. Missing kits constrain production; supplier resilience and inventory policies determine how quickly the line can respond.', metrics: [{ label: 'Units constrained', value: fmt(shortage) }, { label: 'Work in progress', value: fmt(sum('wip')) }] },
      assembly: { id, title: 'The assembly floor', subtitle: 'FACTORY · PRODUCTION', description: 'Tractors and construction equipment move from chassis to finished machines. Production targets compete for available parts, labor, and line capacity.', metrics: [{ label: 'Units completed', value: fmt(completed) }, { label: 'Monthly capacity', value: fmt(sum('capacity')) }] },
      quality: { id, title: 'Quality & rework', subtitle: 'FACTORY · CUSTOMER CONFIDENCE', description: 'Inspection catches defects before shipment. Quality investment reduces rework and future warranty exposure; overloaded operations can damage both delivery and reputation.', metrics: [{ label: 'Quality', value: percent(s.quality) }, { label: 'Service level', value: percent(s.serviceLevel) }] },
      dispatch: { id, title: this.location === 'headquarters' ? 'The company network' : 'The dispatch yard', subtitle: this.location === 'headquarters' ? 'HEADQUARTERS · MARKETS & DEALERS' : 'FACTORY · FINISHED EQUIPMENT', description: 'Completed machines wait for dealer allocation and shipment. Dealer shipments and customer purchases are separate events: growing inventory can tie up cash even when production looks strong.', metrics: [{ label: 'Finished equipment', value: fmt(inventory) }, { label: 'Service level', value: percent(s.serviceLevel) }] },
    };
    return inspections[id] || inspections.boardroom;
  }

  setState(next = {}) {
    this.state = { ...this.state, ...next };
    const products = Array.isArray(this.state.products) ? this.state.products : [];
    const units = products.reduce((n, p) => n + number(p.finishedGoods), 0) || number(this.state.inventory);
    // Visual inventory is representative; exact unit counts live in the inspection panel.
    const visibleCount = units <= 0 ? 0 : clamp(Math.ceil(units / 100), 1, 5);
    this.dispatchMachines?.forEach((machine, i) => { machine.visible = i < visibleCount; });
    if (this.selected) this.onInspect(this.inspection(this.selected));
  }

  setLocation(location) {
    if (!this.scene || this.disposed) return;
    const next = location === 'factory' ? 'factory' : 'headquarters';
    this.location = next;
    this.selected = null;
    this.headquarters.visible = next === 'headquarters';
    this.factory.visible = next === 'factory';
    this.hovered = null;
    const wide = this.camera.aspect < 1.1 ? 1.18 : 1;
    const position = next === 'factory' ? new THREE.Vector3(32 * wide, 28 * wide, 35 * wide) : new THREE.Vector3(23 * wide, 19 * wide, 26 * wide);
    const target = next === 'factory' ? new THREE.Vector3(0, 0.9, 0) : new THREE.Vector3(0, 0.9, 0);
    if (this.viewMode === 'walk') {
      position.set(next === 'factory' ? 0 : 0.2, 2.1, next === 'factory' ? 14 : 7.4);
      target.set(position.x, 1.9, position.z - 5);
    }
    this.moveCamera(position, target);
    this.onLocationChange(next);
  }

  focus(id) {
    if (!this.camera || this.disposed) return;
    const hq = id === 'boardroom';
    if (hq && this.location !== 'headquarters') this.setLocation('headquarters');
    if (!hq && this.location !== 'factory') this.setLocation('factory');
    const targets = { boardroom: [-5.1, 0.8, -2.2], supply: [-10.8, 0.9, -4], assembly: [1.1, 1.0, -4.6], quality: [10.1, 0.8, -4.2], dispatch: [3.2, 0.6, 9.4] };
    const target = new THREE.Vector3(...(targets[id] || targets.boardroom));
    const offset = this.viewMode === 'walk' ? new THREE.Vector3(3.0, 1.4, 5.0) : new THREE.Vector3(9.2, 9.4, 12.5);
    this.moveCamera(target.clone().add(offset), target);
    this.selected = id;
    this.onInspect(this.inspection(id));
  }

  moveCamera(position, target) {
    this.transition = { fromPosition: this.camera.position.clone(), fromTarget: this.controls.target.clone(), position, target, time: 0 };
  }

  setViewMode(mode) {
    if (!this.controls) return;
    const next = mode === 'walk' ? 'walk' : 'orbit';
    if (next === this.viewMode) return;
    this.viewMode = next;
    this.keys.clear();
    this.controls.enablePan = next !== 'walk';
    this.controls.minDistance = next === 'walk' ? 0.8 : 7;
    this.controls.maxPolarAngle = next === 'walk' ? Math.PI * 0.76 : Math.PI / 2 - 0.04;
    this.controls.minPolarAngle = next === 'walk' ? Math.PI * 0.24 : 0.12;
    this.setLocation(this.location);
  }

  setPaused(paused) { this.paused = Boolean(paused); }

  attachEvents() {
    const canvas = this.renderer.domElement;
    this.onContextLost = event => { event.preventDefault(); this.onError(new Error('The 3D view lost its graphics context. Reload the page to restore it.')); };
    this.onPointerDown = event => { this.pointerStart = { x: event.clientX, y: event.clientY }; };
    this.onPointerMove = event => {
      if (this.disposed) return;
      const hit = this.pick(event);
      this.hovered = hit?.object.userData.inspectId || null;
      canvas.style.cursor = this.hovered ? 'pointer' : this.viewMode === 'walk' ? 'move' : 'grab';
    };
    this.onPointerUp = event => {
      if (!this.pointerStart || Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 6) return;
      const hit = this.pick(event);
      if (hit) {
        const id = hit.object.userData.inspectId;
        this.selected = id;
        this.onInspect(this.inspection(id));
      }
    };
    this.onKeyDown = event => {
      if (this.viewMode !== 'walk' || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName) || event.target?.isContentEditable) {
        this.keys.clear();
        return;
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) this.keys.add(event.code);
    };
    this.onKeyUp = event => this.keys.delete(event.code);
    this.onBlur = () => this.keys.clear();
    this.onVisibility = () => { if (document.hidden) this.keys.clear(); };
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.clickTargets.filter(mesh => mesh.userData.location === this.location), false)[0];
  }

  resize() {
    if (!this.renderer || !this.camera || this.disposed) return;
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    // The desktop briefing occupies the left of the canvas; compose the world beside it.
    if (width >= 1000) this.camera.setViewOffset(width, height, -Math.min(180, width * 0.145), 0, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render() {
    if (this.disposed) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused && !document.hidden) this.animationTime += delta;
    const t = this.animationTime;
    if (this.transition) {
      this.transition.time += delta;
      const p = clamp(this.transition.time / 1.05, 0, 1);
      const eased = p * p * (3 - 2 * p);
      this.camera.position.lerpVectors(this.transition.fromPosition, this.transition.position, eased);
      this.controls.target.lerpVectors(this.transition.fromTarget, this.transition.target, eased);
      if (p >= 1) this.transition = null;
    }
    if (this.keys.size && (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable)) this.keys.clear();
    if (this.viewMode === 'walk' && this.keys.size && !this.transition) {
      const forward = this.controls.target.clone().sub(this.camera.position);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
      const movement = new THREE.Vector3();
      if (this.keys.has('KeyW')) movement.add(forward);
      if (this.keys.has('KeyS')) movement.sub(forward);
      if (this.keys.has('KeyD')) movement.add(right);
      if (this.keys.has('KeyA')) movement.sub(right);
      const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 7 : 3.5;
      movement.normalize().multiplyScalar(delta * speed);
      const next = this.camera.position.clone().add(movement);
      const bounds = this.location === 'factory' ? 23 : 16;
      if (Math.abs(next.x) < bounds && Math.abs(next.z) < bounds) {
        this.camera.position.add(movement);
        this.controls.target.add(movement);
      }
    }
    if (this.location === 'factory') {
      this.animations.forEach(animation => {
        if (animation.type === 'forklift') {
          animation.object.position.z = animation.baseZ + Math.sin(t * 0.18) * 5.3;
          animation.object.rotation.y = Math.cos(t * 0.18) < 0 ? Math.PI : 0;
        } else if (animation.type === 'assembly') {
          const shortage = number(this.state.shortage);
          animation.object.position.z = animation.baseZ + Math.sin(t * 0.12 + animation.index * 0.25) * (shortage > 0 ? 0.07 : 0.20);
        }
      });
    }
    this.hotspots.forEach(hotspot => {
      if (hotspot.location !== this.location) return;
      const active = hotspot.id === this.selected || hotspot.id === this.hovered;
      const pulse = active ? 1.08 + Math.sin(t * 3) * 0.04 : 1 + Math.sin(t * 1.6) * 0.03;
      hotspot.ring.scale.setScalar(hotspot.base * pulse);
      hotspot.ring.material.opacity = active ? 1 : 0.68;
      hotspot.dot.position.y = active ? 0.16 : 0.09;
    });
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer?.setAnimationLoop(null);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    const canvas = this.renderer?.domElement;
    if (canvas) {
      canvas.removeEventListener('webglcontextlost', this.onContextLost);
      canvas.removeEventListener('pointerdown', this.onPointerDown);
      canvas.removeEventListener('pointermove', this.onPointerMove);
      canvas.removeEventListener('pointerup', this.onPointerUp);
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.textures.forEach(texture => texture.dispose());
    this.renderer?.dispose();
    canvas?.remove();
  }
}

export default World;
