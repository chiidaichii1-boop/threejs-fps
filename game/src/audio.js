// Sound, synthesised: no audio files, no network. A WebAudio graph built
// from oscillators and filtered noise, so every shot, beep and boom is made
// on the machine. The context is created on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  function noise(when, duration, filterType, frequency, gainValue, q = 1) {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  function tone(when, duration, type, fromFreq, toFreq, gainValue) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, when);
    if (toFreq !== fromFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), when + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  // A gunshot is a short noise crack plus a low body thump. `kind` picks the
  // crack's brightness and the thump's weight; `far` muffles distant shots.
  function shot(kind, far = false) {
    if (!ensure()) return;
    const now = ctx.currentTime;
    const table = {
      pistol: { crack: 2400, thump: 130, dur: 0.09, gain: 0.5 },
      smg: { crack: 3000, thump: 150, dur: 0.07, gain: 0.42 },
      rifle: { crack: 1900, thump: 110, dur: 0.12, gain: 0.6 },
      shotgun: { crack: 1200, thump: 80, dur: 0.18, gain: 0.7 },
      sniper: { crack: 1500, thump: 70, dur: 0.22, gain: 0.75 },
    }[kind] || { crack: 2000, thump: 120, dur: 0.1, gain: 0.5 };
    const muffle = far ? 0.45 : 1;
    noise(now, table.dur, 'bandpass', table.crack * muffle, table.gain * (far ? 0.4 : 1), 0.8);
    tone(now, table.dur * 1.4, 'sine', table.thump, 45, table.gain * 0.8);
  }

  function beep(freq, duration = 0.09, gainValue = 0.25) {
    if (!ensure()) return;
    tone(ctx.currentTime, duration, 'square', freq, freq, gainValue);
  }

  return {
    unlock() {
      ensure();
    },
    shot,
    dry() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.05, 'square', 900, 500, 0.15);
    },
    reload() {
      if (!ensure()) return;
      const now = ctx.currentTime;
      tone(now, 0.05, 'square', 500, 300, 0.18);
      tone(now + 0.22, 0.05, 'square', 700, 400, 0.18);
    },
    hit() {
      beep(1400, 0.05, 0.2);
    },
    kill() {
      if (!ensure()) return;
      const now = ctx.currentTime;
      tone(now, 0.07, 'square', 1400, 1400, 0.22);
      tone(now + 0.08, 0.12, 'square', 1800, 1800, 0.22);
    },
    hurt() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.14, 'sawtooth', 180, 90, 0.25);
    },
    footstep() {
      if (!ensure()) return;
      noise(ctx.currentTime, 0.06, 'lowpass', 320, 0.12);
    },
    plantBeep() {
      beep(1050, 0.08, 0.2);
    },
    defuseBeep() {
      beep(760, 0.08, 0.2);
    },
    explosion() {
      if (!ensure()) return;
      const now = ctx.currentTime;
      noise(now, 0.9, 'lowpass', 420, 0.9);
      tone(now, 0.8, 'sine', 90, 28, 0.9);
      noise(now + 0.05, 0.35, 'bandpass', 900, 0.4, 0.6);
    },
    grenadeBounce() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.06, 'sine', 260, 140, 0.15);
    },
    buy() {
      if (!ensure()) return;
      const now = ctx.currentTime;
      tone(now, 0.08, 'sine', 660, 660, 0.2);
      tone(now + 0.09, 0.12, 'sine', 880, 880, 0.2);
    },
    click() {
      beep(1200, 0.04, 0.12);
    },
    roundWin() {
      if (!ensure()) return;
      const now = ctx.currentTime;
      [523, 659, 784].forEach((freq, i) => tone(now + i * 0.13, 0.22, 'triangle', freq, freq, 0.25));
    },
    roundLose() {
      if (!ensure()) return;
      const now = ctx.currentTime;
      [392, 330, 262].forEach((freq, i) => tone(now + i * 0.15, 0.26, 'triangle', freq, freq, 0.22));
    },
  };
}
