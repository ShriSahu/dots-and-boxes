import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';
import { GameState, GameConfig } from '../types/game.types';

interface Props {
  state: GameState;
  config: GameConfig;
  isAIThinking: boolean;
}

export default function ScoreBar({ state, config, isAIThinking }: Props) {
  const { currentPlayer, scores, isGameOver } = state;

  return (
    <View style={styles.bar}>
      {/* Player 1 */}
      <View style={[styles.playerSection, currentPlayer === 1 && !isGameOver && styles.activeP1]}>
        <Text style={[styles.name, currentPlayer === 1 && !isGameOver && styles.nameP1]}>
          {config.p1Name}
        </Text>
        <Text style={styles.score}>{scores.p1}</Text>
        <View style={[styles.turnDot, currentPlayer === 1 && !isGameOver && styles.turnDotP1]} />
      </View>

      {/* Divider + mid */}
      <View style={styles.divider} />
      <View style={styles.mid}>
        <Text style={styles.midText}>{isGameOver ? 'Done!' : 'Turn'}</Text>
        {isAIThinking && <Text style={styles.aiText}>thinking…</Text>}
      </View>
      <View style={styles.divider} />

      {/* Player 2 */}
      <View style={[styles.playerSection, currentPlayer === 2 && !isGameOver && styles.activeP2]}>
        <Text style={[styles.name, currentPlayer === 2 && !isGameOver && styles.nameP2]}>
          {config.p2Name}
        </Text>
        <Text style={styles.score}>{scores.p2}</Text>
        <View style={[styles.turnDot, currentPlayer === 2 && !isGameOver && styles.turnDotP2]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,252,245,0.7)',
    borderWidth: 1.5,
    borderColor: 'rgba(90,80,60,0.22)',
    borderRadius: 10,
    overflow: 'hidden',
    width: '100%',
  },
  playerSection: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  activeP1: { backgroundColor: theme.p1Light },
  activeP2: { backgroundColor: theme.p2Light },
  name: { fontFamily: theme.font, fontSize: 16, color: theme.textMuted, fontWeight: '600' },
  nameP1: { color: theme.p1 },
  nameP2: { color: theme.p2 },
  score: { fontFamily: theme.font, fontSize: 32, fontWeight: '700', color: theme.text, lineHeight: 36 },
  turnDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, opacity: 0 },
  turnDotP1: { backgroundColor: theme.p1, opacity: 1 },
  turnDotP2: { backgroundColor: theme.p2, opacity: 1 },
  divider: { width: 1.5, backgroundColor: 'rgba(90,80,60,0.22)' },
  mid: { paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', minWidth: 65 },
  midText: { fontFamily: theme.font, fontSize: 13, color: theme.textMuted },
  aiText: { fontFamily: theme.font, fontSize: 12, color: theme.p2 },
});
