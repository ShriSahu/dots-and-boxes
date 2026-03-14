import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { theme } from '../constants/theme';
import { GameState, GameConfig } from '../types/game.types';

interface Props {
  state: GameState;
  config: GameConfig;
  isAIThinking: boolean;
  timerRemaining: number;
  timerMax: number;
}

export default function ScoreBar({
  state, config, isAIThinking, timerRemaining, timerMax,
}: Props) {
  const { currentPlayer, scores, isGameOver } = state;

  // Animate score bumps
  const p1Scale = useRef(new Animated.Value(1)).current;
  const p2Scale = useRef(new Animated.Value(1)).current;
  const prevP1 = useRef(scores.p1);
  const prevP2 = useRef(scores.p2);

  useEffect(() => {
    if (scores.p1 !== prevP1.current) {
      prevP1.current = scores.p1;
      Animated.sequence([
        Animated.timing(p1Scale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
        Animated.timing(p1Scale, { toValue: 1,   duration: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [scores.p1]);

  useEffect(() => {
    if (scores.p2 !== prevP2.current) {
      prevP2.current = scores.p2;
      Animated.sequence([
        Animated.timing(p2Scale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
        Animated.timing(p2Scale, { toValue: 1,   duration: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [scores.p2]);

  const activeP1 = currentPlayer === 1 && !isGameOver;
  const activeP2 = currentPlayer === 2 && !isGameOver;

  // Timer bar progress
  const showTimer = timerMax > 0 && timerRemaining > 0 && !isGameOver && !isAIThinking;
  const timerPct = showTimer ? (timerRemaining / timerMax) : 0;
  const timerUrgent = timerRemaining > 0 && timerRemaining <= 3;
  const timerColor = timerUrgent ? theme.p2
    : (currentPlayer === 1 ? theme.p1 : theme.p2);

  return (
    <View>
      <View style={styles.bar}>
        {/* Player 1 */}
        <View style={[styles.player, activeP1 && styles.activeP1]}>
          <Text
            style={[styles.name, activeP1 && { color: theme.p1 }]}
            numberOfLines={1}
          >
            {config.p1Name}
          </Text>
          <Animated.Text style={[styles.score, { transform: [{ scale: p1Scale }] }]}>
            {scores.p1}
          </Animated.Text>
          {activeP1 && (
            <View style={[styles.chip, { backgroundColor: theme.p1 }]}>
              <Text style={styles.chipText}>▶ Turn</Text>
            </View>
          )}
          {!activeP1 && <View style={styles.chipPlaceholder} />}
        </View>

        <View style={styles.divider} />

        {/* Middle */}
        <View style={styles.mid}>
          <Text style={styles.midLabel}>
            {isGameOver ? 'Done!' : 'Turn'}
          </Text>
          {isAIThinking && (
            <Text style={[styles.subLabel, { color: theme.p2 }]}>thinking…</Text>
          )}
          {showTimer && (
            <Text style={[
              styles.timerNum,
              { color: timerColor },
            ]}>
              {timerRemaining}
            </Text>
          )}
        </View>

        <View style={styles.divider} />

        {/* Player 2 */}
        <View style={[styles.player, activeP2 && styles.activeP2]}>
          <Text
            style={[styles.name, activeP2 && { color: theme.p2 }]}
            numberOfLines={1}
          >
            {config.p2Name}
          </Text>
          <Animated.Text style={[styles.score, { transform: [{ scale: p2Scale }] }]}>
            {scores.p2}
          </Animated.Text>
          {activeP2 && (
            <View style={[styles.chip, { backgroundColor: theme.p2 }]}>
              <Text style={styles.chipText}>▶ Turn</Text>
            </View>
          )}
          {!activeP2 && <View style={styles.chipPlaceholder} />}
        </View>
      </View>

      {/* Timer progress bar */}
      {showTimer && (
        <View style={styles.timerBarBg}>
          <View
            style={[
              styles.timerBarFill,
              { width: `${timerPct * 100}%` as any, backgroundColor: timerColor },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: theme.bgCard,
    borderWidth: 1.5,
    borderColor: theme.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  player: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopWidth: 3,
    borderTopColor: 'transparent',
    minHeight: 80,
    justifyContent: 'center',
  },
  activeP1: {
    backgroundColor: theme.p1Light,
    borderTopColor: theme.p1,
  },
  activeP2: {
    backgroundColor: theme.p2Light,
    borderTopColor: theme.p2,
  },
  name: {
    fontFamily: 'Caveat_600SemiBold',
    fontSize: 16,
    color: theme.textMuted,
    fontWeight: '600',
  },
  score: {
    fontFamily: 'Caveat_700Bold',
    fontSize: 34,
    fontWeight: '700',
    color: theme.text,
    lineHeight: 38,
  },
  chip: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  chipText: {
    fontFamily: 'Caveat_700Bold',
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  chipPlaceholder: {
    height: 22,
    marginTop: 4,
  },
  divider: {
    width: 1.5,
    backgroundColor: theme.border,
  },
  mid: {
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 68,
  },
  midLabel: {
    fontFamily: 'Caveat_400Regular',
    fontSize: 13,
    color: theme.textMuted,
  },
  subLabel: {
    fontFamily: 'Caveat_400Regular',
    fontSize: 12,
  },
  timerNum: {
    fontFamily: 'Caveat_700Bold',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
  timerBarBg: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(90,80,60,0.10)',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    overflow: 'hidden',
  },
  timerBarFill: {
    height: '100%',
  },
});
