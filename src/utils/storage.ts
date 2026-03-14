import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameConfig, Stats } from '../types/game.types';

const KEYS = {
  p1: 'db_p1',
  p2: 'db_p2',
  mode: 'db_mode',
  size: 'db_size',
  diff: 'db_diff',
  timer: 'db_timer',
  stats: 'db_stats',
  sound: 'db_sound',
};

export async function savePrefs(config: GameConfig): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [KEYS.p1, config.p1Name],
      [KEYS.p2, config.mode === 'ai' ? '' : config.p2Name],
      [KEYS.mode, config.mode],
      [KEYS.size, String(config.gridSize)],
      [KEYS.diff, config.difficulty],
      [KEYS.timer, String(config.timerSeconds)],
    ]);
  } catch (_) {}
}

export async function loadPrefs(): Promise<Partial<GameConfig>> {
  try {
    const pairs = await AsyncStorage.multiGet([
      KEYS.p1, KEYS.p2, KEYS.mode, KEYS.size, KEYS.diff, KEYS.timer,
    ]);
    const map = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? '']));
    const size = parseInt(map[KEYS.size] || '4', 10);
    const timer = parseInt(map[KEYS.timer] || '0', 10);
    return {
      p1Name: map[KEYS.p1] || '',
      p2Name: map[KEYS.p2] || '',
      mode: (map[KEYS.mode] === 'ai' ? 'ai' : '2player'),
      gridSize: ([3, 4, 5, 6].includes(size) ? size : 4) as any,
      difficulty: (['easy', 'medium', 'hard'].includes(map[KEYS.diff]) ? map[KEYS.diff] : 'medium') as any,
      timerSeconds: ([0, 10, 15, 30].includes(timer) ? timer : 0) as any,
    };
  } catch (_) {
    return {};
  }
}

export async function loadStats(): Promise<Stats> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.stats);
    return raw ? JSON.parse(raw) : { w: 0, l: 0, d: 0 };
  } catch (_) {
    return { w: 0, l: 0, d: 0 };
  }
}

export async function recordStat(result: 'w' | 'l' | 'd'): Promise<Stats> {
  try {
    const s = await loadStats();
    s[result] = (s[result] || 0) + 1;
    await AsyncStorage.setItem(KEYS.stats, JSON.stringify(s));
    return s;
  } catch (_) {
    return { w: 0, l: 0, d: 0 };
  }
}

export async function resetStats(): Promise<void> {
  try { await AsyncStorage.removeItem(KEYS.stats); } catch (_) {}
}

export async function loadSoundPref(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEYS.sound);
    return v !== '0';
  } catch (_) { return true; }
}

export async function saveSoundPref(enabled: boolean): Promise<void> {
  try { await AsyncStorage.setItem(KEYS.sound, enabled ? '1' : '0'); } catch (_) {}
}
