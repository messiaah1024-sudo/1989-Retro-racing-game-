import * as THREE from 'three';
import { ArcadeAudio } from './audio';
import { DIFFICULTIES, TOTAL_LAPS, type Car, type Control, type GamePhase, type RaceResult, type RaceSnapshot, type Settings, type Track } from './data';

const SEGMENT = 200;
const BASE_SEGMENTS = 900;
const ROAD_WIDTH = 2000;
const HALF_ROAD = ROAD_WIDTH / 2;
const PLAYER_LATERAL = 1.05;

interface Rival { distance: number; lane: number; speed: number; group: THREE.Group | null; brakeMat: THREE.MeshStandardMaterial | null }
interface PathPoint { x: number; z: number; tx: number; tz: number }

function buildPath(track: Track, count: number): { points: PathPoint[]; length: number } {
  const turns = track.turns;
  const curve = track.curve;
  const f1 = Math.max(2, Math.round(turns / 5));
  const f2 = f1 + 3;
  const a1 = curve * 0.15;
  const a2 = curve * 0.055;
  const R0 = (SEGMENT * count) / (Math.PI * 2);
  const D = 8192;
  const px = new Float64Array(D + 1);
  const pz = new Float64Array(D + 1);
  for (let j = 0; j <= D; j++) {
    const th = (j / D) * Math.PI * 2;
    const r = R0 * (1 + a1 * Math.sin(f1 * th) + a2 * Math.sin(f2 * th + 1.3));
    px[j] = r * Math.cos(th);
    pz[j] = r * Math.sin(th);
  }
  const cum = new Float64Array(D + 1);
  for (let j = 1; j <= D; j++) cum[j] = cum[j - 1] + Math.hypot(px[j] - px[j - 1], pz[j] - pz[j - 1]);
  const total = cum[D];
  const points: PathPoint[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / count) * total;
    while (j < D && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const f = (target - cum[j]) / seg;
    points.push({ x: px[j] + (px[j + 1] - px[j]) * f, z: pz[j] + (pz[j + 1] - pz[j]) * f, tx: 0, tz: 0 });
  }
  for (let i = 0; i < count; i++) {
    const a = points[(i - 1 + count) % count];
    const b = points[(i + 1) % count];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    points[i].tx = dx / l;
    points[i].tz = dz / l;
  }
  return { points, length: SEGMENT * count };
}

function buildCarMesh(color: string): { group: THREE.Group; brakeMat: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#14121d', roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: '#0e1a26', roughness: 0.15, metalness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(196, 62, 440), paint);
  body.position.y = 62;
  group.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(170, 22, 150), paint);
  hood.position.set(0, 102, 120);
  group.add(hood);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(148, 56, 190), glass);
  cabin.position.set(0, 118, -28);
  group.add(cabin);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(190, 10, 46), dark);
  spoiler.position.set(0, 118, -205);
  group.add(spoiler);
  for (const [wx, wz] of [[-100, 148], [100, 148], [-100, -150], [100, -150]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 30, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 40, wz);
    group.add(wheel);
  }
  const brakeMat = new THREE.MeshStandardMaterial({ color: '#30060c', emissive: '#ff2a44', emissiveIntensity: 1.6 });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(176, 16, 10), brakeMat);
  tail.position.set(0, 74, -222);
  group.add(tail);
  const head = new THREE.Mesh(new THREE.BoxGeometry(150, 14, 10), new THREE.MeshStandardMaterial({ color: '#4a4020', emissive: '#ffe9b0', emissiveIntensity: 1.8 }));
  head.position.set(0, 74, 222);
  group.add(head);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(120, 6, 300), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, transparent: true, opacity: 0.4 }));
  glow.position.set(0, 8, 0);
  group.add(glow);
  return { group, brakeMat };
}

interface EngineOptions {
  car: Car;
  track: Track;
  settings: Settings;
  onSnapshot: (snapshot: RaceSnapshot) => void;
  onPhase: (phase: GamePhase) => void;
  onFinish: (result: RaceResult) => void;
}

