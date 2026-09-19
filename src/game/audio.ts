const RELAX_CHORDS: { bass: number; notes: number[] }[] = [
  { bass: 110.0, notes: [220.0, 261.63, 329.63, 493.88] },
  { bass: 87.31, notes: [174.61, 261.63, 349.23, 440.0] },
  { bass: 130.81, notes: [261.63, 329.63, 392.0, 493.88] },
  { bass: 98.0, notes: [246.94, 293.66, 329.63, 440.0] },
];

const SPARKLE_NOTES = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

/** A mellow, fully synthesized synthwave loop. No files, no royalties, just vibes. */
export class RelaxMusic {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sparkleBus: GainNode | null = null;
  private timer: number | null = null;
  private stopTimer: number | null = null;
  private nextBar = 0;
  private bar = 0;
  private enabled = false;

  async unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) this.buildGraph();
      if (!this.context || !this.master) return;
      await this.context.resume();
      if (this.timer === null) {
        this.nextBar = this.context.currentTime + 0.15;
        this.timer = window.setInterval(() => this.schedule(), 220);
      }
      if (this.stopTimer !== null) { window.clearTimeout(this.stopTimer); this.stopTimer = null; }
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(0.2, this.context.currentTime, 1.1);
    } catch { /* Music is optional when browser autoplay restrictions apply. */ }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) { void this.unlock(); return; }
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.45);
      this.stopTimer = window.setTimeout(() => this.sleep(), 2200);
    }
  }

  private buildGraph() {
    this.context = new AudioContext();
    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 6;
    compressor.connect(this.context.destination);
    this.master = this.context.createGain();
    this.master.gain.value = 0;
    const warmth = this.context.createBiquadFilter();
    warmth.type = 'lowpass';
    warmth.frequency.value = 3400;
    this.master.connect(warmth).connect(compressor);
    this.sparkleBus = this.context.createGain();
    this.sparkleBus.gain.value = 0.8;
    this.sparkleBus.connect(this.master);
    const delay = this.context.createDelay(1);
    delay.delayTime.value = 0.42;
    const feedback = this.context.createGain();
    feedback.gain.value = 0.34;
    const wet = this.context.createGain();
    wet.gain.value = 0.5;
    this.sparkleBus.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.master);
  }

  private sleep() {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    this.stopTimer = null;
    void this.context?.suspend();
  }

  private schedule() {
    if (!this.context || !this.enabled) return;
    const beat = 60 / 72;
    const bar = beat * 4;
    while (this.nextBar < this.context.currentTime + 1.4) {
      this.scheduleBar(this.nextBar, this.bar % RELAX_CHORDS.length, bar);
      this.nextBar += bar;
      this.bar++;
    }
  }

  private scheduleBar(start: number, index: number, bar: number) {
    const context = this.context!;
    const master = this.master!;
    const chord = RELAX_CHORDS[index];

    for (let i = 0; i < chord.notes.length; i++) {
      const env = context.createGain();
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(0.048 - i * 0.006, start + 1.7);
      env.gain.setTargetAtTime(0, start + bar - 0.5, 0.85);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 880;
      env.connect(filter).connect(master);
      for (const detune of [-5, 5]) {
        const oscillator = context.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.value = chord.notes[i];
        oscillator.detune.value = detune;
        oscillator.connect(env);
        oscillator.start(start);
        oscillator.stop(start + bar + 2.8);
        oscillator.onended = () => { env.disconnect(); filter.disconnect(); };
      }
    }

    const bass = context.createOscillator();
    bass.type = 'sine';
    bass.frequency.value = chord.bass;
    const bassEnv = context.createGain();
    bassEnv.gain.setValueAtTime(0, start);
    bassEnv.gain.linearRampToValueAtTime(0.085, start + 0.55);
    bassEnv.gain.setTargetAtTime(0, start + bar * 0.55, 0.75);
    bass.connect(bassEnv).connect(master);
    bass.start(start);
    bass.stop(start + bar + 1.6);
    bass.onended = () => { bassEnv.disconnect(); };

    const sparkles = 2 + (index % 2);
    for (let s = 0; s < sparkles; s++) {
      const when = start + (Math.floor(Math.random() * 7) + 1) * (bar / 8);
      const frequency = SPARKLE_NOTES[Math.floor(Math.random() * SPARKLE_NOTES.length)];
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const env = context.createGain();
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(0.032, when + 0.03);
      env.gain.exponentialRampToValueAtTime(0.0001, when + 1.15);
      oscillator.connect(env);
      env.connect(this.sparkleBus!);
      oscillator.start(when);
      oscillator.stop(when + 1.25);
      oscillator.onended = () => { env.disconnect(); };
    }
  }

  destroy() {
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    this.timer = null;
    void this.context?.close();
  }
}

