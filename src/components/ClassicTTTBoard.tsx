import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { TTTCell } from '../types/ttt.types';
import { useTheme } from '../hooks/useTheme';

interface Props {
  cells: TTTCell[];
  onCellTap: (cell: number) => void;
  disabled?: boolean;
}

function mark(v: TTTCell): string {
  return v === 1 ? 'X' : v === 2 ? 'O' : '';
}

export default function ClassicTTTBoard({ cells, onCellTap, disabled }: Props) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const boardSize = Math.min(width - 48, height - 380, 340);
  const cellSize = boardSize / 3;

  return (
    <View style={[styles.grid, { width: boardSize, height: boardSize }]}>
      {cells.map((v, i) => (
        <TouchableOpacity
          key={i}
          disabled={disabled || v !== 0}
          onPress={() => onCellTap(i)}
          style={[
            styles.cell,
            { width: cellSize, height: cellSize, borderColor: theme.border, backgroundColor: theme.bgCard },
          ]}
          activeOpacity={0.6}
        >
          <Text style={[styles.mark, { fontSize: cellSize * 0.5, color: v === 1 ? theme.p1 : v === 2 ? theme.p2 : 'transparent', fontFamily: theme.fontHandwritten }]}>
            {mark(v) || '·'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  cell: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  mark: { fontWeight: '700' },
});
