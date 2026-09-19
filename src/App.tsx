import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, CarFront, Check, ChevronDown, ChevronRight, CircleHelp, Flag, Gauge, Info, MapPin, Music, SlidersHorizontal, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';
import { CarPreview } from './components/CarPreview';
import { Modal } from './components/Modal';
import { RaceGame3D as RaceGame, type RaceGameHandle } from './components/RaceGame3D';
import { CARS, DEFAULT_SETTINGS, DIFFICULTIES, TRACKS, formatTime, type Difficulty, type GamePhase, type RaceResult, type Settings } from './game/data';
import { RelaxMusic } from './game/audio';

type Tab = 'arcade' | 'garage' | 'tracks' | 'leaderboard';
type Dialog = 'help' | 'settings' | null;

const NAVIGATION: { id: Tab; label: string; number: string }[] = [
  { id: 'arcade', label: 'THE ARCADE', number: '01' },
  { id: 'garage', label: 'GARAGE', number: '02' },
  { id: 'tracks', label: 'TRACKS', number: '03' },
  { id: 'leaderboard', label: 'LEADERBOARD', number: '04' },
];

function readSaved<T,>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`nightshift89:${key}`);
    return raw ? JSON.parse(raw) ?? fallback : fallback;
  } catch { return fallback; }
}

function save(key: string, value: unknown) {
  try { localStorage.setItem(`nightshift89:${key}`, JSON.stringify(value)); } catch { /* The arcade also works without browser storage. */ }
}

