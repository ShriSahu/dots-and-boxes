/**
 * Programmatic audio engine — generates all game sounds from scratch using
 * PCM math. No external audio files required; works fully offline.
 *
 * Sounds are encoded as WAV data URIs and loaded via expo-audio. Data URIs
 * (rather than writing to expo-file-system's cache dir) work identically on
 * native and web — the web build has no cache directory, which previously made
 * every sound fail to load silently.
 * Falls back silently if the expo-audio native module is unavailable.
 */
// Lazy import — expo-audio native module may be absent in some Expo Go versions
let AudioModule: any = null;
try {
  AudioModule = require('expo-audio');
} catch (_) { /* audio unavailable */ }

// ─── WAV encoder ─────────────────────────────────────────────────────────────

const SR = 22050; // sample rate (Hz)
const τ  = Math.PI * 2;

/** Encodes a Float32Array of mono PCM samples into a base64 WAV string. */
function buildWavBase64(samples: Float32Array): string {
  const n   = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v   = new DataView(buf);

  const ws = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };

  ws(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  ws(8, 'WAVE');
  ws(12, 'fmt ');
  v.setUint32(16, 16, true);    // PCM fmt chunk size
  v.setUint16(20, 1, true);     // PCM format
  v.setUint16(22, 1, true);     // mono
  v.setUint32(24, SR, true);    // sample rate
  v.setUint32(28, SR * 2, true);// byte rate
  v.setUint16(32, 2, true);     // block align (2 bytes / sample)
  v.setUint16(34, 16, true);    // bits per sample
  ws(36, 'data');
  v.setUint32(40, n * 2, true); // data chunk size

  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7FFF, true);
  }

  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

// ─── Sound generators ─────────────────────────────────────────────────────────

/** Crisp pen-on-paper click — plays on every line draw. */
function genClick(): Float32Array {
  const n = Math.floor(SR * 0.07);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    s[i] = Math.sin(τ * 1100 * t) * Math.exp(-t * 22) * 0.55;
  }
  return s;
}

/** Satisfying descending pop — plays when a box is claimed. */
function genPop(): Float32Array {
  const n = Math.floor(SR * 0.14);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t    = i / SR;
    const freq = 820 * Math.exp(-t * 9);         // chirp: high → low
    const env  = Math.exp(-t * 20) * 0.65;
    const noise = (Math.random() - 0.5) * Math.exp(-t * 30) * 0.15; // initial noise burst
    s[i] = Math.sin(τ * freq * t) * env + noise;
  }
  return s;
}

/** Richer pop for claiming 3+ boxes in a chain. */
function genChain(): Float32Array {
  const n = Math.floor(SR * 0.18);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t    = i / SR;
    const freq = 1000 * Math.exp(-t * 8);
    const env  = Math.exp(-t * 15) * 0.72;
    s[i] = (
      Math.sin(τ * freq * t)      * 0.6 +
      Math.sin(τ * freq * 2 * t)  * 0.22 +    // octave harmonic
      (Math.random() - 0.5)       * 0.1
    ) * env;
  }
  return s;
}

/** 4-note ascending fanfare — plays on winning a game. */
function genWin(): Float32Array {
  const notes   = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  const noteDur = 0.11;
  const total   = Math.floor(SR * (notes.length * noteDur + 0.2));
  const s       = new Float32Array(total);

  notes.forEach((freq, idx) => {
    const start = Math.floor(idx * noteDur * SR);
    const count = Math.floor((noteDur + 0.09) * SR); // slight overlap
    for (let i = 0; i < count && start + i < total; i++) {
      const t   = i / SR;
      const env = Math.exp(-t * 5) * 0.55;
      s[start + i] += (
        Math.sin(τ * freq * t)     * 1.0 +
        Math.sin(τ * freq * 2 * t) * 0.18  // octave harmonic
      ) * env;
    }
  });
  return s;
}

/** Gentle two-note "meh" — plays on a draw. */
function genDraw(): Float32Array {
  const n    = Math.floor(SR * 0.28);
  const half = Math.floor(n / 2);
  const s    = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t    = i / SR;
    const freq = i < half ? 440 : 370;
    const env  = i < half
      ? Math.min(1, i / (half * 0.3)) * Math.exp(-((i - half * 0.3) / half) * 4)
      : Math.exp(-((i - half) / half) * 6);
    s[i] = Math.sin(τ * freq * t) * env * 0.45;
  }
  return s;
}

/** Short urgent beep — plays when timer hits ≤3 seconds. */
function genTimerBeep(): Float32Array {
  const n = Math.floor(SR * 0.06);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.sin(Math.PI * i / n); // bell-shaped envelope
    s[i] = Math.sin(τ * 880 * t) * env * 0.5;
  }
  return s;
}

// ─── Cache & lifecycle ────────────────────────────────────────────────────────

type SoundName = 'click' | 'pop' | 'chain' | 'win' | 'draw' | 'timerBeep';

const cache    = new Map<SoundName, any>();
let initDone   = false;
let initPromise: Promise<void> | null = null;
let soundEnabled = true;

async function loadSound(name: SoundName, samples: Float32Array): Promise<void> {
  const uri = `data:audio/wav;base64,${buildWavBase64(samples)}`;
  const player = AudioModule.createAudioPlayer({ uri });
  cache.set(name, player);
}

/** Call once at app startup (or before first game screen). Idempotent. */
export async function initAudio(): Promise<void> {
  if (!AudioModule) return;
  if (initDone) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Not all options apply on web; ignore failures and keep loading sounds.
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
      }).catch(() => {});
      await Promise.all([
        loadSound('click',     genClick()),
        loadSound('pop',       genPop()),
        loadSound('chain',     genChain()),
        loadSound('win',       genWin()),
        loadSound('draw',      genDraw()),
        loadSound('timerBeep', genTimerBeep()),
      ]);
      initDone = true;
    } catch (e) {
      // Audio unavailable (simulator mute, etc.) — silently degrade
      console.warn('[audio] init failed:', e);
    }
  })();
  return initPromise;
}

/** Global sound on/off toggle (persisted by the caller, e.g. in AsyncStorage). */
export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

/** Play a named sound. No-ops gracefully if muted, not ready, or fails. */
export async function playSound(name: SoundName): Promise<void> {
  if (!soundEnabled) return;
  const player = cache.get(name);
  if (!player) return;
  try {
    await player.seekTo(0);
    player.play();
  } catch (_) {
    // Sound busy or unloaded — ignore
  }
}
