import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { loadPrefs, savePrefs, loadStats, resetStats as resetStatsStorage, getTutorialSeen } from '../src/utils/storage';
import TutorialOverlay from '../src/components/TutorialOverlay';
import { getAnonymousUid } from '../src/services/firebase';
import { ensureUserProfile, subscribeToBalance, checkAndAwardDailyBonus } from '../src/services/coins';
import {
  joinQueue, cancelQueue,
  subscribeToMyMatch, subscribeToWaitingPool, attemptMatch,
} from '../src/services/matchmaking';
import type { GameMode, GridSize, Difficulty, TimerOption, GameConfig, Stats } from '../src/types/game.types';

const GRID_SIZES: GridSize[]     = [3, 4, 5, 6];
const GRID_LABELS                = ['3×3', '4×4', '5×5', '6×6'];
const GRID_SUBS                  = ['9 boxes', '16 boxes', '25 boxes', '36 boxes'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const DIFF_SUBS                  = ['Random', 'Smart bot', 'Minimax AI'];
const TIMER_OPTS: TimerOption[]  = [0, 10, 15, 30];
const TIMER_LABELS               = ['Off', '10s', '15s', '30s'];

type QuickPreset = {
  id: string;
  title: string;
  subtitle: string;
  config: Partial<Pick<GameConfig, 'mode' | 'gridSize' | 'difficulty' | 'timerSeconds'>>;
};

const QUICK_PRESETS: QuickPreset[] = [
  {
    id: 'blitz',
    title: 'Blitz',
    subtitle: '3x3 • AI • 10s',
    config: { mode: 'ai', gridSize: 3, difficulty: 'medium', timerSeconds: 10 },
  },
  {
    id: 'classic',
    title: 'Classic',
    subtitle: '4x4 • Local duel',
    config: { mode: '2player', gridSize: 4, timerSeconds: 0 },
  },
  {
    id: 'legend',
    title: 'Legend',
    subtitle: '5x5 • Hard AI • 15s',
    config: { mode: 'ai', gridSize: 5, difficulty: 'hard', timerSeconds: 15 },
  },
];

function getDailyChallenge() {
  const today = new Date();
  const daySeed = today.getFullYear() * 1000 + Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const options = [
    { title: 'Speed Draft', detail: 'Beat medium AI on 3x3 with a 10s timer.', reward: 'Warm-up and sharpen your opening.' },
    { title: 'Chain Hunter', detail: 'Win a 4x4 match and deny the last big chain.', reward: 'Best for improving endgame control.' },
    { title: 'Boss Board', detail: 'Survive hard AI on 5x5 and force a close finish.', reward: 'High difficulty, high brag value.' },
  ];
  return options[daySeed % options.length];
}

export default function HomeScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [mode, setMode]         = useState<GameMode>('2player');
  const [p1Name, setP1Name]     = useState('');
  const [p2Name, setP2Name]     = useState('');
  const [gridSize, setGridSize] = useState<GridSize>(4);
  const [difficulty, setDiff]   = useState<Difficulty>('medium');
  const [timerSecs, setTimer]   = useState<TimerOption>(0);
  const [stats, setStats]       = useState<Stats>({ w: 0, l: 0, d: 0, streak: 0, bestStreak: 0 });
  const [coins, setCoins]       = useState(0);
  const [uid, setUid]           = useState('');
  const [dailyBonus, setDailyBonus] = useState(0);
  const bonusAnim = useRef(new Animated.Value(0)).current;
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialSeen, setTutorialSeenState] = useState(false);
  const dailyChallengeCard = getDailyChallenge();

  type MatchState = 'idle' | 'waiting' | 'timeout';
  const [matchState, setMatchState] = useState<MatchState>('idle');
  const matchTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubPoolRef     = useRef<(() => void) | null>(null);
  const unsubMyMatchRef  = useRef<(() => void) | null>(null);
  const totalGames = stats.w + stats.l + stats.d;
  const winRate = totalGames ? Math.round((stats.w / totalGames) * 100) : 0;
  const masteryGoal = stats.w < 3 ? 3 : stats.w < 10 ? 10 : stats.w < 25 ? 25 : 50;
  const winsToGoal = Math.max(0, masteryGoal - stats.w);
  const recommendation = stats.bestStreak >= 4
    ? 'You are ready for 5x5 hard mode.'
    : stats.w >= 3
      ? 'Try timed matches to increase tension.'
      : 'Start with Blitz to learn board control quickly.';

  useEffect(() => {
    (async () => {
      // Load local prefs
      const prefs = await loadPrefs();
      if (prefs.p1Name)  setP1Name(prefs.p1Name);
      if (prefs.p2Name && prefs.mode !== 'ai') setP2Name(prefs.p2Name);
      if (prefs.mode)       setMode(prefs.mode);
      if (prefs.gridSize)   setGridSize(prefs.gridSize);
      if (prefs.difficulty) setDiff(prefs.difficulty);
      if (prefs.timerSeconds !== undefined) setTimer(prefs.timerSeconds);
      const st = await loadStats();
      setStats(st);
      const seen = await getTutorialSeen();
      setTutorialSeenState(seen);
      if (!seen) setShowTutorial(true);

      // Firebase auth + profile
      const id = await getAnonymousUid();
      setUid(id);
      const name = prefs.p1Name?.trim() || 'Player';
      await ensureUserProfile(id, name);
      const bonus = await checkAndAwardDailyBonus(id);
      if (bonus > 0) {
        setDailyBonus(bonus);
        Animated.sequence([
          Animated.timing(bonusAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.delay(2000),
          Animated.timing(bonusAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start(() => setDailyBonus(0));
      }
    })();
  }, []);

  // Subscribe to coin balance in real-time
  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeToBalance(uid, setCoins);
    return unsub;
  }, [uid]);

  const startGame = useCallback(async () => {
    if (mode === 'online') {
      router.push('/lobby');
      return;
    }
    const config: GameConfig = {
      mode,
      p1Name: p1Name.trim() || 'Player 1',
      p2Name: mode === 'ai' ? 'AI Bot' : (p2Name.trim() || 'Player 2'),
      gridSize,
      difficulty,
      timerSeconds: timerSecs,
    };
    await savePrefs(config);
    router.push({ pathname: '/game', params: { config: JSON.stringify(config) } });
  }, [mode, p1Name, p2Name, gridSize, difficulty, timerSecs]);

  const applyPreset = useCallback((preset: QuickPreset) => {
    setMode(preset.config.mode ?? '2player');
    setGridSize(preset.config.gridSize ?? 4);
    setDiff(preset.config.difficulty ?? 'medium');
    setTimer(preset.config.timerSeconds ?? 0);
  }, []);

  const handleResetStats = async () => {
    await resetStatsStorage();
    setStats({ w: 0, l: 0, d: 0, streak: 0, bestStreak: 0 });
  };

  const handleQuickMatch = useCallback(async () => {
    if (!uid) return;
    setMatchState('waiting');

    const name = p1Name.trim() || 'Player';

    // Join the queue
    await joinQueue(uid, name, gridSize);

    // Timeout after 30s
    matchTimeoutRef.current = setTimeout(async () => {
      await cancelQueue(uid);
      setMatchState('timeout');
      unsubPoolRef.current?.();
      unsubMyMatchRef.current?.();
    }, 30_000);

    // Listen to waiting pool — attempt match when partner appears
    unsubPoolRef.current = subscribeToWaitingPool(uid, async (partnerUid) => {
      await attemptMatch(uid, partnerUid);
    });

    // Listen to own doc for matched status
    unsubMyMatchRef.current = subscribeToMyMatch(uid, (roomCode, matchedGridSize, isHost) => {
      // Clean up
      if (matchTimeoutRef.current) clearTimeout(matchTimeoutRef.current);
      unsubPoolRef.current?.();
      unsubMyMatchRef.current?.();
      setMatchState('idle');
      router.push({
        pathname: '/online-game',
        params: {
          roomCode,
          isHost: isHost ? 'true' : 'false',
          myUid: uid,
          gridSize: String(matchedGridSize),
        },
      });
    });
  }, [uid, p1Name, gridSize]);

  const handleCancelMatch = useCallback(async () => {
    if (!uid) return;
    if (matchTimeoutRef.current) clearTimeout(matchTimeoutRef.current);
    unsubPoolRef.current?.();
    unsubMyMatchRef.current?.();
    await cancelQueue(uid);
    setMatchState('idle');
  }, [uid]);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Top bar: coin balance + leaderboard + shop ── */}
        <View style={s.topBar}>
          <View style={[s.coinBadge, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[s.coinText, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
              🪙 {coins}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.shopBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
            onPress={() => router.push('/leaderboard')}
          >
            <Text style={[s.shopBtnText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              🏆 Top
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.shopBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
            onPress={() => router.push('/shop')}
          >
            <Text style={[s.shopBtnText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              Shop
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.shopBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
            onPress={() => setShowTutorial(true)}
          >
            <Text style={[s.shopBtnText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              ?
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Daily bonus toast ── */}
        {dailyBonus > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[s.bonusBadge, { opacity: bonusAnim, backgroundColor: '#f5c842' }]}
          >
            <Text style={[s.bonusText, { fontFamily: theme.fontHandwritten }]}>
              +{dailyBonus} 🪙 Daily bonus!
            </Text>
          </Animated.View>
        )}

        {/* ── Title ── */}
        <View style={s.titleWrap}>
          <Text style={[s.titleMain, { fontFamily: theme.fontHandwritten }]}>
            <Text style={{ color: theme.p1 }}>Dots</Text>
            <Text style={{ color: theme.textMuted, fontFamily: theme.fontRegular }}> & </Text>
            <Text style={{ color: theme.p2 }}>Boxes</Text>
          </Text>
          <Text style={[s.titleSub, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
            the classic pen & paper game
          </Text>
        </View>

        <View style={[s.heroCard, { backgroundColor: theme.text, shadowColor: theme.text }]}>
          <Text style={[s.heroEyebrow, { color: theme.bg, fontFamily: theme.fontSemiBold }]}>
            Fast mobile strategy
          </Text>
          <Text style={[s.heroTitle, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
            Quick rounds. Smart AI. One more match energy.
          </Text>
          <Text style={[s.heroBody, { color: theme.bg, fontFamily: theme.fontRegular }]}>
            {recommendation}
          </Text>
          <View style={s.heroStats}>
            <View style={[s.heroStatPill, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <Text style={[s.heroStatValue, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
                {totalGames}
              </Text>
              <Text style={[s.heroStatLabel, { color: theme.bg, fontFamily: theme.fontRegular }]}>
                games
              </Text>
            </View>
            <View style={[s.heroStatPill, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <Text style={[s.heroStatValue, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
                {winRate}%
              </Text>
              <Text style={[s.heroStatLabel, { color: theme.bg, fontFamily: theme.fontRegular }]}>
                win rate
              </Text>
            </View>
            <View style={[s.heroStatPill, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <Text style={[s.heroStatValue, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
                {stats.bestStreak}
              </Text>
              <Text style={[s.heroStatLabel, { color: theme.bg, fontFamily: theme.fontRegular }]}>
                best streak
              </Text>
            </View>
          </View>
        </View>

        <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <View style={s.statsHeader}>
            <Text style={[s.cardTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold, marginBottom: 0 }]}>
              Quick Start
            </Text>
            <Text style={[s.quickHint, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              tap to load a proven setup
            </Text>
          </View>
          <View style={s.presetRow}>
            {QUICK_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[s.presetBtn, { borderColor: theme.border, backgroundColor: theme.bg }]}
                onPress={() => applyPreset(preset)}
              >
                <Text style={[s.presetTitle, { color: theme.text, fontFamily: theme.fontSemiBold }]}>
                  {preset.title}
                </Text>
                <Text style={[s.presetSubtitle, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
                  {preset.subtitle}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[s.challengeCard, { backgroundColor: theme.p2Light, borderColor: theme.p2 }]}>
          <Text style={[s.challengeEyebrow, { color: theme.p2, fontFamily: theme.fontSemiBold }]}>
            Daily Challenge
          </Text>
          <Text style={[s.challengeTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
            {dailyChallengeCard.title}
          </Text>
          <Text style={[s.challengeBody, { color: theme.text, fontFamily: theme.fontRegular }]}>
            {dailyChallengeCard.detail}
          </Text>
          <Text style={[s.challengeReward, { color: theme.p2, fontFamily: theme.fontRegular }]}>
            {dailyChallengeCard.reward}
          </Text>
        </View>

        {/* ── Mode ── */}
        <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Text style={[s.cardTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>✏️  Game Mode</Text>
          <View style={s.modeRow}>
            {(['2player', 'ai', 'online'] as GameMode[]).map(m => {
              const icon  = m === '2player' ? '👥' : m === 'ai' ? '🤖' : '🌐';
              const label = m === '2player' ? '2 Players' : m === 'ai' ? 'vs AI' : 'Online';
              const sub   = m === '2player' ? 'Local' : m === 'ai' ? 'Smart bot' : 'Multiplayer';
              const color = mode === m ? theme.p1 : theme.textMuted;
              return (
                <TouchableOpacity
                  key={m}
                  style={[
                    s.modeBtn,
                    { borderColor: theme.border },
                    mode === m && { borderColor: theme.p1, backgroundColor: theme.p1Light },
                  ]}
                  onPress={() => setMode(m)}
                >
                  <Text style={s.modeIcon}>{icon}</Text>
                  <Text style={[s.modeBtnText, { color, fontFamily: theme.fontSemiBold }]}>{label}</Text>
                  <Text style={[s.modeSub, { color, fontFamily: theme.fontRegular }]}>{sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Names (hidden for online) ── */}
        {mode !== 'online' && (
          <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[s.cardTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>🖊️  Player Names</Text>
            <Text style={[s.inputLabel, { color: theme.p1 }]}>Player 1 (Navy)</Text>
            <TextInput
              style={[s.input, { borderBottomColor: theme.p1, color: theme.text, fontFamily: theme.fontHandwritten }]}
              value={p1Name}
              onChangeText={setP1Name}
              placeholder="Your name…"
              placeholderTextColor={theme.border}
              maxLength={16}
            />
            <View style={{ height: 12 }} />
            <Text style={[s.inputLabel, { color: mode === 'ai' ? theme.textMuted : theme.p2 }]}>
              {mode === 'ai' ? 'AI Opponent' : 'Player 2 (Crimson)'}
            </Text>
            <TextInput
              style={[s.input, { borderBottomColor: theme.p2, color: theme.text, fontFamily: theme.fontHandwritten, opacity: mode === 'ai' ? 0.5 : 1 }]}
              value={mode === 'ai' ? 'AI Bot 🤖' : p2Name}
              onChangeText={setP2Name}
              placeholder="Opponent's name…"
              placeholderTextColor={theme.border}
              maxLength={16}
              editable={mode !== 'ai'}
            />
          </View>
        )}

        {/* ── AI Difficulty ── */}
        {mode === 'ai' && (
          <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[s.cardTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>🧠  AI Difficulty</Text>
            <View style={s.gridRow}>
              {DIFFICULTIES.map((d, i) => (
                <TouchableOpacity
                  key={d}
                  style={[s.gridBtn, { borderColor: theme.border }, difficulty === d && { borderColor: theme.p1, backgroundColor: theme.p1Light }]}
                  onPress={() => setDiff(d)}
                >
                  <Text style={[s.gridBtnText, { color: difficulty === d ? theme.p1 : theme.text, fontFamily: theme.fontSemiBold }]}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </Text>
                  <Text style={[s.gridBtnSub, { color: difficulty === d ? theme.p1 : theme.textMuted, fontFamily: theme.fontRegular }]}>
                    {DIFF_SUBS[i]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Grid size (hidden for online — set in lobby) ── */}
        {mode !== 'online' && (
          <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[s.cardTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>📐  Grid Size</Text>
            <View style={s.gridRow}>
              {GRID_SIZES.map((sz, i) => (
                <TouchableOpacity
                  key={sz}
                  style={[s.gridBtn, { borderColor: theme.border }, gridSize === sz && { borderColor: theme.p2, backgroundColor: theme.p2Light }]}
                  onPress={() => setGridSize(sz)}
                >
                  <Text style={[s.gridBtnText, { color: gridSize === sz ? theme.p2 : theme.text, fontFamily: theme.fontSemiBold }]}>
                    {GRID_LABELS[i]}
                  </Text>
                  <Text style={[s.gridBtnSub, { color: gridSize === sz ? theme.p2 : theme.textMuted, fontFamily: theme.fontRegular }]}>
                    {GRID_SUBS[i]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Timer (hidden for online) ── */}
        {mode !== 'online' && (
          <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[s.cardTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>⏱️  Turn Timer</Text>
            <View style={s.gridRow}>
              {TIMER_OPTS.map((t, i) => (
                <TouchableOpacity
                  key={t}
                  style={[s.gridBtn, { borderColor: theme.border }, timerSecs === t && { borderColor: theme.p1, backgroundColor: theme.p1Light }]}
                  onPress={() => setTimer(t)}
                >
                  <Text style={[s.gridBtnText, { color: timerSecs === t ? theme.p1 : theme.text, fontFamily: theme.fontSemiBold }]}>
                    {TIMER_LABELS[i]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Stats ── */}
        <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <View style={s.statsHeader}>
            <Text style={[s.cardTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>📊  Record</Text>
            <TouchableOpacity onPress={handleResetStats} style={[s.resetBtn, { borderColor: theme.border }]}>
              <Text style={[s.resetBtnText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>reset</Text>
            </TouchableOpacity>
          </View>
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={[s.statNum, { color: theme.text, fontFamily: theme.fontHandwritten }]}>{stats.w}</Text>
              <Text style={[s.statLbl, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>Wins</Text>
            </View>
            <Text style={[s.statSep, { color: theme.border, fontFamily: theme.fontRegular }]}>—</Text>
            <View style={s.statItem}>
              <Text style={[s.statNum, { color: theme.text, fontFamily: theme.fontHandwritten }]}>{stats.l}</Text>
              <Text style={[s.statLbl, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>Losses</Text>
            </View>
            <Text style={[s.statSep, { color: theme.border, fontFamily: theme.fontRegular }]}>—</Text>
            <View style={s.statItem}>
              <Text style={[s.statNum, { color: theme.text, fontFamily: theme.fontHandwritten }]}>{stats.d}</Text>
              <Text style={[s.statLbl, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>Draws</Text>
            </View>
          </View>
          {stats.streak >= 2 && (
            <View style={[s.streakRow, { marginTop: 10 }]}>
              <Text style={[s.streakText, { color: theme.p1, fontFamily: theme.fontHandwritten }]}>
                🔥 {stats.streak} win streak!
              </Text>
              {stats.bestStreak > stats.streak && (
                <Text style={[s.streakBest, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
                  Best: {stats.bestStreak}
                </Text>
              )}
            </View>
          )}
        </View>

        <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Text style={[s.cardTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>
            Mastery Track
          </Text>
          <Text style={[s.masteryTitle, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
            {winsToGoal === 0 ? `Milestone ${masteryGoal} cleared` : `${winsToGoal} wins to reach ${masteryGoal}`}
          </Text>
          <Text style={[s.masteryBody, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
            Stack AI wins, build streaks, then push into harder boards for better clips and better shareable results.
          </Text>
          <View style={[s.masteryBar, { backgroundColor: theme.border }]}>
            <View
              style={[
                s.masteryFill,
                { backgroundColor: theme.p1, width: `${Math.min(100, Math.round((stats.w / masteryGoal) * 100))}%` },
              ]}
            />
          </View>
        </View>

        {/* ── Online info card ── */}
        {mode === 'online' && (
          <View style={[s.card, { backgroundColor: theme.p1Light, borderColor: theme.p1 }]}>
            <Text style={[s.onlineInfoText, { color: theme.p1, fontFamily: theme.fontRegular }]}>
              🌐  You'll set your name and grid size in the lobby.{'\n'}
              Win online to earn <Text style={{ fontFamily: theme.fontHandwritten }}>+25 🪙</Text>
            </Text>
          </View>
        )}

        {mode === 'online' ? (
          <View style={{ width: '100%', gap: 10 }}>
            {matchState === 'waiting' ? (
              <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.p1, alignItems: 'center', gap: 10 }]}>
                <Text style={[s.cardTitle, { color: theme.p1, fontFamily: theme.fontHandwritten }]}>
                  Looking for a match…
                </Text>
                <TouchableOpacity
                  style={[s.shopBtn, { borderColor: theme.border, paddingHorizontal: 24 }]}
                  onPress={handleCancelMatch}
                >
                  <Text style={[s.shopBtnText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            ) : matchState === 'timeout' ? (
              <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border, alignItems: 'center' }]}>
                <Text style={[{ color: theme.textMuted, fontFamily: theme.fontRegular, textAlign: 'center', fontSize: 14 }]}>
                  No players found. Try again or use a room code instead.
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[s.startBtn, { backgroundColor: theme.text, shadowColor: theme.text }]}
              onPress={handleQuickMatch}
              disabled={matchState === 'waiting'}
              activeOpacity={0.82}
            >
              <Text style={[s.startBtnText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
                Quick Match →
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.startBtn, { backgroundColor: 'transparent', borderWidth: 2, borderColor: theme.border }]}
              onPress={() => router.push('/lobby')}
              activeOpacity={0.82}
            >
              <Text style={[s.startBtnText, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
                Use Room Code
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.startBtn, { backgroundColor: theme.text, shadowColor: theme.text }]}
            onPress={startGame}
            activeOpacity={0.82}
          >
            <Text style={[s.startBtnText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
              Start Game →
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
      {showTutorial && (
        <TutorialOverlay
          onDone={() => setShowTutorial(false)}
          replayMode={tutorialSeen}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    safe:   { flex: 1 },
    scroll: { alignItems: 'center', padding: 20, gap: 14 },

    topBar: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', width: '100%', marginBottom: 4,
    },
    coinBadge: {
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5,
    },
    coinText:  { fontSize: 18, fontWeight: '700' },
    shopBtn: {
      borderWidth: 1.5, borderRadius: 16,
      paddingHorizontal: 14, paddingVertical: 5,
    },
    shopBtnText: { fontSize: 15 },

    bonusBadge: {
      position: 'absolute',
      top: 60,
      alignSelf: 'center',
      backgroundColor: '#f5c842',
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
      zIndex: 10,
      elevation: 10,
    },
    bonusText: {
      fontSize: 18,
      fontWeight: '700',
      color: '#2a2418',
    },

    titleWrap:  { alignItems: 'center', marginBottom: 4 },
    titleMain:  { fontSize: 52, fontWeight: '700', letterSpacing: -1, lineHeight: 56 },
    titleSub:   { fontSize: 16, marginTop: 2 },
    heroCard: {
      width: '100%',
      borderRadius: 22,
      padding: 20,
      gap: 10,
      shadowOffset: { width: 4, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 0,
      elevation: 5,
    },
    heroEyebrow: {
      fontSize: 14,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    heroTitle: {
      fontSize: 32,
      lineHeight: 34,
      fontWeight: '700',
    },
    heroBody: {
      fontSize: 16,
      lineHeight: 22,
      maxWidth: '92%',
    },
    heroStats: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 6,
    },
    heroStatPill: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    heroStatValue: {
      fontSize: 24,
      fontWeight: '700',
    },
    heroStatLabel: {
      fontSize: 12,
    },

    card: {
      borderWidth: 1.5, borderRadius: 12, padding: 18, width: '100%',
      shadowOffset: { width: 2, height: 3 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2,
    },
    cardTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
    quickHint: { fontSize: 12 },
    presetRow: { flexDirection: 'row', gap: 8 },
    presetBtn: {
      flex: 1,
      borderWidth: 1.5,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 10,
      minHeight: 78,
      justifyContent: 'center',
    },
    presetTitle: { fontSize: 17, fontWeight: '600' },
    presetSubtitle: { fontSize: 12, marginTop: 4 },
    challengeCard: {
      width: '100%',
      borderWidth: 1.5,
      borderRadius: 18,
      padding: 18,
      gap: 6,
    },
    challengeEyebrow: {
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    challengeTitle: {
      fontSize: 28,
      fontWeight: '700',
    },
    challengeBody: {
      fontSize: 15,
      lineHeight: 21,
    },
    challengeReward: {
      fontSize: 14,
    },

    modeRow: { flexDirection: 'row', gap: 8 },
    modeBtn: {
      flex: 1, alignItems: 'center', padding: 12,
      borderWidth: 2, borderRadius: 10, gap: 4,
    },
    modeIcon:    { fontSize: 26 },
    modeBtnText: { fontSize: 16, fontWeight: '600' },
    modeSub:     { fontSize: 11 },

    inputLabel: { fontFamily: 'Caveat_400Regular', fontSize: 14, marginBottom: 2 },
    input: {
      fontSize: 20, borderBottomWidth: 2,
      paddingVertical: 4, paddingHorizontal: 2, backgroundColor: 'transparent',
    },

    gridRow: { flexDirection: 'row', gap: 8 },
    gridBtn: {
      flex: 1, alignItems: 'center', paddingVertical: 10,
      borderWidth: 2, borderRadius: 8,
    },
    gridBtnText: { fontSize: 17, fontWeight: '600' },
    gridBtnSub:  { fontSize: 11, marginTop: 1 },

    statsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    resetBtn: { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
    resetBtnText: { fontSize: 13 },
    statsRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 },
    statItem:  { alignItems: 'center', gap: 2 },
    statNum:   { fontSize: 32, fontWeight: '700' },
    statLbl:   { fontSize: 12 },
    statSep:   { fontSize: 20, marginBottom: 16 },

    streakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    streakText: { fontSize: 22, fontWeight: '700' },
    streakBest: { fontSize: 14 },
    masteryTitle: {
      fontSize: 26,
      fontWeight: '700',
      marginBottom: 4,
    },
    masteryBody: {
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 12,
    },
    masteryBar: {
      height: 10,
      borderRadius: 999,
      overflow: 'hidden',
    },
    masteryFill: {
      height: '100%',
      borderRadius: 999,
    },

    onlineInfoText: { fontSize: 15, lineHeight: 22 },

    startBtn: {
      borderRadius: 10, paddingVertical: 14, paddingHorizontal: 48,
      shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.3, shadowRadius: 0, elevation: 4,
    },
    startBtnText: { fontSize: 26, fontWeight: '700', letterSpacing: 0.5 },
  });
}
