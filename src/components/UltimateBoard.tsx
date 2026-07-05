import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { TTTState } from '../types/ttt.types';
import { useTheme } from '../hooks/useTheme';
import { isBoardDecided } from '../utils/tttHelpers';

interface Props {
  state: TTTState;
  onCellTap: (board: number, cell: number) => void;
  disabled?: boolean;
}

function mark(v: 0 | 1 | 2): string {
  return v === 1 ? 'X' : v === 2 ? 'O' : '';
}

export default function UltimateBoard({ state, onCellTap, disabled }: Props) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();

  const maxSize = Math.min(width - 32, height - 320, 480);
  const metaGap = Math.max(4, maxSize * 0.02);
  const boardSize = (maxSize - metaGap * 4) / 3;
  const cellSize = boardSize / 3;

  const isBoardPlayable = (b: number) =>
    !state.isGameOver &&
    !isBoardDecided(state.boardResults[b]) &&
    (state.activeBoard === null || state.activeBoard === b);

  return (
    <View style={[styles.metaGrid, { width: maxSize, gap: metaGap }]}>
      {Array.from({ length: 9 }, (_, b) => {
        const result = state.boardResults[b];
        const playable = isBoardPlayable(b) && !disabled;
        const isActive = !state.isGameOver && isBoardPlayable(b);
        const winnerColor = result === 1 ? theme.p1 : result === 2 ? theme.p2 : undefined;

        return (
          <View
            key={b}
            style={[
              styles.smallBoard,
              {
                width: boardSize, height: boardSize,
                backgroundColor: theme.bgCard,
                borderColor: isActive ? theme.p1 : theme.border,
                borderWidth: isActive ? 2.5 : 1.5,
                opacity: result !== 0 ? 0.55 : 1,
              },
            ]}
          >
            {Array.from({ length: 9 }, (_, c) => {
              const v = state.boards[b][c];
              const canTap = playable && v === 0 && result === 0;
              return (
                <TouchableOpacity
                  key={c}
                  disabled={!canTap}
                  onPress={() => onCellTap(b, c)}
                  style={[
                    styles.cell,
                    { width: cellSize, height: cellSize, borderColor: theme.border },
                  ]}
                  activeOpacity={0.6}
                >
                  <Text
                    style={[
                      styles.cellText,
                      {
                        fontSize: cellSize * 0.5,
                        color: v === 1 ? theme.p1 : v === 2 ? theme.p2 : 'transparent',
                        fontFamily: theme.fontHandwritten,
                      },
                    ]}
                  >
                    {mark(v) || '·'}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {result !== 0 && (
              <View style={[styles.decidedOverlay, { backgroundColor: theme.bg + 'cc' }]} pointerEvents="none">
                <Text
                  style={[
                    styles.decidedText,
                    { fontSize: boardSize * 0.55, color: winnerColor ?? theme.textMuted, fontFamily: theme.fontHandwritten },
                  ]}
                >
                  {result === 3 ? '—' : mark(result as 1 | 2)}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
  },
  smallBoard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 8,
    overflow: 'hidden',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
  },
  cellText: {
    fontWeight: '700',
  },
  decidedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  decidedText: {
    fontWeight: '700',
  },
});