export class ArcadeAudio {
  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private enabled = false;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled && this.gain && this.context) this.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.1);
  }

  async unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.oscillator = this.context.createOscillator();
        this.oscillator.type = 'sawtooth';
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 380;
        this.gain = this.context.createGain();
        this.gain.gain.value = 0;
        this.oscillator.connect(filter).connect(this.gain).connect(this.context.destination);
        this.oscillator.start();
      }
      await this.context.resume();
    } catch { /* Audio is optional when browser autoplay restrictions apply. */ }
  }

  update(speedRatio: number, running: boolean, boost: boolean) {
    if (!this.context || !this.gain || !this.oscillator) return;
    const now = this.context.currentTime;
    const rpm = (speedRatio * 5) % 1;
    this.oscillator.frequency.setTargetAtTime(38 + rpm * 55 + speedRatio * 32, now, 0.1);
    this.gain.gain.setTargetAtTime(this.enabled && running ? (boost ? 0.035 : 0.023) : 0, now, 0.12);
  }

  private noiseBuffer(duration: number) {
    const context = this.context!;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private burst(source: AudioBufferSourceNode, gain: GainNode) {
    source.onended = () => { source.disconnect(); gain.disconnect(); };
  }

  /** Heavy crunch when scraping traffic. Noise burst + a low synth thud. */
  crash() {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer(0.45);
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, now);
    filter.frequency.exponentialRampToValueAtTime(160, now + 0.38);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    noise.connect(filter).connect(gain).connect(this.context.destination);
    noise.start(now);
    this.burst(noise, gain);
    const thud = this.context.createOscillator();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(130, now);
    thud.frequency.exponentialRampToValueAtTime(36, now + 0.26);
    const thudGain = this.context.createGain();
    thudGain.gain.setValueAtTime(0.16, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    thud.connect(thudGain).connect(this.context.destination);
    thud.start(now);
    thud.stop(now + 0.34);
    thud.onended = () => { thud.disconnect(); thudGain.disconnect(); };
  }

  /** Rising turbo sweep when the nitro kicks in. */
  nitro() {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(180, now);
    oscillator.frequency.exponentialRampToValueAtTime(920, now + 0.34);
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(1900, now + 0.34);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    oscillator.connect(filter).connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.44);
    oscillator.onended = () => { oscillator.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  /** Short airy whoosh for overtaking a rival. */
  whoosh() {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer(0.3);
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(1500, now + 0.22);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    noise.connect(filter).connect(gain).connect(this.context.destination);
    noise.start(now);
    this.burst(noise, gain);
  }

  private chime(frequencies: number[], gap: number, duration: number, type: OscillatorType, volume: number) {
    if (!this.enabled || !this.context) return;
    const start = this.context.currentTime;
    frequencies.forEach((frequency, i) => {
      const when = start + i * gap;
      const oscillator = this.context!.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const gain = this.context!.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(volume, when + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      oscillator.connect(gain).connect(this.context!.destination);
      oscillator.start(when);
      oscillator.stop(when + duration + 0.05);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }

  /** Bright arpeggio when a lap is complete. */
  lap() {
    this.chime([659.25, 880, 1318.5], 0.1, 0.3, 'square', 0.04);
  }

  /** Checkered-flag fanfare, or a soft descending run when time runs out. */
  finish(completed: boolean) {
    if (completed) this.chime([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.12, 0.42, 'square', 0.045);
    else this.chime([440, 349.23, 261.63], 0.16, 0.4, 'triangle', 0.05);
  }

  beep(frequency = 660, duration = 0.12) {
    if (!this.enabled || !this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.045, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  destroy() {
    this.oscillator?.stop();
    this.oscillator?.disconnect();
    void this.context?.close();
  }
}
