import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Animated, Pressable,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { theme } from '../src/constants/theme';
import { useGameEngine } from '../src/hooks/useGameEngine';
import GameBoard from '../src/components/GameBoard';
import ScoreBar from '../src/components/ScoreBar';
import type { GameConfig, GameResult, LineId } from '../src/types/game.types';
import { recordStat } from '../src/utils/storage';
import { getAnonymousUid } from '../src/services/firebase';
import { awardCoins } from '../src/services/coins';

export default function GameScreen() {
  const params = useLocalSearchParams<{ config: string }>();
  const config: GameConfig = JSON.parse(params.config as string);

  const [toast, setToast]         = useState<{ text: string; color: string } | null>(null);
  const [result, setResult]       = useState<GameResult | null>(null);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const toastOpacity  = useRef(new Animated.Value(0)).current;
  const coinAnim      = useRef(new Animated.Value(0)).current;
  const toastTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGameOver  = useRef(false);
  const coinsAwarded  = useRef(false);

  // ── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((text: string, color: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, color });
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(toastOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start(() => {
      toastTimer.current = setTimeout(() => setToast(null), 50);
    });
  }, [toastOpacity]);

  // ── Game engine ──────────────────────────────────────────────────────────
  const { state, isAIThinking, timerRemaining, drawLine, undoMove, resetGame } =
    useGameEngine(config, {
      onBoxClaimed: (count, player) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const name  = player === 1 ? config.p1Name : config.p2Name;
        const color = player === 1 ? theme.p1 : theme.p2;
        showToast(`${name} +${count} box${count > 1 ? 'es' : ''}!`, color);
      },
      onTurnSwitch: (next) => {
        if (config.mode === '2player') {
          const name  = next === 1 ? config.p1Name : config.p2Name;
          const color = next === 1 ? theme.p1 : theme.p2;
          showToast(`${name}'s turn`, color);
        }
      },
      onAutoSkip: (playerName) => {
        showToast(`Time's up — ${playerName} skipped`, theme.textMuted);
      },
    });

  // ── Game over detection ───────────────────────────────────────────────────
  useEffect(() => {
    if (state.isGameOver && !prevGameOver.current) {
      prevGameOver.current = true;
      const { scores } = state;
      const winner: GameResult['winner'] =
        scores.p1 > scores.p2 ? 'p1' :
        scores.p2 > scores.p1 ? 'p2' : 'draw';
      setResult({ winner, scores, p1Name: config.p1Name, p2Name: config.p2Name });
      if (config.mode === 'ai') {
        recordStat(winner === 'p1' ? 'w' : winner === 'p2' ? 'l' : 'd');

        // Award coins for AI games
        if (!coinsAwarded.current) {
          coinsAwarded.current = true;
          let delta = 1; // participation / loss
          let reason: 'win' | 'draw' | 'participation' = 'participation';
          if (winner === 'p1')   { delta = 10; reason = 'win'; }
          else if (winner === 'draw') { delta = 3; reason = 'draw'; }
          setCoinsEarned(delta);
          getAnonymousUid().then(uid => awardCoins(uid, delta, reason, null));

          coinAnim.setValue(0);
          Animated.sequence([
            Animated.timing(coinAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.delay(600),
            Animated.timing(coinAnim, { toValue: 2, duration: 400, useNativeDriver: true }),
          ]).start();
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (!state.isGameOver) {
      prevGameOver.current = false;
      coinsAwarded.current = false;
    }
  }, [state.isGameOver]); // eslint-disable-line

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLineTap = (line: LineId) => {
    if (isAIThinking || state.isGameOver) return;
    if (config.mode === 'ai' && state.currentPlayer === 2) return;
    Haptics.selectionAsync();
    drawLine(line);
  };

  const handleNewGame = () => {
    setResult(null);
    resetGame();
  };

  const boardDisabled =
    isAIThinking || state.isGameOver ||
    (config.mode === 'ai' && state.currentPlayer === 2);

  const coinTranslateY = coinAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, -60, -60],
  });
  const coinOpacity = coinAnim.interpolate({
    inputRange: [0, 0.3, 1, 1.5, 2],
    outputRange: [0, 1, 1, 1, 0],
  });

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Text style={styles.iconBtnText}>←</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          <Text style={{ color: theme.p1 }}>Dots</Text>
          <Text style={{ color: theme.textMuted }}> & </Text>
          <Text style={{ color: theme.p2 }}>Boxes</Text>
        </Text>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={undoMove}
          disabled={state.history.length === 0 || state.isGameOver}
        >
          <Text style={[
            styles.iconBtnText,
            (state.history.length === 0 || state.isGameOver) && styles.iconBtnDisabled,
          ]}>
            ↩
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Score bar ── */}
      <View style={styles.scoreWrap}>
        <ScoreBar
          state={state}
          config={config}
          isAIThinking={isAIThinking}
          timerRemaining={timerRemaining}
          timerMax={config.timerSeconds}
        />
      </View>

      {/* ── Board ── */}
      <View style={styles.boardWrap}>
        <GameBoard
          state={state}
          config={config}
          onLineTap={handleLineTap}
          disabled={boardDisabled}
        />
      </View>

      {/* ── Toast ── */}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[styles.toast, { opacity: toastOpacity, borderColor: toast.color }]}
        >
          <Text style={[styles.toastText, { color: toast.color }]}>{toast.text}</Text>
        </Animated.View>
      )}

      {/* ── Game over overlay ── */}
      {result && (
        <Pressable style={styles.overlay}>
          <View style={styles.resultCard}>
            <Text style={styles.resultEmoji}>
              {result.winner === 'draw' ? '🤝' : '🎉'}
            </Text>

            <Text style={styles.resultTitle}>
              {result.winner === 'draw'
                ? "It's a Draw!"
                : `${result.winner === 'p1' ? result.p1Name : result.p2Name} Wins!`}
            </Text>

            <View style={styles.resultScoreRow}>
              <Text style={[styles.resultScoreName, { color: theme.p1 }]}>
                {result.p1Name}
              </Text>
              <Text style={styles.resultScoreNums}>
                <Text style={{ color: theme.p1 }}>{result.scores.p1}</Text>
                <Text style={{ color: theme.textMuted }}>  —  </Text>
                <Text style={{ color: theme.p2 }}>{result.scores.p2}</Text>
              </Text>
              <Text style={[styles.resultScoreName, { color: theme.p2 }]}>
                {result.p2Name}
              </Text>
            </View>

            {config.mode === 'ai' && coinsEarned > 0 && (
              <Text style={[styles.coinLabel, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
                🪙 +{coinsEarned} coins earned
              </Text>
            )}

            <View style={styles.resultBtns}>
              <TouchableOpacity
                style={styles.resultBtnSecondary}
                onPress={() => router.back()}
              >
                <Text style={styles.resultBtnSecondaryText}>← Menu</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resultBtnPrimary}
                onPress={handleNewGame}
                activeOpacity={0.82}
              >
                <Text style={styles.resultBtnPrimaryText}>Play Again →</Text>
              </TouchableOpacity>
            </View>
          </View>

          {config.mode === 'ai' && coinsEarned > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[styles.coinFloat, { opacity: coinOpacity, transform: [{ translateY: coinTranslateY }] }]}
            >
              <Text style={[styles.coinFloatText, { color: '#f5c842', fontFamily: theme.fontHandwritten }]}>
                +{coinsEarned} 🪙
              </Text>
            </Animated.View>
          )}
        </Pressable>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: {
    fontFamily: theme.fontHandwritten,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: theme.bgCard,
    borderWidth: 1.5,
    borderColor: theme.border,
  },
  iconBtnText: {
    fontFamily: theme.fontHandwritten,
    fontSize: 24,
    color: theme.text,
    fontWeight: '700',
  },
  iconBtnDisabled: {
    opacity: 0.3,
  },

  // Score
  scoreWrap: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },

  // Board
  boardWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Toast
  toast: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    backgroundColor: theme.bgCard,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 9,
    shadowColor: theme.shadow,
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
  toastText: {
    fontFamily: theme.fontSemiBold,
    fontSize: 18,
    fontWeight: '600',
  },

  // Game over overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(42,36,24,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultCard: {
    backgroundColor: theme.bg,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: theme.border,
    padding: 28,
    width: '82%',
    alignItems: 'center',
    gap: 10,
    shadowColor: theme.text,
    shadowOffset: { width: 4, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 0,
    elevation: 12,
  },
  resultEmoji: {
    fontSize: 52,
    lineHeight: 60,
  },
  resultTitle: {
    fontFamily: theme.fontHandwritten,
    fontSize: 36,
    fontWeight: '700',
    color: theme.text,
    textAlign: 'center',
  },
  resultScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  resultScoreName: {
    fontFamily: theme.fontSemiBold,
    fontSize: 16,
    fontWeight: '600',
  },
  resultScoreNums: {
    fontFamily: theme.fontHandwritten,
    fontSize: 30,
    fontWeight: '700',
    color: theme.text,
  },
  resultBtns: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  resultBtnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.border,
  },
  resultBtnSecondaryText: {
    fontFamily: theme.fontSemiBold,
    fontSize: 18,
    fontWeight: '600',
    color: theme.textMuted,
  },
  resultBtnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: theme.text,
    shadowColor: theme.text,
    shadowOffset: { width: 3, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 0,
    elevation: 4,
  },
  resultBtnPrimaryText: {
    fontFamily: theme.fontHandwritten,
    fontSize: 20,
    fontWeight: '700',
    color: theme.bg,
  },
  coinLabel: {
    fontSize: 16,
  },
  coinFloat: {
    position: 'absolute',
    bottom: '35%',
    alignSelf: 'center',
  },
  coinFloatText: {
    fontSize: 36,
    fontWeight: '700',
  },
});
