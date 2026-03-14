import React, { useCallback } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText, G } from 'react-native-svg';
import { GameState, GameConfig, LineId, Player } from '../types/game.types';
import { theme } from '../constants/theme';

const P1 = theme.p1;
const P2 = theme.p2;

interface Props {
  state: GameState;
  config: GameConfig;
  onLineTap: (line: LineId) => void;
  disabled?: boolean;
}

export default function GameBoard({ state, config, onLineTap, disabled }: Props) {
  const { width, height } = useWindowDimensions();
  const g = config.gridSize;
  const cells = g - 1;

  // Size board to fit screen (leave room for header + score bar)
  const maxSize = Math.min(width - 32, height - 280, 520);
  const cellSize = Math.floor(maxSize / g);
  const padding  = Math.round(cellSize * 0.5);
  const svgSize  = cells * cellSize + padding * 2;
  const dotR     = Math.max(4, cellSize * 0.1);
  const lineW    = Math.max(3.5, cellSize * 0.12);
  const tapArea  = cellSize * 0.42;

  const dotPos = (r: number, c: number) => ({
    x: padding + c * cellSize,
    y: padding + r * cellSize,
  });

  const playerColor = (p: Player | 0) =>
    p === 1 ? P1 : p === 2 ? P2 : 'transparent';

  const isDrawn = useCallback((line: LineId) =>
    line.type === 'h'
      ? state.hLines[line.row][line.col]
      : state.vLines[line.row][line.col],
  [state]);

  const handleTap = (line: LineId) => {
    if (disabled || isDrawn(line)) return;
    onLineTap(line);
  };

  return (
    <View style={styles.container}>
      <Svg width={svgSize} height={svgSize}>

        {/* ── Claimed box fills ── */}
        {Array.from({ length: cells }, (_, r) =>
          Array.from({ length: cells }, (_, c) => {
            const owner = state.boxes[r][c];
            if (!owner) return null;
            const tl = dotPos(r, c);
            const initial = (owner === 1 ? config.p1Name : config.p2Name)[0].toUpperCase();
            return (
              <G key={`box-${r}-${c}`}>
                <Rect
                  x={tl.x + 2} y={tl.y + 2}
                  width={cellSize - 4} height={cellSize - 4}
                  fill={owner === 1 ? 'rgba(26,58,107,0.22)' : 'rgba(139,26,26,0.22)'}
                />
                <SvgText
                  x={tl.x + cellSize / 2}
                  y={tl.y + cellSize / 2 + 4}
                  fontSize={Math.round(cellSize * 0.36)}
                  fontFamily="Caveat_700Bold"
                  fontWeight="bold"
                  fill={playerColor(owner)}
                  textAnchor="middle"
                >
                  {initial}
                </SvgText>
              </G>
            );
          })
        )}

        {/* ── Drawn horizontal lines ── */}
        {Array.from({ length: g }, (_, r) =>
          Array.from({ length: cells }, (_, c) => {
            if (!state.hLines[r][c]) return null;
            const owner = (state as any).lineColors?.h?.[r]?.[c] ?? 1;
            const a = dotPos(r, c), b = dotPos(r, c + 1);
            return (
              <Line
                key={`hl-${r}-${c}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={playerColor(owner)}
                strokeWidth={lineW}
                strokeLinecap="round"
              />
            );
          })
        )}

        {/* ── Drawn vertical lines ── */}
        {Array.from({ length: cells }, (_, r) =>
          Array.from({ length: g }, (_, c) => {
            if (!state.vLines[r][c]) return null;
            const owner = (state as any).lineColors?.v?.[r]?.[c] ?? 1;
            const a = dotPos(r, c), b = dotPos(r + 1, c);
            return (
              <Line
                key={`vl-${r}-${c}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={playerColor(owner)}
                strokeWidth={lineW}
                strokeLinecap="round"
              />
            );
          })
        )}

        {/* ── Tap targets — horizontal ── */}
        {Array.from({ length: g }, (_, r) =>
          Array.from({ length: cells }, (_, c) => {
            if (isDrawn({ type: 'h', row: r, col: c })) return null;
            const a = dotPos(r, c), b = dotPos(r, c + 1);
            const mx = (a.x + b.x) / 2;
            return (
              <Rect
                key={`ht-${r}-${c}`}
                x={mx - cellSize / 2} y={a.y - tapArea / 2}
                width={cellSize} height={tapArea}
                fill="transparent"
                onPress={() => handleTap({ type: 'h', row: r, col: c })}
              />
            );
          })
        )}

        {/* ── Tap targets — vertical ── */}
        {Array.from({ length: cells }, (_, r) =>
          Array.from({ length: g }, (_, c) => {
            if (isDrawn({ type: 'v', row: r, col: c })) return null;
            const a = dotPos(r, c), b = dotPos(r + 1, c);
            const my = (a.y + b.y) / 2;
            return (
              <Rect
                key={`vt-${r}-${c}`}
                x={a.x - tapArea / 2} y={my - cellSize / 2}
                width={tapArea} height={cellSize}
                fill="transparent"
                onPress={() => handleTap({ type: 'v', row: r, col: c })}
              />
            );
          })
        )}

        {/* ── Dots ── */}
        {Array.from({ length: g }, (_, r) =>
          Array.from({ length: g }, (_, c) => {
            const { x, y } = dotPos(r, c);
            return (
              <G key={`dot-${r}-${c}`}>
                <Circle cx={x + 1} cy={y + 1.5} r={dotR} fill="rgba(42,36,24,0.2)" />
                <Circle cx={x} cy={y} r={dotR} fill={theme.dot} />
              </G>
            );
          })
        )}

      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