function CheckerMark({ small = false }: { small?: boolean }) {
  return <span className={`checker-mark ${small ? 'checker-small' : ''}`} aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button className={`toggle ${checked ? 'is-on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={onChange}><span /></button>;
}

function PageHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className="page-heading secondary-heading"><div><div className="eyebrow section-eyebrow"><span />{eyebrow}</div><h1>{title}</h1></div><div className="heading-aside">{children}</div></div>;
}

const pageMotion = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.24 } };

export default function App() {
  const gameRef = useRef<RaceGameHandle>(null);
  const musicRef = useRef<RelaxMusic | null>(null);
  if (musicRef.current === null) musicRef.current = new RelaxMusic();
  const [tab, setTab] = useState<Tab>('arcade');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [carId, setCarId] = useState('veloce');
  const [garageId, setGarageId] = useState('veloce');
  const [trackId, setTrackId] = useState('miami');
  const [boardTrack, setBoardTrack] = useState('miami');
  const [paints, setPaints] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Settings>(() => {
    const stored = readSaved<Partial<Settings>>('settings', {});
    return {
      sound: typeof stored.sound === 'boolean' ? stored.sound : DEFAULT_SETTINGS.sound,
      music: typeof stored.music === 'boolean' ? stored.music : DEFAULT_SETTINGS.music,
      scanlines: typeof stored.scanlines === 'boolean' ? stored.scanlines : DEFAULT_SETTINGS.scanlines,
      autoAccelerate: typeof stored.autoAccelerate === 'boolean' ? stored.autoAccelerate : DEFAULT_SETTINGS.autoAccelerate,
      difficulty: DIFFICULTIES.some(d => d.id === stored.difficulty) ? stored.difficulty! : 'arcade',
    };
  });
  const [records, setRecords] = useState<RaceResult[]>(() => {
    const stored = readSaved<RaceResult[]>('records', []);
    return Array.isArray(stored) ? stored.filter(r => r && r.completed && Number.isFinite(r.time) && Number.isFinite(r.score) && typeof r.name === 'string' && CARS.some(c => c.id === r.carId) && TRACKS.some(t => t.id === r.trackId)) : [];
  });
  const [playerName, setPlayerName] = useState(() => {
    const stored = readSaved<string>('name', 'PLAYER 01');
    return typeof stored === 'string' ? stored.slice(0, 12) : 'PLAYER 01';
  });
  const [confirmClear, setConfirmClear] = useState(false);

  const selectedPaint = paints[carId];
  const car = useMemo(() => {
    const original = CARS.find(c => c.id === carId)!;
    return { ...original, color: selectedPaint || original.color };
  }, [carId, selectedPaint]);
  const track = TRACKS.find(t => t.id === trackId)!;
  const garageCar = CARS.find(c => c.id === garageId)!;
  const garageColor = paints[garageId] || garageCar.color;
  const bestRun = records.filter(r => r.trackId === trackId).sort((a, b) => a.time - b.time)[0];
  const difficulty = DIFFICULTIES.find(d => d.id === settings.difficulty)!;

  useEffect(() => save('settings', settings), [settings]);
  useEffect(() => save('records', records), [records]);
  useEffect(() => save('name', playerName), [playerName]);

  useEffect(() => { musicRef.current!.setEnabled(settings.music); }, [settings.music]);
  useEffect(() => {
    const music = musicRef.current!;
    const unlock = () => { void music.unlock(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  useEffect(() => () => musicRef.current?.destroy(), []);

  const navigate = (next: Tab) => {
    if (next !== 'arcade') gameRef.current?.pause();
    if (next === 'garage') setGarageId(carId);
    setTab(next);
  };
  const openDialog = (next: Dialog) => { gameRef.current?.pause(); setConfirmClear(false); setDialog(next); };
  const toggleSetting = (key: 'sound' | 'music' | 'scanlines' | 'autoAccelerate') => setSettings(previous => ({ ...previous, [key]: !previous[key] }));
  const changeDifficulty = (value: Difficulty) => {
    if (value !== settings.difficulty) gameRef.current?.reset();
    setSettings(previous => ({ ...previous, difficulty: value }));
  };
  const handleFinish = (result: RaceResult) => {
    if (result.completed) setRecords(previous => [{ ...result, name: playerName.trim() || 'PLAYER 01' }, ...previous].slice(0, 40));
  };
  const startSelectedRace = () => {
    setTab('arcade');
    requestAnimationFrame(() => gameRef.current?.start());
  };

  const leaderboard = useMemo(() => {
    const names = ['NEON GHOST', 'MIDNIGHT KID', 'TURBO LOVER', 'SUNSET DRIVER', 'LAST QUARTER'];
    const offset = boardTrack === 'pacific' ? 13 : boardTrack === 'midnight' ? 27 : boardTrack === 'mojave' ? 9 : 0;
    const house = names.map((name, i) => ({ id: `house-${i}`, name, carId: CARS[i % 3].id, time: [228.87, 243.14, 251.79, 267.46, 287.83][i] + offset, score: [93900, 85540, 81440, 70300, 61000][i], house: true, difficulty: 'arcade' as Difficulty }));
    const local = records.filter(r => r.trackId === boardTrack).map(r => ({ ...r, house: false }));
    return [...house, ...local].sort((a, b) => a.time - b.time).slice(0, 10);
  }, [boardTrack, records]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <header className="site-header">
          <div className="header-inner">
            <button className="brand" onClick={() => navigate('arcade')} aria-label="Nightshift 89, back to arcade"><CheckerMark /><span>NIGHTSHIFT<span className="brand-year">'89</span></span></button>
            <nav className="main-nav" aria-label="Main navigation">
              {NAVIGATION.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => navigate(item.id)} aria-current={tab === item.id ? 'page' : undefined}><span className="nav-number">{item.number}</span>{item.label}{item.id === 'arcade' && phase === 'paused' && <i className="nav-paused-dot" />}</button>)}
            </nav>
            <div className="header-actions"><div className="system-status"><span className="status-dot" />ALL SYSTEMS GO</div><div className="header-tools"><button className={`icon-button ${settings.sound ? 'sound-enabled' : ''}`} aria-label={settings.sound ? 'Mute sound' : 'Enable sound'} aria-pressed={settings.sound} title={settings.sound ? 'Sound on' : 'Sound off'} onClick={() => toggleSetting('sound')}>{settings.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button className={`icon-button ${settings.music ? 'music-enabled' : ''}`} aria-label={settings.music ? 'Turn relax music off' : 'Turn relax music on'} aria-pressed={settings.music} title={settings.music ? 'Relax music on' : 'Relax music off'} onClick={() => toggleSetting('music')}><Music size={18} /></button><button className="icon-button" aria-label="Open settings" title="Settings" onClick={() => openDialog('settings')}><SlidersHorizontal size={18} /></button></div></div>
          </div>
        </header>

        <main className="main-content">
          <section className={`arcade-page ${tab !== 'arcade' ? 'page-hidden' : ''}`} aria-hidden={tab !== 'arcade'}>
            <motion.div className="page-heading arcade-heading" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
              <div className="hero-identity"><div className="eyebrow section-eyebrow"><span />THE GOLDEN ERA. REIMAGINED.</div><h1>NIGHTSHIFT <span>'89</span><i aria-hidden="true" /></h1></div>
              <div className="heading-aside"><p>Late nights. Loud engines.<br />Welcome back to the golden era.</p><button className="text-button" onClick={() => openDialog('help')}><CircleHelp size={14} /> HOW TO PLAY <ArrowUpRight size={14} /></button></div>
            </motion.div>

            <motion.div className="arcade-machine" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.12 }}>
              <RaceGame ref={gameRef} car={car} track={track} settings={settings} interactive={tab === 'arcade' && dialog === null} onPhase={setPhase} onFinish={handleFinish} onLeaderboard={() => { setBoardTrack(trackId); navigate('leaderboard'); }} onToggleMusic={() => toggleSetting('music')} />
              <div className="race-configuration">
                <button className="configuration-item" onClick={() => navigate('tracks')}><MapPin size={20} /><span><span className="configuration-label">TONIGHT'S DESTINATION</span><strong>{track.name}</strong></span><ChevronRight className="configuration-arrow" size={15} /></button>
                <button className="configuration-item" onClick={() => navigate('garage')}><CarFront size={21} /><span><span className="configuration-label">YOUR GETAWAY CAR</span><strong>{car.name} <small>'{car.year.slice(2)}</small></strong></span><ChevronRight className="configuration-arrow" size={15} /></button>
                <button className="configuration-item" onClick={() => openDialog('settings')}><Gauge size={20} /><span><span className="configuration-label">THE CHALLENGE</span><strong>{difficulty.name} <small className="config-dot">/</small> 10 laps</strong></span><ChevronDown className="configuration-arrow" size={15} /></button>
                <button className="configuration-item best-configuration" onClick={() => { setBoardTrack(trackId); navigate('leaderboard'); }}><Trophy size={19} /><span><span className="configuration-label">YOUR PERSONAL BEST</span><strong className={bestRun ? 'lime' : 'empty-record'}>{bestRun ? formatTime(bestRun.time) : '-- : -- . --'}</strong></span><ArrowUpRight className="configuration-arrow" size={15} /></button>
              </div>
            </motion.div>

            <div className="below-game"><span className="arcade-motto"><span className="tiny-star">+</span> NO DOWNLOADS. NO PAYWALLS. JUST DRIVE.</span><button className="control-legend" onClick={() => openDialog('help')} aria-label="View all game controls"><span><span className="arrow-key-group"><kbd><ArrowLeft size={10} /></kbd><kbd><ArrowUp size={10} /></kbd><kbd><ArrowDown size={10} /></kbd><kbd><ArrowRight size={10} /></kbd></span> DRIVE</span><span><kbd>SHIFT</kbd> NITRO</span><span><kbd>ESC</kbd> PAUSE</span></button></div>
          </section>

          <AnimatePresence mode="wait">
            {tab === 'garage' && <motion.section key="garage" className="secondary-page" {...pageMotion}>
              <PageHeading eyebrow="THE GARAGE / ALL LEGENDS. NO LOCKS." title="PICK YOUR POISON."><p>Icons of an era.<br />The keys are on the dash.</p><span className="aside-index">03 MACHINES / ENDLESS NIGHTS</span></PageHeading>
              <div className="garage-showroom">
                <div className="garage-display" style={{ '--car-color': garageColor } as CSSProperties}>
                  <div className="showroom-topline"><span>REAR VIEW / PURE ATTITUDE</span><span>RWD <i /> 5-SPEED</span></div>
                  <span className="showroom-number" aria-hidden="true">0{CARS.findIndex(c => c.id === garageId) + 1}</span>
                  <div className="showroom-grid" /><div className="showroom-glow" />
                  <AnimatePresence mode="wait"><motion.div className="showroom-car" key={garageId} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}><CarPreview color={garageColor} model={garageId} /></motion.div></AnimatePresence>
                  <div className="showroom-bottomline"><span>{garageCar.year} ORIGINAL</span><span><span className="status-dot" /> ROAD READY</span></div>
                </div>
                <div className="garage-details"><span className="eyebrow lime">{garageCar.category}</span><h2>{garageCar.name}</h2><p>{garageCar.description}</p>
                  <div className="car-specs"><div><span>TOP SPEED</span><strong>{garageCar.topSpeed} <small>KM/H</small></strong></div><div><span>POWER</span><strong>{garageCar.power}</strong></div><div><span>CURB WEIGHT</span><strong>{garageCar.weight}</strong></div></div>
                  <div className="performance-bars"><div><span>ACCELERATION</span><div><i style={{ width: `${garageCar.acceleration}%` }} /></div></div><div><span>HANDLING</span><div><i style={{ width: `${garageCar.handling}%` }} /></div></div></div>
                  <div className="paint-picker"><span className="eyebrow">MAKE IT YOURS</span><div>{['#f25456', '#6cd4cd', '#efce7e', '#b59cde', '#ece8db'].map((color, i) => <button key={color} style={{ '--paint': color } as CSSProperties} className={garageColor === color ? 'selected' : ''} aria-label={`Paint ${['sunset red', 'glacier teal', 'champagne gold', 'midnight lavender', 'ivory white'][i]}`} aria-pressed={garageColor === color} onClick={() => setPaints(previous => ({ ...previous, [garageId]: color }))}>{garageColor === color && <Check size={13} />}</button>)}</div></div>
                  <button className="button button-primary garage-drive-button" onClick={() => { setCarId(garageId); navigate('arcade'); }}>{garageId === carId ? 'BACK TO THE STREETS' : 'TAKE THE KEYS'}<ArrowUpRight size={19} /></button>
                </div>
              </div>
              <div className="garage-choices">{CARS.map((option, i) => <button key={option.id} className={`garage-choice ${garageId === option.id ? 'selected' : ''}`} onClick={() => setGarageId(option.id)} aria-pressed={garageId === option.id}><span className="choice-number">0{i + 1}</span><CarPreview color={paints[option.id] || option.color} model={option.id} /><span><strong>{option.name}</strong><span>{option.year} / {option.topSpeed} KM/H</span></span>{garageId === option.id ? <Check size={17} /> : <ArrowUpRight size={17} />}</button>)}</div>
            </motion.section>}

            {tab === 'tracks' && <motion.section key="tracks" className="secondary-page" {...pageMotion}>
              <PageHeading eyebrow="THE CIRCUITS / THE LONG WAY HOME" title="FIND YOUR ESCAPE."><p>Some roads get you there.<br />These roads take you back.</p><span className="aside-index">04 DESTINATIONS / 10 LAPS EACH</span></PageHeading>
              <div className="track-choices">{TRACKS.map((option, i) => <button className={`track-choice ${trackId === option.id ? 'selected' : ''}`} key={option.id} onClick={() => setTrackId(option.id)} aria-pressed={trackId === option.id}>
                <span className="track-art"><img src={option.image} alt={`Pixel-art ${option.name} landscape`} /><span className="track-art-shade" /><span className="track-road"><i /><i /></span><CarPreview color={car.color} model={car.id} /><span className="track-number">0{i + 1}</span>{trackId === option.id && <span className="track-selected"><Check size={13} /> SELECTED</span>}</span>
                <span className="track-info"><span className="eyebrow">{option.location}</span><strong>{option.name}</strong><span className="track-description">{option.description}</span><span className="track-meta"><span>{option.distance} <i /> {option.turns} TURNS</span><ArrowUpRight size={21} /></span></span>
              </button>)}</div>
              <div className="tracks-bottom"><div><Flag size={21} /><span>FOUR CIRCUITS. ONE RULE.<strong>Make the night count.</strong></span></div><button className="button button-primary" onClick={startSelectedRace}>RACE THIS CIRCUIT <ArrowUpRight size={21} /></button></div>
            </motion.section>}

            {tab === 'leaderboard' && <motion.section key="leaderboard" className="secondary-page" {...pageMotion}>
              <PageHeading eyebrow="THE HALL OF NIGHTS / LOCAL LEGENDS" title="PROVE YOUR RUN."><p>Times worth bragging about,<br />saved right here in your browser.</p><span className="aside-index">TOP 10 / PER CIRCUIT</span></PageHeading>
              <div className="board-tabs">{TRACKS.map(option => <button key={option.id} className={boardTrack === option.id ? 'active' : ''} onClick={() => setBoardTrack(option.id)} aria-pressed={boardTrack === option.id}>{option.name}</button>)}</div>
              <div className="leaderboard-list">
                <div className="leaderboard-head"><span>POS</span><span>DRIVER</span><span>CAR</span><span>TIME</span><span>SCORE</span></div>
                {leaderboard.map((entry, index) => <div key={entry.id} className={`leaderboard-row ${'house' in entry && entry.house ? 'house-row' : ''} ${'house' in entry && !entry.house ? 'local-row' : ''}`}>
                  <span className="leaderboard-position">{String(index + 1).padStart(2, '0')}</span>
                  <span className="leaderboard-name">{entry.name}{'house' in entry && entry.house && <i title="House record" />}</span>
                  <span className="leaderboard-car"><CarPreview color={CARS.find(c => c.id === entry.carId)!.color} model={entry.carId} />{CARS.find(c => c.id === entry.carId)!.name}</span>
                  <span className="leaderboard-time">{formatTime(entry.time)}</span>
                  <span className="leaderboard-score">{entry.score.toLocaleString()}</span>
                </div>)}
                {!leaderboard.length && <div className="leaderboard-empty"><Flag size={26} /><strong>NO TIMES YET.</strong><span>Finish a race to claim the first spot.</span></div>}
              </div>
              <div className="board-note"><Info size={15} /> Rows with a dot are house records for flavor, not real players. Your finished runs join the board automatically.</div>
            </motion.section>}
          </AnimatePresence>

          <footer className="site-footer"><div><CheckerMark small /><span>GOOD NIGHTS. GREAT DRIVES.</span></div><span className="footer-middle">AN ANALOG SOUL IN A DIGITAL WORLD.</span><span className="footer-version">EST. 1989 <i /> V.1.0.89</span></footer>
        </main>

        <AnimatePresence>
          {dialog === 'help' && <Modal key="help" title="Driver's manual" onClose={() => setDialog(null)}><h2>OLD SCHOOL.<br /><span className="lime">ALL YOU.</span></h2><p className="modal-description">Ten laps. Eight drivers. One unforgettable night.</p>
            <div className="help-controls"><div><span className="help-keys"><kbd><ArrowUp size={17} /></kbd><kbd>W</kbd></span><span><strong>FIND THE REDLINE</strong><small>Hold to accelerate. The night won't wait.</small></span></div><div><span className="help-keys"><kbd><ArrowLeft size={17} /></kbd><kbd><ArrowRight size={17} /></kbd><small>/ A D</small></span><span><strong>FIND YOUR LINE</strong><small>Steer through the curves and past your rivals.</small></span></div><div><span className="help-keys"><kbd><ArrowDown size={17} /></kbd><kbd>S</kbd></span><span><strong>EASY ON THE PEDAL</strong><small>Brake before tight corners. Stay on the asphalt.</small></span></div><div><span className="help-keys"><kbd>SHIFT</kbd><small>/ SPACE</small></span><span><strong>A LITTLE EXTRA TROUBLE</strong><small>Hold for nitro. It recharges when you let go.</small></span></div><div><span className="help-keys"><kbd>ESC</kbd><kbd>P</kbd></span><span><strong>TAKE A PIT STOP</strong><small>Pause the race. Come back when you're ready.</small></span></div></div>
            <p className="help-tip"><Zap size={15} />On your phone? Touch controls appear when the race starts.</p><button className="button button-primary modal-main-button" onClick={() => { setDialog(null); if (tab === 'arcade' && phase === 'intro') gameRef.current?.start(); }}>{tab === 'arcade' && phase === 'intro' ? "GOT IT. LET'S RACE." : 'BACK TO THE NIGHT'}<ArrowUpRight size={19} /></button>
          </Modal>}

          {dialog === 'settings' && <Modal key="settings" title="The control room" onClose={() => setDialog(null)}><h2>YOUR NIGHT.<br /><span className="lime">YOUR RULES.</span></h2><p className="modal-description">Fine-tune the feeling. Keep the soul.</p>
            <div className="settings-list"><div className="setting-row"><span><strong>Driver name</strong><small>Leave your name on the high-score board.</small></span><input className="name-input" aria-label="Driver name" maxLength={12} value={playerName} onChange={event => setPlayerName(event.target.value.toUpperCase().replace(/[^A-Z0-9 _.-]/g, ''))} placeholder="PLAYER 01" /></div>
              <div className="setting-row"><span><strong>Engine audio</strong><small>Analog-inspired engines and arcade tones.</small></span><Toggle checked={settings.sound} label="Engine audio" onChange={() => toggleSetting('sound')} /></div>
              <div className="setting-row"><span><strong>Relax music</strong><small>A mellow synthwave loop for easy nights.</small></span><Toggle checked={settings.music} label="Relax music" onChange={() => toggleSetting('music')} /></div>
              <div className="setting-row"><span><strong>CRT scanlines</strong><small>A little texture from a simpler time.</small></span><Toggle checked={settings.scanlines} label="CRT scanlines" onChange={() => toggleSetting('scanlines')} /></div>
              <div className="setting-row"><span><strong>Auto-accelerate</strong><small>You steer. We'll keep the pedal down.</small></span><Toggle checked={settings.autoAccelerate} label="Auto-accelerate" onChange={() => toggleSetting('autoAccelerate')} /></div>
              <div className="setting-row difficulty-setting"><span><strong>The challenge</strong><small>Changing difficulty resets the current race.</small></span><div className="select-wrap"><select aria-label="Race difficulty" value={settings.difficulty} onChange={event => changeDifficulty(event.target.value as Difficulty)}>{DIFFICULTIES.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select><ChevronDown size={14} /></div></div>
            </div>
            <div className="settings-bottom"><button className={`clear-records ${confirmClear ? 'confirm-clear' : ''}`} disabled={!records.length} onClick={() => { if (confirmClear) { setRecords([]); setConfirmClear(false); } else setConfirmClear(true); }}>{confirmClear ? 'CONFIRM: CLEAR ALL LOCAL RUNS?' : 'CLEAR LOCAL RECORDS'}</button><span>SAVED AUTOMATICALLY</span></div><button className="button button-primary modal-main-button" onClick={() => setDialog(null)}>LOOKING GOOD <Check size={19} /></button>
          </Modal>}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
