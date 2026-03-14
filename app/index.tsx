import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { loadPrefs, savePrefs, loadStats, resetStats as resetStatsStorage } from '../src/utils/storage';
import { getAnonymousUid } from '../src/services/firebase';
import { ensureUserProfile, subscribeToBalance, checkAndAwardDailyBonus } from '../src/services/coins';
import type { GameMode, GridSize, Difficulty, TimerOption, GameConfig, Stats } from '../src/types/game.types';

const GRID_SIZES: GridSize[]     = [3, 4, 5, 6];
const GRID_LABELS                = ['3×3', '4×4', '5×5', '6×6'];
const GRID_SUBS                  = ['9 boxes', '16 boxes', '25 boxes', '36 boxes'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const DIFF_SUBS                  = ['Random', 'Smart bot', 'Minimax AI'];
const TIMER_OPTS: TimerOption[]  = [0, 10, 15, 30];
const TIMER_LABELS               = ['Off', '10s', '15s', '30s'];

export default function HomeScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [mode, setMode]         = useState<GameMode>('2player');
  const [p1Name, setP1Name]     = useState('');
  const [p2Name, setP2Name]     = useState('');
  const [gridSize, setGridSize] = useState<GridSize>(4);
  const [difficulty, setDiff]   = useState<Difficulty>('medium');
  const [timerSecs, setTimer]   = useState<TimerOption>(0);
  const [stats, setStats]       = useState<Stats>({ w: 0, l: 0, d: 0 });
  const [coins, setCoins]       = useState(0);
  const [uid, setUid]           = useState('');

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
      const s = await loadStats();
      setStats(s);

      // Firebase auth + profile
      const id = await getAnonymousUid();
      setUid(id);
      const name = prefs.p1Name?.trim() || 'Player';
      await ensureUserProfile(id, name);
      await checkAndAwardDailyBonus(id);
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

  const handleResetStats = async () => {
    await resetStatsStorage();
    setStats({ w: 0, l: 0, d: 0 });
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Top bar: coin balance + shop ── */}
        <View style={s.topBar}>
          <View style={[s.coinBadge, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[s.coinText, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
              🪙 {coins}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.shopBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
            onPress={() => router.push('/shop')}
          >
            <Text style={[s.shopBtnText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
              Shop
            </Text>
          </TouchableOpacity>
        </View>

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

        <TouchableOpacity
          style={[s.startBtn, { backgroundColor: theme.text, shadowColor: theme.text }]}
          onPress={startGame}
          activeOpacity={0.82}
        >
          <Text style={[s.startBtnText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
            {mode === 'online' ? 'Go to Lobby →' : 'Start Game →'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
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

    titleWrap:  { alignItems: 'center', marginBottom: 4 },
    titleMain:  { fontSize: 52, fontWeight: '700', letterSpacing: -1, lineHeight: 56 },
    titleSub:   { fontSize: 16, marginTop: 2 },

    card: {
      borderWidth: 1.5, borderRadius: 12, padding: 18, width: '100%',
      shadowOffset: { width: 2, height: 3 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2,
    },
    cardTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },

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

    onlineInfoText: { fontSize: 15, lineHeight: 22 },

    startBtn: {
      borderRadius: 10, paddingVertical: 14, paddingHorizontal: 48,
      shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.3, shadowRadius: 0, elevation: 4,
    },
    startBtnText: { fontSize: 26, fontWeight: '700', letterSpacing: 0.5 },
  });
}
