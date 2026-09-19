import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Flag, Maximize2, Minimize2, Music, Pause, Play, RotateCcw, Trophy, Zap } from 'lucide-react';
import { RacingEngine } from '../game/engine';
import { EMPTY_SNAPSHOT, TOTAL_LAPS, formatTime, type Car, type Control, type GamePhase, type RaceResult, type Settings, type Track } from '../game/data';

export interface RaceGameHandle {
  start: () => void;
  pause: () => void;
  reset: () => void;
}

interface RaceGameProps {
  car: Car;
  track: Track;
  settings: Settings;
  interactive: boolean;
  onPhase: (phase: GamePhase) => void;
  onFinish: (result: RaceResult) => void;
  onLeaderboard: () => void;
  onToggleMusic: () => void;
}

const KEY_CONTROLS: Record<string, Control> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'accelerate', KeyW: 'accelerate', ArrowDown: 'brake', KeyS: 'brake',
  ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'boost',
};

export const RaceGame = forwardRef<RaceGameHandle, RaceGameProps>(function RaceGame(props, ref) {
  const { car, track, settings, interactive } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RacingEngine | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const phaseRef = useRef<GamePhase>('intro');
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    phaseRef.current = 'intro';
    setPhase('intro');
    setResult(null);
    propsRef.current.onPhase('intro');
    const engine = new RacingEngine(canvasRef.current, {
      car, track, settings: propsRef.current.settings,
      onSnapshot: setSnapshot,
      onPhase: next => { phaseRef.current = next; setPhase(next); propsRef.current.onPhase(next); },
      onFinish: next => { setResult(next); propsRef.current.onFinish(next); },
    });
    engineRef.current = engine;
    return () => { engine.destroy(); engineRef.current = null; };
  }, [car, track]);

  useEffect(() => { engineRef.current?.setSettings(settings); }, [settings]);

  useEffect(() => { engineRef.current?.setVisible(interactive); }, [interactive, car, track]);

  useImperativeHandle(ref, () => ({
    start: () => engineRef.current?.start(),
    pause: () => engineRef.current?.pause(),
    reset: () => engineRef.current?.reset(),
  }), []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (!interactive || event.repeat && ['Enter', 'Escape', 'KeyP'].includes(event.code)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [role="dialog"]')) return;
      if (event.code === 'Enter' && target?.closest('button, a')) return;
      if (event.code === 'Escape' && expanded) {
        setExpanded(false); engineRef.current?.pause(); event.preventDefault(); return;
      }
      const current = phaseRef.current;
      if (event.code === 'Enter' && (current === 'intro' || current === 'finished')) {
        event.preventDefault(); engineRef.current?.start(); return;
      }
      if (event.code === 'Escape' || event.code === 'KeyP' || event.code === 'Enter' && current === 'paused') {
        if (current === 'paused') engineRef.current?.resume();
        else engineRef.current?.pause();
        event.preventDefault(); return;
      }
      const control = KEY_CONTROLS[event.code];
      if (control && (current === 'racing' || current === 'countdown')) {
        event.preventDefault(); engineRef.current?.setControl(control, true);
      }
    };
    const keyUp = (event: KeyboardEvent) => { const control = KEY_CONTROLS[event.code]; if (control) engineRef.current?.setControl(control, false); };
    const loseFocus = () => { engineRef.current?.clearControls(); engineRef.current?.pause(); };
    const visibility = () => { if (document.hidden) loseFocus(); };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', loseFocus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', loseFocus); document.removeEventListener('visibilitychange', visibility);
    };
  }, [interactive, expanded]);

  useEffect(() => {
    const change = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreen(active);
      if (!active) engineRef.current?.pause();
    };
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);

  const toggleFullscreen = async () => {
    if (expanded) { setExpanded(false); return; }
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    try {
      if (!stageRef.current?.requestFullscreen) throw new Error('Fullscreen unavailable');
      await stageRef.current.requestFullscreen();
    } catch { setExpanded(true); }
  };

  const showLeaderboard = async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* Continue to the local leaderboard if fullscreen was already closed. */ }
    }
    setExpanded(false);
    propsRef.current.onLeaderboard();
  };

  const touchButton = (control: Control, label: string, icon: ReactNode, extra = '') => (
    <button className={`touch-button ${extra}`} aria-label={label}
      onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engineRef.current?.setControl(control, true); }}
      onPointerUp={() => engineRef.current?.setControl(control, false)}
      onPointerCancel={() => engineRef.current?.setControl(control, false)}
      onLostPointerCapture={() => engineRef.current?.setControl(control, false)}>{icon}</button>
  );

  const isPlaying = phase === 'racing' || phase === 'countdown' || phase === 'paused';

  return (
    <div ref={stageRef} className={`game-stage ${phase === 'intro' ? 'is-intro' : ''} ${settings.scanlines ? 'has-scanlines' : ''} ${snapshot.boosting && phase === 'racing' ? 'is-boosting' : ''} ${expanded ? 'is-expanded' : ''}`} tabIndex={-1} aria-label="Nightshift 89 racing game">
      <canvas ref={canvasRef} className="game-canvas" role="img" aria-label="Pixel-art racing circuit. Use the arrow keys or WASD to drive, Shift to boost, and Escape to pause." />
      <span className="sr-only" aria-live="polite">{phase === 'racing' ? 'Go! The race has started.' : phase === 'paused' ? 'Race paused.' : phase === 'finished' ? 'Race finished.' : phase === 'countdown' ? 'Get ready. The race starts in three seconds.' : 'Ready to race.'}</span>
      <div className="game-vignette" />
      <div className="scanline-layer" />
      <div className="game-topbar">
        {phase === 'intro' ? <div className="stage-label"><span className="status-dot" /> ARCADE MODE <span className="stage-label-divider">/</span> <span className="stage-location">{track.location}</span></div> : <span />}
        <div className="game-utilities">
          {isPlaying && <button className="game-icon-button" aria-label={phase === 'paused' ? 'Resume race' : 'Pause race'} onClick={() => phase === 'paused' ? engineRef.current?.resume() : engineRef.current?.pause()}>{phase === 'paused' ? <Play size={16} /> : <Pause size={16} />}</button>}
          <button className={`game-icon-button ${settings.music ? 'music-enabled' : ''}`} aria-label={settings.music ? 'Turn relax music off' : 'Turn relax music on'} aria-pressed={settings.music} title={settings.music ? 'Relax music on' : 'Relax music off'} onClick={props.onToggleMusic}><Music size={16} /></button>
          <button className="game-icon-button" aria-label={fullscreen || expanded ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()}>{fullscreen || expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <motion.div key="intro" className="attract-content" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.35 }}>
            <div className="attract-eyebrow"><span className="mini-checker" /> THE STREETS ARE CALLING.</div>
            <h2>CHASE THE<br /><span>NIGHT.</span></h2>
            <p>Pure speed. Neon dreams. No quarters needed.</p>
            <button className="button button-primary start-button" onClick={() => engineRef.current?.start()}><span>START YOUR ENGINE</span><ArrowUpRight size={22} strokeWidth={1.7} /></button>
            <div className="enter-hint">or press <kbd>ENTER</kbd> to hit the road</div>
          </motion.div>
        )}
        {phase === 'countdown' && (
          <motion.div key="countdown" className="countdown-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="eyebrow">WELCOME TO THE NIGHT</span>
            <AnimatePresence mode="popLayout"><motion.strong key={snapshot.countdown} initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.75, opacity: 0 }} transition={{ duration: 0.22 }}>{Math.min(3, snapshot.countdown) || 'GO'}</motion.strong></AnimatePresence>
            <span className="countdown-tip">{settings.autoAccelerate ? 'AUTO-ACCELERATE ON. FIND YOUR LINE.' : 'HOLD UP OR W TO ACCELERATE'}</span>
          </motion.div>
        )}
        {phase === 'paused' && (
          <motion.div key="paused" className="game-overlay pause-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="eyebrow lime">PIT STOP / RACE PAUSED</span>
            <h2>TAKE A BREATHER.</h2><p>The night isn't going anywhere.</p>
            <button className="button button-primary" onClick={() => engineRef.current?.resume()}>BACK TO THE NIGHT <Play size={17} fill="currentColor" /></button>
            <div className="pause-secondary"><button onClick={() => engineRef.current?.start()}><RotateCcw size={14} /> RESTART RACE</button><button onClick={() => engineRef.current?.reset()}>EXIT TO ARCADE <ArrowUpRight size={14} /></button></div>
          </motion.div>
        )}
        {phase === 'finished' && result && (
          <motion.div key="result" className="game-overlay result-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="eyebrow lime">{result.completed ? `FINISH LINE / POSITION ${String(result.position).padStart(2, '0')}` : 'OUT OF TIME / NEVER OUT OF ROAD'}</span>
            <h2>{result.completed ? 'NIGHT. CONQUERED.' : 'ONE MORE RUN?'}</h2>
            <p>{result.completed ? 'Another memory for the rearview. Your run is on the local leaderboard.' : 'Every legend starts somewhere. Find your line and try again.'}</p>
            <div className="result-stats">
              <div><span>RACE TIME</span><strong>{formatTime(result.time)}</strong></div>
              <div><span>TOP SPEED</span><strong>{result.topSpeed}<small> KM/H</small></strong></div>
              <div><span>FINAL SCORE</span><strong>{result.score.toLocaleString()}</strong></div>
            </div>
            <div className="result-actions"><button className="button button-primary" onClick={() => engineRef.current?.start()}>ONE MORE NIGHT <RotateCcw size={17} /></button><button className="button button-outline" onClick={() => void showLeaderboard()}><Trophy size={16} /> LEADERBOARD</button></div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{phase === 'racing' && snapshot.elapsed < 0.75 && <motion.div className="race-go" initial={{ opacity: 0, scale: 1.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>GO!</motion.div>}</AnimatePresence>
      {phase === 'intro' && <div className="stage-bottom-label"><Flag size={12} /> ONE PLAYER. TEN LAPS. ALL HEART.</div>}
      {isPlaying && <>
        <div className="race-hud-top">
          <div className={`hud-stat ${snapshot.remaining < 20 ? 'time-warning' : ''}`}><span>TIME LEFT</span><strong>{formatTime(snapshot.remaining, false)}</strong></div>
          <div className="hud-stat"><span>LAP</span><strong>{String(snapshot.lap).padStart(2, '0')}<small> / {String(TOTAL_LAPS).padStart(2, '0')}</small></strong></div>
          <div className="hud-stat hud-position"><span>POSITION</span><strong>{String(snapshot.position).padStart(2, '0')}<small> / 08</small></strong></div>
        </div>
        <div className="race-hud-bottom">
          <div className="speed-display"><span className="speed-number">{String(snapshot.speed).padStart(3, '0')}</span><div><span>KM/H</span><span className="gear-indicator">GEAR {snapshot.gear}</span></div></div>
          <div className={`nitro-display ${snapshot.boosting ? 'nitro-active' : ''}`}><span><Zap size={12} fill="currentColor" /> NITRO <kbd>SHIFT</kbd></span><div className="nitro-meter"><div style={{ width: `${snapshot.nitro}%` }} /></div></div>
        </div>
        <div className="race-progress"><div style={{ width: `${snapshot.progress * 100}%` }} /></div>
      </>}
      {phase === 'racing' && snapshot.elapsed < 6 && snapshot.speed < 30 && <div className="accelerate-hint">HOLD <kbd><ArrowUp size={14} /></kbd> OR <kbd>W</kbd> TO ACCELERATE</div>}
      {phase === 'racing' && snapshot.collision && <div className="collision-flash" />}
      {(phase === 'racing' || phase === 'countdown') && <div className="touch-controls">
        <div>{touchButton('left', 'Steer left', <ArrowLeft size={23} />)}{touchButton('right', 'Steer right', <ArrowRight size={23} />)}</div>
        {touchButton('boost', 'Hold for nitro boost', <Zap size={21} />, 'touch-nitro')}
        <div>{touchButton('brake', 'Brake', <ArrowDown size={23} />)}{touchButton('accelerate', 'Accelerate', <ArrowUp size={23} />, 'touch-accelerate')}</div>
      </div>}
    </div>
  );
});
