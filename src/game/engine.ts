import { ArcadeAudio } from './audio';
import { DIFFICULTIES, TOTAL_LAPS, type Car, type Control, type GamePhase, type RaceResult, type RaceSnapshot, type Settings, type Track } from './data';
import { createCarSprite, drawCactus, drawPalm, drawPine } from './sprites';

const SEGMENT = 200;
const BASE_SEGMENTS = 900;
const ROAD_WIDTH = 2000;
const PLAYER_Z = 1200;
const DRAW_DISTANCE = 160;
const CAMERA_DEPTH = 0.86;

interface ProjectedPoint { x: number; y: number; w: number; scale: number }
interface RoadSegment { index: number; near: ProjectedPoint; far: ProjectedPoint; z: number }
interface Rival { distance: number; lane: number; speed: number; sprite: HTMLCanvasElement }

interface EngineOptions {
  car: Car;
  track: Track;
  settings: Settings;
  onSnapshot: (snapshot: RaceSnapshot) => void;
  onPhase: (phase: GamePhase) => void;
  onFinish: (result: RaceResult) => void;
}

export class RacingEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: EngineOptions;
  private width = 1024;
  private height = 410;
  private frame = 0;
  private previousTime = 0;
  private lastSnapshot = 0;
  private alive = true;
  private visible = true;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private phase: GamePhase = 'intro';
  private controls = new Set<Control>();
  private audio = new ArcadeAudio();
  private background = new Image();
  private mountainLayer: HTMLCanvasElement | null = null;
  private playerSprite: HTMLCanvasElement;
  private rivals: Rival[] = [];
  private observer: ResizeObserver;
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
  private attractDistance = 8000;
  private sceneTime = 0;
  private introBlend = 1;
  private roadSegments: RoadSegment[] = [];

  constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.options = options;
    this.playerSprite = createCarSprite(options.car.color, options.car.id);
    this.audio.setEnabled(options.settings.sound);
    this.background.onload = () => this.prepareBackground();
    this.background.src = options.track.image;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.createRivals();
    this.emit();
    this.frame = requestAnimationFrame(this.tick);
  }

  private get maxSpeed() { return 10500 * this.options.car.topSpeed / 288; }
  private get segmentCount() { return Math.round(BASE_SEGMENTS * parseFloat(this.options.track.distance) / 6.4); }
  private get trackLength() { return SEGMENT * this.segmentCount; }
  private get timeLimit() { return DIFFICULTIES.find(d => d.id === this.options.settings.difficulty)!.time * parseFloat(this.options.track.distance) / 6.4; }
  private get position() { return 1 + this.rivals.filter(r => r.distance > this.distance).length; }

  private resize() {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return;
    this.width = 1024;
    this.height = Math.round(1024 * bounds.height / bounds.width);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx.imageSmoothingEnabled = false;
  }

  private prepareBackground() {
    const layer = document.createElement('canvas');
    layer.width = 1376;
    layer.height = 240;
    const context = layer.getContext('2d')!;
    const image = this.background;
    context.drawImage(image, 0, image.height * 0.55, image.width, image.height * 0.28, 0, 0, layer.width, layer.height);
    context.globalCompositeOperation = 'destination-in';
    const mask = context.createLinearGradient(0, 0, 0, layer.height);
    mask.addColorStop(0, 'transparent');
    mask.addColorStop(0.32, '#000');
    mask.addColorStop(1, '#000');
    context.fillStyle = mask;
    context.fillRect(0, 0, layer.width, layer.height);
    this.mountainLayer = layer;
  }

  private createRivals() {
    const colors = ['#87c9dd', '#edca7d', '#e5d8d4', '#aa93c9', '#66bdb0', '#ee986d', '#94a5d0'];
    const difficulty = this.options.settings.difficulty;
    const pace = difficulty === 'cruise' ? 0.58 : difficulty === 'expert' ? 0.83 : 0.7;
    this.rivals = colors.map((color, i) => ({
      distance: 2600 + i * 2550,
      lane: [-0.62, 0.04, 0.63, -0.55, 0.55, 0, -0.65][i],
      speed: this.maxSpeed * (pace + i * 0.018),
      sprite: createCarSprite(color, i % 2 ? 'vector' : 'comet'),
    }));
  }

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
    } else this.resize();
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
    this.speed = 0;
    this.distance = 0;
    this.elapsed = 0;
    this.nitro = 100;
    this.boostDepleted = false;
    this.currentLap = 1;
    this.score = 0;
    this.playerX = 0;
    this.steering = 0;
    this.boosting = false;
    this.wasBoosting = false;
    this.collision = 0;
    this.countdown = 3;
    this.createRivals();
    this.setPhase('intro');
    this.emit();
  }

  private setPhase(phase: GamePhase) { this.phase = phase; this.options.onPhase(phase); }

  private curveAt(index: number) {
    const count = this.segmentCount;
    const angle = (((index % count) + count) % count) / count * Math.PI * 2;
    const turns = this.options.track.turns;
    return (Math.sin(angle * Math.ceil(turns / 4)) + Math.sin(angle * Math.floor(turns * 0.6)) * 0.38) * this.options.track.curve * 2.1;
  }

  private tick = (now: number) => {
    if (!this.alive) return;
    const dt = Math.min((now - (this.previousTime || now)) / 1000, 0.05);
    this.previousTime = now;
    if (!this.visible) {
      this.frame = requestAnimationFrame(this.tick);
      return;
    }
    if (this.phase !== 'paused') this.sceneTime += dt;
    this.introBlend += ((this.phase === 'intro' ? 1 : 0) - this.introBlend) * Math.min(1, dt * 3);
    if (this.phase === 'intro' && !this.reducedMotion) this.attractDistance += dt * 460;
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
    this.render();
    if (now - this.lastSnapshot > 70) { this.emit(); this.lastSnapshot = now; }
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
    this.playerX -= this.curveAt(Math.floor(this.distance / SEGMENT)) * ratio * ratio * dt * 0.18;
    this.playerX = Math.max(-1.75, Math.min(1.75, this.playerX));
    if (Math.abs(this.playerX) > 1.03 && this.speed > this.maxSpeed * 0.42) this.speed -= dt * 5600;
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

  private polygon(fill: string, points: number[]) {
    const ctx = this.ctx;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
    ctx.fill();
  }

  private project(worldX: number, worldZ: number, center: number): ProjectedPoint {
    const roadWidth = ROAD_WIDTH;
    const scale = CAMERA_DEPTH / (worldZ + 1);
    return {
      x: center + scale * worldX * roadWidth / 2,
      y: this.height * 0.94 - scale * (this.height * 0.41),
      w: scale * roadWidth,
      scale,
    };
  }

  private renderSky(center: number) {
    const { ctx, width: w, height: h } = this;
    const track = this.options.track;
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.52);
    sky.addColorStop(0, track.sky[0]); sky.addColorStop(0.62, track.sky[1]); sky.addColorStop(1, track.sky[2]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 39; i++) {
      const x = (i * 173 + 31) % w;
      const y = (i * 67 + 11) % Math.max(20, h * 0.31);
      ctx.fillStyle = i % 3 === 0 ? '#eac5c55c' : '#eac5c529';
      ctx.fillRect(x, y, i % 9 === 0 ? 2 : 1, 1);
    }
    const sunX = w * 0.55 + (center - w * 0.5) * 0.55;
    const sunY = h * 0.235;
    const radius = Math.min(h * 0.216, w * 0.15);
    const glow = ctx.createRadialGradient(sunX, sunY, radius * 0.5, sunX, sunY, radius * 2.3);
    glow.addColorStop(0, `${track.sun}25`); glow.addColorStop(1, `${track.sun}00`);
    ctx.fillStyle = glow; ctx.fillRect(sunX - radius * 2.3, 0, radius * 4.6, h * 0.5);
    ctx.fillStyle = track.sun;
    for (let y = -radius; y <= radius; y += 2) {
      if (track.scenery !== 'pines' && y > radius * 0.18 && Math.floor((y - radius * 0.18) / 5) % 3 === 2) continue;
      const halfWidth = Math.sqrt(Math.max(0, radius * radius - y * y));
      ctx.fillRect(Math.round(sunX - halfWidth), Math.round(sunY + y), Math.round(halfWidth * 2), 2);
    }
    if (this.mountainLayer) ctx.drawImage(this.mountainLayer, -w * 0.025, h * 0.305, w * 1.05, h * 0.21);
    else {
      this.polygon('#51405d', [0, h * 0.48, 0, h * 0.36, w * 0.12, h * 0.31, w * 0.24, h * 0.43, w * 0.41, h * 0.35, w * 0.58, h * 0.44, w * 0.75, h * 0.33, w, h * 0.42, w, h * 0.51]);
    }
    ctx.fillStyle = track.ground; ctx.fillRect(0, h * 0.505, w, h * 0.5);
    if (track.scenery === 'coast') {
      ctx.fillStyle = '#5a6575'; ctx.fillRect(0, h * 0.485, w * 0.46, h * 0.07);
      ctx.fillStyle = '#a98a9a';
      for (let i = 0; i < 5; i++) ctx.fillRect(0, h * 0.488 + i * 5, w * (0.44 - i * 0.035), 1);
    }
  }

  private render() {
    const { ctx, width: w, height: h } = this;
    const attract = this.phase === 'intro';
    const mobile = h / w > 0.65;
    const center = w * (0.5 + this.introBlend * (mobile ? 0.1 : 0.16));
    const cameraPosition = (attract ? this.attractDistance : this.distance) - PLAYER_Z;
    const baseIndex = Math.floor(cameraPosition / SEGMENT);
    const percent = (cameraPosition - baseIndex * SEGMENT) / SEGMENT;
    const cameraX = attract ? (this.reducedMotion ? 0 : Math.sin(this.sceneTime * 0.22) * 60) : this.playerX * ROAD_WIDTH;
    ctx.save();
    if (this.collision > 0.85 && !attract) ctx.translate(Math.sin(this.sceneTime * 78) * 3, Math.cos(this.sceneTime * 65) * 2);
    this.renderSky(center);
    let roadX = 0;
    let deltaX = -this.curveAt(baseIndex) * percent;
    this.roadSegments = [];

    // Project short world-space road segments into the classic arcade perspective.
    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const index = baseIndex + n;
      const z = n * SEGMENT - percent * SEGMENT;
      const near = this.project(roadX - cameraX, z, center);
      const far = this.project(roadX + deltaX - cameraX, z + SEGMENT, center);
      this.roadSegments.push({ index, near, far, z });
      roadX += deltaX;
      deltaX += this.curveAt(index);
    }

    for (let n = this.roadSegments.length - 1; n >= 1; n--) {
      const { index, near: a, far: b } = this.roadSegments[n];
      if (b.y > h + 10 || a.y < h * 0.48) continue;
      const alternate = Math.floor(index / 3) % 2 === 0;
      this.polygon(alternate ? '#c48a9b' : '#756078', [a.x - a.w * 1.07, a.y, a.x + a.w * 1.07, a.y, b.x + b.w * 1.07, b.y, b.x - b.w * 1.07, b.y]);
      this.polygon(this.options.track.road, [a.x - a.w, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x - b.w, b.y]);
      this.polygon('#bb9eab', [a.x - a.w * 0.97, a.y, a.x - a.w * 0.957, a.y, b.x - b.w * 0.957, b.y, b.x - b.w * 0.97, b.y]);
      this.polygon('#bb9eab', [a.x + a.w * 0.957, a.y, a.x + a.w * 0.97, a.y, b.x + b.w * 0.97, b.y, b.x + b.w * 0.957, b.y]);
      if (Math.floor(index / 4) % 2 === 0) {
        for (const lane of [-1 / 3, 1 / 3]) {
          this.polygon('#c3aeba', [a.x + a.w * (lane - 0.009), a.y, a.x + a.w * (lane + 0.009), a.y, b.x + b.w * (lane + 0.009), b.y, b.x + b.w * (lane - 0.009), b.y]);
        }
      }
      if (((index % this.segmentCount) + this.segmentCount) % this.segmentCount < 3 && !attract) {
        for (let cell = 0; cell < 16; cell++) {
          if ((cell + index) % 2 === 0) this.polygon('#c4b2b7', [a.x + a.w * (-1 + cell / 8), a.y, a.x + a.w * (-1 + (cell + 1) / 8), a.y, b.x + b.w * (-1 + (cell + 1) / 8), b.y, b.x + b.w * (-1 + cell / 8), b.y]);
        }
      }
    }

    for (let n = this.roadSegments.length - 1; n >= 3; n--) {
      const segment = this.roadSegments[n];
      const { near: p, index } = segment;
      if (p.y > h * 1.22) continue;
      const normalizedIndex = ((index % this.segmentCount) + this.segmentCount) % this.segmentCount;
      if (normalizedIndex % 13 === 0) {
        const side = normalizedIndex % 26 === 0 ? -1 : 1;
        const x = p.x + p.w * (side * 1.52);
        const size = p.w * 0.43;
        if (x > -size && x < w + size) {
          if (this.options.track.scenery === 'pines') drawPine(ctx, x, p.y, size);
          else if (this.options.track.scenery === 'cacti') drawCactus(ctx, x, p.y, size, side === -1);
          else drawPalm(ctx, x, p.y, size, side === -1);
        }
      }
      if (normalizedIndex % 21 === 0) {
        const side = normalizedIndex % 42 ? 1 : -1;
        const x = p.x + p.w * 1.18 * side;
        const postHeight = p.w * 0.075;
        ctx.fillStyle = '#c8adbf'; ctx.fillRect(x, p.y - postHeight, Math.max(1, p.w * 0.009), postHeight);
        ctx.fillStyle = '#ef90af'; ctx.fillRect(x, p.y - postHeight, Math.max(1, p.w * 0.018), postHeight * 0.25);
      }
      if (this.options.track.scenery === 'palms' && normalizedIndex % 67 === 0) this.drawBuilding(p, normalizedIndex);
    }

    const traffic = this.rivals.map(rival => {
      const relative = attract ? ((rival.distance + 24000 - this.attractDistance) % this.trackLength + this.trackLength) % this.trackLength : rival.distance - this.distance;
      return { rival, relative: relative + PLAYER_Z };
    }).filter(r => r.relative > 300 && r.relative < DRAW_DISTANCE * SEGMENT).sort((a, b) => b.relative - a.relative);
    for (const { rival, relative } of traffic) {
      const n = Math.floor(relative / SEGMENT);
      const segment = this.roadSegments[Math.min(n, this.roadSegments.length - 1)];
      if (!segment) continue;
      const p = this.project(0, relative, center);
      const carWidth = p.w * 0.27;
      const fraction = (relative % SEGMENT) / SEGMENT;
      const roadCenter = segment.near.x + (segment.far.x - segment.near.x) * fraction;
      ctx.drawImage(rival.sprite, Math.round(roadCenter + p.w * rival.lane - carWidth / 2), Math.round(p.y - carWidth * 136 / 248), Math.round(carWidth), Math.round(carWidth * 136 / 248));
    }

    const playerWidth = w * (mobile ? 0.29 : 0.195);
    const playerHeight = playerWidth * 136 / 248;
    const playerScreenX = center + this.steering * w * 0.021;
    const shake = this.speed > 0 ? Math.sin(this.sceneTime * 42) * Math.min(1.5, this.speed / this.maxSpeed) : 0;
    const playerY = h * (mobile ? 0.89 : 0.944) + shake;
    if (this.boosting && this.phase === 'racing') {
      for (const side of [-1, 1]) {
        const x = playerScreenX + side * playerWidth * 0.29;
        const length = 12 + Math.sin(this.sceneTime * 48) * 6;
        this.polygon('#69e9f7', [x - 6, playerY - 8, x + 6, playerY - 8, x + 3, playerY + length, x, playerY + length + 10, x - 3, playerY + length]);
        ctx.fillStyle = '#e3fbec'; ctx.fillRect(x - 2, playerY - 8, 4, length);
      }
      this.drawSpeedLines();
    }
    ctx.save();
    ctx.translate(Math.round(playerScreenX), Math.round(playerY));
    ctx.transform(1, 0, -this.steering * 0.07, 1, 0, 0);
    ctx.drawImage(this.playerSprite, Math.round(-playerWidth / 2), Math.round(-playerHeight), Math.round(playerWidth), Math.round(playerHeight));
    ctx.restore();
    if (this.controls.has('brake') && !attract) {
      ctx.fillStyle = '#ff4b5c70';
      ctx.fillRect(playerScreenX - playerWidth * 0.37, playerY - playerHeight * 0.37, playerWidth * 0.25, playerHeight * 0.08);
      ctx.fillRect(playerScreenX + playerWidth * 0.12, playerY - playerHeight * 0.37, playerWidth * 0.25, playerHeight * 0.08);
    }
    ctx.restore();
  }

  private drawBuilding(p: ProjectedPoint, index: number) {
    const ctx = this.ctx;
    const side = index % 2 ? -1 : 1;
    const bw = p.w * 0.5;
    const bh = bw * 1.5;
    const x = p.x + p.w * side * 1.8 - bw * 0.5;
    const y = p.y - bh;
    if (x < -bw || x > this.width + bw) return;
    ctx.fillStyle = '#211b32'; ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#8b406b'; ctx.fillRect(x, y, bw, Math.max(1, bw * 0.025));
    ctx.fillStyle = '#e07caa'; ctx.fillRect(x + bw * 0.12, y + bh * 0.13, bw * 0.76, bh * 0.09);
    if (bw > 30) {
      ctx.fillStyle = '#301a3c';
      ctx.font = `bold ${Math.round(bw * 0.12)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('MOTEL', x + bw * 0.5, y + bh * 0.204);
    }
    for (let row = 0; row < 5; row++) for (let col = 0; col < 4; col++) {
      ctx.fillStyle = (row + col + index) % 3 ? '#796079' : '#d7a09b';
      ctx.fillRect(x + bw * (0.12 + col * 0.21), y + bh * (0.3 + row * 0.13), bw * 0.085, bh * 0.047);
    }
  }

  private drawSpeedLines() {
    const { ctx, width: w, height: h } = this;
    ctx.strokeStyle = '#e9e3ff48'; ctx.lineWidth = 1;
    for (let i = 0; i < 15; i++) {
      const t = ((this.sceneTime * 0.8 + i * 0.137) % 1);
      const side = i % 2 ? -1 : 1;
      const startX = w * 0.5 + side * w * (0.19 + t * 0.4);
      const startY = h * 0.49 + h * (i % 5) * 0.12;
      ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(startX + side * 45 * t, startY + 30 * t); ctx.stroke();
    }
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.audio.destroy();
    this.background.onload = null;
  }
}
