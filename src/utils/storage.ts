import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameConfig, GameMode, Stats } from '../types/game.types';

const KEYS = {
  p1:         'db_p1',
  p2:         'db_p2',
  mode:       'db_mode',
  size:       'db_size',
  diff:       'db_diff',
  timer:      'db_timer',
  stats:      'db_stats',
  sound:      'db_sound',
  streak:     'db_streak',
  bestStreak: 'db_best',
};

const TUTORIAL_KEY = 'db_tutorial_seen';

export async function getTutorialSeen(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(TUTORIAL_KEY);
    return v === 'true';
  } catch (_) {
    return true; // on failure, skip tutorial to avoid blocking app
  }
}

export async function setTutorialSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(TUTORIAL_KEY, 'true');
  } catch (_) {}
}

export async function savePrefs(config: GameConfig): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [KEYS.p1,    config.p1Name],
      [KEYS.p2,    config.mode === 'ai' ? '' : config.p2Name],
      [KEYS.mode,  config.mode],
      [KEYS.size,  String(config.gridSize)],
      [KEYS.diff,  config.difficulty],
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
    const size  = parseInt(map[KEYS.size]  || '4', 10);
    const timer = parseInt(map[KEYS.timer] || '0', 10);
    return {
      p1Name:       map[KEYS.p1] || '',
      p2Name:       map[KEYS.p2] || '',
      mode:         (['2player', 'ai', 'online'].includes(map[KEYS.mode]) ? map[KEYS.mode] : '2player') as GameMode,
      gridSize:     ([3, 4, 5, 6].includes(size) ? size : 4) as any,
      difficulty:   (['easy', 'medium', 'hard'].includes(map[KEYS.diff]) ? map[KEYS.diff] : 'medium') as any,
      timerSeconds: ([0, 10, 15, 30].includes(timer) ? timer : 0) as any,
    };
  } catch (_) {
    return {};
  }
}

export async function loadStats(): Promise<Stats> {
  try {
    const [raw, streak, best] = await Promise.all([
      AsyncStorage.getItem(KEYS.stats),
      AsyncStorage.getItem(KEYS.streak),
      AsyncStorage.getItem(KEYS.bestStreak),
    ]);
    const base = raw ? JSON.parse(raw) : { w: 0, l: 0, d: 0 };
    return {
      w:          base.w          ?? 0,
      l:          base.l          ?? 0,
      d:          base.d          ?? 0,
      streak:     parseInt(streak ?? '0', 10),
      bestStreak: parseInt(best   ?? '0', 10),
    };
  } catch (_) {
    return { w: 0, l: 0, d: 0, streak: 0, bestStreak: 0 };
  }
}

export async function recordStat(result: 'w' | 'l' | 'd'): Promise<Stats> {
  try {
    const s = await loadStats();
    s[result] = (s[result] || 0) + 1;

    // Streak tracking: wins extend streak; losses/draws reset it
    if (result === 'w') {
      s.streak = (s.streak || 0) + 1;
      if (s.streak > (s.bestStreak || 0)) s.bestStreak = s.streak;
    } else {
      s.streak = 0;
    }

    await Promise.all([
      AsyncStorage.setItem(KEYS.stats,      JSON.stringify({ w: s.w, l: s.l, d: s.d })),
      AsyncStorage.setItem(KEYS.streak,     String(s.streak)),
      AsyncStorage.setItem(KEYS.bestStreak, String(s.bestStreak)),
    ]);
    return s;
  } catch (_) {
    return { w: 0, l: 0, d: 0, streak: 0, bestStreak: 0 };
  }
}

export async function resetStats(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([KEYS.stats, KEYS.streak, KEYS.bestStreak]);
  } catch (_) {}
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