export class Engine3D {
  private canvas: HTMLCanvasElement;
  private options: EngineOptions;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(68, 2.5, 10, 90000);
  private playerGroup = new THREE.Group();
  private playerBrakeMat: THREE.MeshStandardMaterial | null = null;
  private boostFlames: THREE.Group | null = null;
  private rivals: Rival[] = [];
  private path: { points: PathPoint[]; length: number };
  private audio = new ArcadeAudio();
  private observer: ResizeObserver;
  private frame = 0;
  private previousTime = 0;
  private lastSnapshot = 0;
  private alive = true;
  private visible = true;
  private phase: GamePhase = 'intro';
  private controls = new Set<Control>();
  private sceneTime = 0;
  private cameraPos = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  private speed = 0;
  private distance = 0;
  private playerX = 0;
  private steering = 0;
  private elapsed = 0;
  private lapStarted = 0;
  private bestLap = Infinity;
  private currentLap = 1;
  private nitro = 100;
  private boostDepleted = false;
  private topSpeed = 0;
  private score = 0;
  private countdown = 3;
  private lastCount = 3;
  private collision = 0;
  private boosting = false;
  private wasBoosting = false;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.canvas = canvas;
    this.options = options;
    this.path = buildPath(options.track, this.segmentCount);
    this.audio.setEnabled(options.settings.sound);
    this.buildScene();
    this.createRivals();

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      this.renderer.setSize(canvas.clientWidth || 1024, canvas.clientHeight || 410, false);
    } catch {
      this.renderer = null; // WebGL unavailable: simulation and HUD keep running.
    }

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.emit();
    this.frame = requestAnimationFrame(this.tick);
  }

  private get segmentCount() { return Math.round(BASE_SEGMENTS * parseFloat(this.options.track.distance) / 6.4); }
  private get trackLength() { return SEGMENT * this.segmentCount; }
  private get maxSpeed() { return 10500 * this.options.car.topSpeed / 288; }
  private get timeLimit() { return DIFFICULTIES.find(d => d.id === this.options.settings.difficulty)!.time * parseFloat(this.options.track.distance) / 6.4; }
  private get position() { return 1 + this.rivals.filter(r => r.distance > this.distance).length; }

  // ---------- world helpers ----------
  private pointAt(distance: number, out: PathPoint) {
    const { points, length } = this.path;
    const count = points.length;
    const s = ((distance % length) + length) % length;
    const i = Math.floor(s / SEGMENT) % count;
    const f = (s - i * SEGMENT) / SEGMENT;
    const a = points[i];
    const b = points[(i + 1) % count];
    out.x = a.x + (b.x - a.x) * f;
    out.z = a.z + (b.z - a.z) * f;
    out.tx = a.tx + (b.tx - a.tx) * f;
    out.tz = a.tz + (b.tz - a.tz) * f;
  }

  private p: PathPoint = { x: 0, z: 0, tx: 0, tz: 1 };

  // ---------- scene ----------
  private buildScene() {
    const track = this.options.track;
    this.scene.fog = new THREE.Fog(new THREE.Color(track.sky[2]), 4000, 30000);

    // Panoramic pixel-art backdrop as the sky.
    const image = new Image();
    image.onload = () => {
      const skyCanvas = document.createElement('canvas');
      skyCanvas.width = 2048;
      skyCanvas.height = 1024;
      const skyCtx = skyCanvas.getContext('2d')!;
      skyCtx.drawImage(image, 0, 0, image.width * 0.62, image.height, 0, 0, 2048, 1024);
      const texture = new THREE.CanvasTexture(skyCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = texture;
    };
    image.src = track.image;

    const hemi = new THREE.HemisphereLight(new THREE.Color('#9aa5ff'), new THREE.Color(track.ground), 1.35);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(new THREE.Color('#e8d8ff'), 1.1);
    moon.position.set(3000, 9000, -4000);
    this.scene.add(moon);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(60000, 48), new THREE.MeshStandardMaterial({ color: track.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -30;
    this.scene.add(ground);

    this.buildRoad();
    this.buildScenery();

    const player = buildCarMesh(this.options.car.color);
    this.playerGroup = player.group;
    this.playerBrakeMat = player.brakeMat;
    this.buildBoostFlames();
    this.scene.add(this.playerGroup);
  }

  private buildRoad() {
    const track = this.options.track;
    const count = this.path.points.length;
    const positions: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];
    const rumbleA = new THREE.Color('#c48a9b');
    const rumbleB = new THREE.Color(track.accent);

    for (let i = 0; i < count; i++) {
      const p = this.path.points[i];
      const nx = p.tz;
      const nz = -p.tx;
      // Road surface
      positions.push(p.x - nx * HALF_ROAD, 0, p.z - nz * HALF_ROAD, p.x + nx * HALF_ROAD, 0, p.z + nz * HALF_ROAD);
      // Rumble strips
      positions.push(p.x - nx * HALF_ROAD * 1.08, 0, p.z - nz * HALF_ROAD * 1.08, p.x - nx * HALF_ROAD, 0, p.z - nz * HALF_ROAD);
      positions.push(p.x + nx * HALF_ROAD, 0, p.z + nz * HALF_ROAD, p.x + nx * HALF_ROAD * 1.08, 0, p.z + nz * HALF_ROAD * 1.08);
      const rumble = Math.floor(i / 3) % 2 === 0 ? rumbleA : rumbleB;
      for (let k = 0; k < 6; k++) colors.push(rumble.r, rumble.g, rumble.b);
    }
    for (let i = 0; i < count; i++) {
      const a = i * 6;
      const b = ((i + 1) % count) * 6;
      // road quad
      indices.push(a, a + 1, b + 1, a, b + 1, b);
      // rumble quads
      indices.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);
      indices.push(a + 4, a + 5, b + 5, a + 4, b + 5, b + 4);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.scene.add(new THREE.Mesh(geometry, material));

    // Lane dashes (two dashed lines, drawn every other group of segments).
    const dashPositions: number[] = [];
    const dashIndices: number[] = [];
    for (let i = 0; i < count; i += 8) {
      for (const lane of [-1 / 3, 1 / 3]) {
        const base = dashPositions.length / 3;
        for (const step of [0, 4]) {
          const idx = (i + step) % count;
          const p = this.path.points[idx];
          const nx = p.tz;
          const off = lane * HALF_ROAD;
          dashPositions.push(p.x + nx * off - nx * 14, 2, p.z - p.tx * off + p.tx * 14, p.x + nx * off + nx * 14, 2, p.z - p.tx * off - p.tx * 14);
        }
        dashIndices.push(base, base + 1, base + 3, base, base + 3, base + 2);
      }
    }
    const dashGeometry = new THREE.BufferGeometry();
    dashGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dashPositions, 3));
    dashGeometry.setIndex(dashIndices);
    const dashMaterial = new THREE.MeshBasicMaterial({ color: '#c3aeba', transparent: true, opacity: 0.75 });
    const dashes = new THREE.Mesh(dashGeometry, dashMaterial);
    this.scene.add(dashes);

    // Start/finish checker strip.
    const checkerCanvas = document.createElement('canvas');
    checkerCanvas.width = 64;
    checkerCanvas.height = 16;
    const checkerCtx = checkerCanvas.getContext('2d')!;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
      checkerCtx.fillStyle = (x + y) % 2 === 0 ? '#e8e2ea' : '#1c1720';
      checkerCtx.fillRect(x * 4, y * 4, 4, 4);
    }
    const checkerTexture = new THREE.CanvasTexture(checkerCanvas);
    const p0 = this.path.points[0];
    const startGeometry = new THREE.PlaneGeometry(ROAD_WIDTH, 320);
    const startLine = new THREE.Mesh(startGeometry, new THREE.MeshBasicMaterial({ map: checkerTexture }));
    startLine.rotation.x = -Math.PI / 2;
    startLine.rotation.z = -Math.atan2(p0.tz, p0.tx) + Math.PI / 2;
    startLine.position.set(p0.x, 4, p0.z);
    this.scene.add(startLine);
  }

  private buildScenery() {
    const track = this.options.track;
    const count = this.path.points.length;
    const step = 13;
    const props: THREE.Object3D[] = [];
    const makePalm = () => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(14, 22, 300, 6), new THREE.MeshStandardMaterial({ color: '#4d2943', roughness: 1 }));
      trunk.position.y = 150;
      trunk.rotation.z = 0.1;
      g.add(trunk);
      const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(120, 0), new THREE.MeshStandardMaterial({ color: '#1a4a38', roughness: 1, flatShading: true }));
      canopy.position.set(30, 320, 0);
      g.add(canopy);
      return g;
    };
    const makePine = () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: '#16301f', roughness: 1, flatShading: true });
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(150 - i * 38, 210, 7), mat);
        cone.position.y = 130 + i * 120;
        g.add(cone);
      }
      return g;
    };
    const makeCactus = () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: '#1d5c40', roughness: 1 });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(30, 34, 380, 8), mat);
      trunk.position.y = 190;
      g.add(trunk);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(20, 22, 150, 8), mat);
      arm.position.set(55, 240, 0);
      arm.rotation.z = -0.5;
      g.add(arm);
      return g;
    };
    const makeRock = () => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(110, 0), new THREE.MeshStandardMaterial({ color: '#5a6575', roughness: 1, flatShading: true }));
      rock.position.y = 60;
      rock.scale.y = 0.6;
      return rock;
    };
    const makeBuilding = () => {
      const g = new THREE.Group();
      const height = 700 + Math.random() * 900;
      const box = new THREE.Mesh(new THREE.BoxGeometry(420, height, 420), new THREE.MeshStandardMaterial({ color: '#211b32', roughness: 0.9 }));
      box.position.y = height / 2;
      g.add(box);
      const top = new THREE.Mesh(new THREE.BoxGeometry(424, 30, 424), new THREE.MeshStandardMaterial({ color: '#311c3d', emissive: '#e07caa', emissiveIntensity: 1.2 }));
      top.position.y = height;
      g.add(top);
      return g;
    };

    for (let i = 0; i < count; i += step) {
      const p = this.path.points[i];
      const nx = p.tz;
      const side = (i / step) % 2 === 0 ? -1 : 1;
      let prop: THREE.Object3D | null = null;
      if (track.scenery === 'palms') prop = i % 39 === 0 ? makeBuilding() : makePalm();
      else if (track.scenery === 'pines') prop = makePine();
      else if (track.scenery === 'cacti') prop = Math.random() < 0.25 ? makeRock() : makeCactus();
      else prop = makeRock();
      if (!prop) continue;
      const offset = HALF_ROAD * (1.5 + Math.random() * 1.2);
      prop.position.set(p.x + nx * offset * side, 0, p.z - p.tx * offset * side);
      prop.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(prop);
      props.push(prop);
    }
  }

  private buildBoostFlames() {
    this.boostFlames = new THREE.Group();
    const flameMat = new THREE.MeshBasicMaterial({ color: '#69e9f7', transparent: true, opacity: 0.85 });
    for (const side of [-1, 1]) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(26, 160, 8), flameMat);
      flame.rotation.x = Math.PI / 2;
      flame.position.set(side * 62, 60, -290);
      this.boostFlames.add(flame);
    }
    this.boostFlames.visible = false;
    this.playerGroup.add(this.boostFlames);
  }

  private createRivals() {
    const colors = ['#87c9dd', '#edca7d', '#e5d8d4', '#aa93c9', '#66bdb0', '#ee986d', '#94a5d0'];
    const difficulty = this.options.settings.difficulty;
    const pace = difficulty === 'cruise' ? 0.58 : difficulty === 'expert' ? 0.83 : 0.7;
    for (const rival of this.rivals) if (rival.group) this.scene.remove(rival.group);
    this.rivals = colors.map((color, i) => {
      const car = buildCarMesh(color);
      this.scene.add(car.group);
      return {
        distance: 2400 + i * 2300,
        lane: [-0.62, 0.06, 0.6, -0.5, 0.52, -0.1, 0.3][i],
        speed: this.maxSpeed * (pace + i * 0.016),
        group: car.group,
        brakeMat: car.brakeMat,
      };
    });
  }

  // ---------- lifecycle ----------
  setSettings(settings: Settings) {
    this.options.settings = settings;
    this.audio.setEnabled(settings.sound);
    if (settings.sound) void this.audio.unlock();
    if (this.phase === 'intro') { this.createRivals(); this.emit(); }
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (!visible) {
      this.pause();
      this.audio.update(0, false, false);
    }
  }

  setControl(control: Control, pressed: boolean) {
    if (pressed) this.controls.add(control);
    else this.controls.delete(control);
  }

  clearControls() { this.controls.clear(); }

  start() {
    this.speed = 0; this.distance = 0; this.playerX = 0; this.steering = 0;
    this.elapsed = 0; this.lapStarted = 0; this.bestLap = Infinity; this.currentLap = 1;
    this.nitro = 100; this.boostDepleted = false; this.topSpeed = 0; this.score = 0; this.collision = 0;
    this.countdown = 3; this.lastCount = 3; this.boosting = false; this.wasBoosting = false;
    this.controls.clear();
    this.createRivals();
    void this.audio.unlock();
    this.audio.beep(520, 0.09);
    this.setPhase('countdown');
    this.emit();
  }

  pause() {
    if (this.phase === 'racing' || this.phase === 'countdown') {
      this.setPhase('paused');
      this.controls.clear();
      this.audio.update(0, false, false);
    }
  }

  resume() {
    if (this.phase === 'paused') {
      void this.audio.unlock();
      this.setPhase(this.countdown > 0 ? 'countdown' : 'racing');
    }
  }

  reset() {
    this.clearControls();
    this.speed = 0; this.distance = 0; this.elapsed = 0; this.nitro = 100;
    this.boostDepleted = false; this.currentLap = 1; this.score = 0; this.playerX = 0;
    this.steering = 0; this.boosting = false; this.wasBoosting = false; this.collision = 0;
    this.countdown = 3;
    this.createRivals();
    this.setPhase('intro');
    this.emit();
  }

  private setPhase(phase: GamePhase) { this.phase = phase; this.options.onPhase(phase); }

  private resize() {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1 || !this.renderer) return;
    this.renderer.setSize(bounds.width, bounds.height, false);
    this.camera.aspect = bounds.width / bounds.height;
    this.camera.updateProjectionMatrix();
  }

  // ---------- simulation ----------
  private tick = (now: number) => {
    if (!this.alive) return;
    const dt = Math.min((now - (this.previousTime || now)) / 1000, 0.05);
    this.previousTime = now;
    if (this.visible) {
      if (this.phase !== 'paused') this.sceneTime += dt;
      if (this.phase === 'countdown') {
        this.countdown -= dt;
        const count = Math.ceil(this.countdown);
        if (count !== this.lastCount) {
          this.lastCount = count;
          if (count < 4) this.audio.beep(count <= 0 ? 1040 : 520, count <= 0 ? 0.3 : 0.09);
        }
        if (this.countdown <= 0) this.setPhase('racing');
      }
      if (this.phase === 'racing') this.update(dt);
      this.audio.update(this.speed / this.maxSpeed, this.phase === 'racing', this.boosting);
      this.updateVisuals(dt);
      if (this.renderer) this.renderer.render(this.scene, this.camera);
      if (now - this.lastSnapshot > 70) { this.emit(); this.lastSnapshot = now; }
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private update(dt: number) {
    const ratio = this.speed / this.maxSpeed;
    const accelerate = this.controls.has('accelerate') || this.options.settings.autoAccelerate;
    const brake = this.controls.has('brake');
    const boostHeld = this.controls.has('boost');
    if (!boostHeld) this.boostDepleted = false;
    if (this.nitro <= 0.5) this.boostDepleted = true;
    const steeringInput = Number(this.controls.has('right')) - Number(this.controls.has('left'));
    this.steering += (steeringInput - this.steering) * Math.min(1, dt * 8);
    this.boosting = boostHeld && !this.boostDepleted && this.nitro > 0.5 && this.speed > this.maxSpeed * 0.15 && !brake;
    if (this.boosting && !this.wasBoosting) this.audio.nitro();
    this.wasBoosting = this.boosting;
    const acceleration = 2450 * this.options.car.acceleration / 86;
    if (brake) this.speed -= dt * 7200;
    else if (this.boosting) this.speed += dt * acceleration * 2.5;
    else if (accelerate) this.speed += dt * acceleration;
    else this.speed -= dt * 1450;
    const speedCap = this.maxSpeed * (this.boosting ? 1.28 : 1);
    if (this.speed > speedCap) this.speed -= dt * 4800;
    this.speed = Math.max(0, Math.min(this.speed, this.maxSpeed * 1.29));
    this.nitro = Math.max(0, Math.min(100, this.nitro + dt * (this.boosting ? -28 : boostHeld ? 0 : 7)));
    const handling = this.options.car.handling / 80;
    this.playerX += this.steering * dt * 1.2 * handling * Math.min(1, ratio * 2);
    this.playerX = Math.max(-PLAYER_LATERAL - 0.7, Math.min(PLAYER_LATERAL + 0.7, this.playerX));
    if (Math.abs(this.playerX) > PLAYER_LATERAL + 0.03 && this.speed > this.maxSpeed * 0.42) this.speed -= dt * 5600;
    const previousDistance = this.distance;
    this.distance += this.speed * dt;
    this.elapsed += dt;
    this.collision = Math.max(0, this.collision - dt);
    this.score += dt * this.speed * 0.023 * (this.boosting ? 1.6 : 1);
    this.topSpeed = Math.max(this.topSpeed, this.speed / this.maxSpeed * this.options.car.topSpeed);

    for (const rival of this.rivals) {
      const before = rival.distance - previousDistance;
      rival.distance += rival.speed * dt;
      const gap = rival.distance - this.distance;
      if (before > 0 && gap <= 0) { this.score += 500; this.audio.whoosh(); }
      if (Math.abs(gap) < 540 && Math.abs(this.playerX - rival.lane) < 0.235 && this.collision === 0 && this.speed > rival.speed * 0.8) {
        this.speed *= 0.43;
        this.collision = 1.25;
        this.playerX += this.playerX < rival.lane ? -0.16 : 0.16;
        this.audio.crash();
      }
    }

    const lap = Math.floor(this.distance / this.trackLength) + 1;
    if (lap > this.currentLap) {
      this.bestLap = Math.min(this.bestLap, this.elapsed - this.lapStarted);
      this.lapStarted = this.elapsed;
      this.currentLap = lap;
      this.score += 2000;
      this.audio.beep(880, 0.12);
      this.audio.lap();
    }
    if (this.distance >= this.trackLength * TOTAL_LAPS) this.finish(true);
    else if (this.elapsed >= this.timeLimit) this.finish(false);
  }

  private finish(completed: boolean) {
    this.setPhase('finished');
    this.controls.clear();
    this.boosting = false;
    this.audio.finish(completed);
    if (completed) this.score += (9 - this.position) * 1500 + Math.floor((this.timeLimit - this.elapsed) * 100);
    this.options.onFinish({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: 'PLAYER 01', trackId: this.options.track.id, carId: this.options.car.id,
      difficulty: this.options.settings.difficulty, time: this.elapsed,
      bestLap: this.bestLap, topSpeed: Math.round(this.topSpeed), score: Math.floor(this.score),
      position: this.position, completed, date: new Date().toISOString(),
    });
    this.emit();
  }

  private emit() {
    this.options.onSnapshot({
      speed: Math.round(this.speed / this.maxSpeed * this.options.car.topSpeed * (this.boosting ? 1.15 : 1)),
      gear: Math.min(5, 1 + Math.floor(this.speed / this.maxSpeed * 4.6)),
      lap: Math.min(TOTAL_LAPS, this.currentLap),
      elapsed: this.elapsed,
      remaining: Math.max(0, this.timeLimit - this.elapsed),
      position: this.position,
      nitro: Math.round(this.nitro),
      score: Math.floor(this.score),
      countdown: Math.max(0, Math.ceil(this.countdown)),
      boosting: this.boosting,
      progress: Math.min(1, this.distance / (this.trackLength * TOTAL_LAPS)),
      collision: this.collision > 0.85,
    });
  }

  // ---------- visuals ----------
  private updateVisuals(dt: number) {
    const attract = this.phase === 'intro';
    this.pointAt(this.distance, this.p);
    const forward = this.tmp.set(this.p.tx, 0, this.p.tz);
    const px = this.p.x + this.p.tz * this.playerX * HALF_ROAD;
    const pz = this.p.z - this.p.tx * this.playerX * HALF_ROAD;

    this.playerGroup.position.set(px, 0, pz);
    const yaw = Math.atan2(forward.x, forward.z);
    this.playerGroup.rotation.y = yaw - this.steering * 0.22;
    this.playerGroup.rotation.z = this.steering * 0.06;

    if (this.playerBrakeMat) this.playerBrakeMat.emissiveIntensity = this.controls.has('brake') && !attract ? 3.2 : 1.4;
    if (this.boostFlames) {
      this.boostFlames.visible = this.boosting && this.phase === 'racing';
      if (this.boostFlames.visible) {
        const s = 0.8 + Math.sin(this.sceneTime * 46) * 0.3;
        this.boostFlames.scale.set(1, 1, s);
      }
    }

    for (const rival of this.rivals) {
      if (!rival.group) continue;
      this.pointAt(rival.distance, this.p);
      rival.group.position.set(this.p.x + this.p.tz * rival.lane * HALF_ROAD, 0, this.p.z - this.p.tx * rival.lane * HALF_ROAD);
      rival.group.rotation.y = Math.atan2(this.p.tx, this.p.tz);
      if (rival.brakeMat) rival.brakeMat.emissiveIntensity = 1.1 + Math.sin(this.sceneTime * 3 + rival.lane * 9) * 0.5;
    }

    const camera = this.camera;
    if (attract) {
      const angle = this.sceneTime * 0.28;
      camera.position.set(px + Math.sin(angle) * 900, 300, pz + Math.cos(angle) * 900);
      camera.lookAt(px, 90, pz);
    } else {
      const back = this.tmp2.copy(forward).multiplyScalar(-520);
      const desiredX = px + back.x - forward.z * this.steering * 90;
      const desiredZ = pz + back.z + forward.x * this.steering * 90;
      const smoothing = 1 - Math.exp(-dt * 5.5);
      this.cameraPos.lerp(this.tmp.set(desiredX, 260, desiredZ), smoothing);
      camera.position.copy(this.cameraPos);
      camera.lookAt(px + forward.x * 620, 90, pz + forward.z * 620);
      const targetFov = this.boosting ? 80 : 68;
      if (Math.abs(camera.fov - targetFov) > 0.1) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6);
        camera.updateProjectionMatrix();
      }
    }
    if (this.cameraPos.lengthSq() === 0) this.cameraPos.copy(camera.position);
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.audio.destroy();
    this.scene.traverse((object: THREE.Object3D) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach(m => m.dispose());
      else material?.dispose();
    });
    this.renderer?.dispose();
  }
}
