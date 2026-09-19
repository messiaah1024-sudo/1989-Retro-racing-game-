export type Difficulty = 'cruise' | 'arcade' | 'expert';
export type GamePhase = 'intro' | 'countdown' | 'racing' | 'paused' | 'finished';
export type Control = 'left' | 'right' | 'accelerate' | 'brake' | 'boost';

export const TOTAL_LAPS = 10;

export interface Car {
  id: string;
  name: string;
  year: string;
  category: string;
  description: string;
  color: string;
  topSpeed: number;
  acceleration: number;
  handling: number;
  power: string;
  weight: string;
}

export interface Track {
  id: string;
  name: string;
  location: string;
  image: string;
  description: string;
  distance: string;
  turns: number;
  curve: number;
  sky: [string, string, string];
  sun: string;
  ground: string;
  road: string;
  accent: string;
  scenery: 'palms' | 'coast' | 'pines' | 'cacti';
}

export interface Settings {
  sound: boolean;
  music: boolean;
  scanlines: boolean;
  autoAccelerate: boolean;
  difficulty: Difficulty;
}

export interface RaceSnapshot {
  speed: number;
  gear: number;
  lap: number;
  elapsed: number;
  remaining: number;
  position: number;
  nitro: number;
  score: number;
  countdown: number;
  boosting: boolean;
  progress: number;
  collision: boolean;
}

export interface RaceResult {
  id: string;
  name: string;
  trackId: string;
  carId: string;
  difficulty: Difficulty;
  time: number;
  bestLap: number;
  topSpeed: number;
  score: number;
  position: number;
  completed: boolean;
  date: string;
}

export const CARS: Car[] = [
  {
    id: 'veloce', name: 'Veloce GT', year: '1989', category: 'THE ORIGINAL NIGHT RIDER',
    description: 'A wide stance. A wild heart. The poster on your bedroom wall, finally out on the open road.',
    color: '#f25456', topSpeed: 288, acceleration: 86, handling: 80, power: '390 HP', weight: '1,420 KG',
  },
  {
    id: 'vector', name: 'Vector RX', year: '1988', category: 'PRECISION AFTER DARK',
    description: 'Light on its feet and sharp through the corners. Japanese engineering with a midnight state of mind.',
    color: '#6cd4cd', topSpeed: 272, acceleration: 92, handling: 95, power: '320 HP', weight: '1,180 KG',
  },
  {
    id: 'comet', name: 'Comet Turbo', year: '1987', category: 'ALL MUSCLE. NO APOLOGIES.',
    description: 'Big boost. Bigger attitude. An untamed turbocharged icon that was never built to blend in.',
    color: '#efce7e', topSpeed: 310, acceleration: 78, handling: 72, power: '450 HP', weight: '1,510 KG',
  },
];

export const TRACKS: Track[] = [
  {
    id: 'miami', name: 'Miami After Hours', location: 'MIAMI, FLORIDA',
    image: '/images/sunset-skyline.png',
    description: 'Past the palms. Under the neon. This is where the night begins.',
    distance: '6.4 KM', turns: 12, curve: 0.85,
    sky: ['#211329', '#643653', '#c8828b'], sun: '#f1b081',
    ground: '#251a31', road: '#493849', accent: '#ee8fa5', scenery: 'palms',
  },
  {
    id: 'pacific', name: 'Pacific Coastline', location: 'BIG SUR, CALIFORNIA',
    image: '/images/pacific-coast.png',
    description: 'An endless ocean, sweeping curves, and the last light of summer.',
    distance: '7.2 KM', turns: 16, curve: 1.1,
    sky: ['#372541', '#a66073', '#efb396'], sun: '#ffddb0',
    ground: '#302337', road: '#554451', accent: '#cdb6bc', scenery: 'coast',
  },
  {
    id: 'midnight', name: 'Midnight Mountain', location: 'ASPEN, COLORADO',
    image: '/images/midnight-pass.png',
    description: 'Leave the city behind. Find your line between the stars and the switchbacks.',
    distance: '8.1 KM', turns: 21, curve: 1.4,
    sky: ['#101323', '#2e2a53', '#68547e'], sun: '#cfc7ea',
    ground: '#171b2d', road: '#373a50', accent: '#9997c4', scenery: 'pines',
  },
  {
    id: 'mojave', name: 'Mojave Starlight', location: 'MOJAVE DESERT, NEVADA',
    image: '/images/neon-mesa.png',
    description: 'Cool night air, warm asphalt. Chase the horizon past the cacti and the mesas.',
    distance: '8.8 KM', turns: 15, curve: 1.15,
    sky: ['#07211c', '#1e5346', '#e8a86e'], sun: '#ffe6ad',
    ground: '#14231f', road: '#3d4b43', accent: '#7fe3b9', scenery: 'cacti',
  },
];

export const DEFAULT_SETTINGS: Settings = {
  sound: false,
  music: true,
  scanlines: true,
  autoAccelerate: false,
  difficulty: 'arcade',
};

export const DIFFICULTIES: { id: Difficulty; name: string; description: string; time: number }[] = [
  { id: 'cruise', name: 'Sunday Cruise', description: 'Ten easy laps. All the time in the world.', time: 400 },
  { id: 'arcade', name: 'Arcade', description: 'The original quarter-eating experience, stretched over ten laps.', time: 320 },
  { id: 'expert', name: 'Redline', description: 'Fast rivals. Ten laps. No room for hesitation.', time: 270 },
];

export const EMPTY_SNAPSHOT: RaceSnapshot = {
  speed: 0, gear: 1, lap: 1, elapsed: 0, remaining: 320,
  position: 8, nitro: 100, score: 0, countdown: 3,
  boosting: false, progress: 0, collision: false,
};

export function formatTime(seconds: number, precise = true) {
  if (!Number.isFinite(seconds)) return '--:--.--';
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  const hundredths = Math.floor((seconds % 1) * 100).toString().padStart(2, '0');
  return `${minutes}:${secs}${precise ? `.${hundredths}` : ''}`;
}
