import AsyncStorage from '@react-native-async-storage/async-storage';
import { SpotBotScore } from '../types/spotbot.types';

const KEY = 'spotbot_score';

export async function loadSpotBotScore(): Promise<SpotBotScore> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { correctGuesses: 0, totalGuesses: 0 };
  } catch (_) {
    return { correctGuesses: 0, totalGuesses: 0 };
  }
}

export async function recordSpotBotGuess(correct: boolean): Promise<SpotBotScore> {
  const score = await loadSpotBotScore();
  const next: SpotBotScore = {
    correctGuesses: score.correctGuesses + (correct ? 1 : 0),
    totalGuesses:   score.totalGuesses + 1,
  };
  try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch (_) {}
  return next;
}
