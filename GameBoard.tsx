import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText, Path } from 'react-native-svg';
import { GameState, GameConfig, LineId, Player } from '../types/game.types';
import { theme } from '../constants/theme';

interface Props {
  state: GameState;
  config: GameConfig;
  onLineTap: (line: LineId) => void;
  disabled?: boolean;
}

export default function GameBoard({ state, config, onLineTap, disabled }: Props) {
  const [hoverLine, setHoverLine] = useState<LineId | null>(null);

  const g = config.gridSize;
  const cells = g - 1;

  const { width } = Dimensions.get('window');
  const maxSize = Math.min(width - 40, 520);
  const cellSize = Math.floor(maxSize / g);
  const padding = cellSize * 0.5;
  const svgSize = cells * cellSize + padding * 2;

  const dotPos = (r: number, c: number) => ({
    x: padding + c * cellSize,
    y: padding + r * cellSize,
  });

  const dotRadius = Math.max(5, cellSize * 0.1);
  const lineWidth = Math.max(4, cellSize * 0.13);
  const tapArea = cellSize * 0.38;

  const isDrawn = (line: LineId) =>
    line.type === 'h' ? state.hLines[line.row][line.col] : state.vLines[line.row][line.col];

  const handleTap = (line: LineId) => {
    if (disabled || isDrawn(line)) return;
    onLineTap(line);
  };

  const playerColor = (p: Player | 0) => p === 1 ? theme.p1 : p === 2 ? theme.p2 : 'transparent';

  return (
    <View style={styles.container}>
      <Svg width={svgSize} height={svgSize}>

        {/* Claimed boxes */}
        {Array.from({ length: cells }, (_, r) =>
          Array.from({ length: cells }, (_, c) => {
            const owner = state.boxes[r][c];
            if (!owner) return null;
            const tl = dotPos(r, c);
            const initial = (owner === 1 ? config.p1Name : config.p2Name)[0].toUpperCase();
            return (
              <React.Fragment key={`box-${r}-${c}`}>
                <Rect
                  x={tl.x + 2}
                  y={tl.y + 2}
                  width={cellSize - 4}
                  height={cellSize - 4}
                  fill={owner === 1 ? theme.p1Light : theme.p2Light}
                />
                <SvgText
                  x={tl.x + cellSize / 2}
                  y={tl.y + cellSize / 2 + 4}
                  fontSize={cellSize * 0.38}
                  fontFamily={theme.font}
                  fontWeight="bold"
                  fill={playerColor(owner)}
                  textAnchor="middle"
                >
                  {initial}
                </SvgText>
              </React.Fragment>
            );
          })
        )}

        {/* Drawn horizontal lines */}
        {Array.from({ length: g }, (_, r) =>
          Array.from({ length: cells }, (_, c) => {
            if (!state.hLines[r][c]) return null;
            const a = dotPos(r, c), b = dotPos(r, c + 1);
            const owner = (state as any).lineColors?.h[r][c] || 1;
            return (
              <Line
                key={`hl-${r}-${c}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={playerColor(owner)}
                strokeWidth={lineWidth}
                strokeLinecap="round"
              />
            );
          })
        )}

        {/* Drawn vertical lines */}
        {Array.from({ length: cells }, (_, r) =>
          Array.from({ length: g }, (_, c) => {
            if (!state.vLines[r][c]) return null;
            const a = dotPos(r, c), b = dotPos(r + 1, c);
            const owner = (state as any).lineColors?.v[r][c] || 1;
            return (
              <Line
                key={`vl-${r}-${c}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={playerColor(owner)}
                strokeWidth={lineWidth}
                strokeLinecap="round"
              />
            );
          })
        )}

        {/* Tap targets — horizontal */}
        {Array.from({ length: g }, (_, r) =>
          Array.from({ length: cells }, (_, c) => {
            if (isDrawn({ type: 'h', row: r, col: c })) return null;
            const a = dotPos(r, c), b = dotPos(r, c + 1);
            const mx = (a.x + b.x) / 2, my = a.y;
            return (
              <Rect
                key={`ht-${r}-${c}`}
                x={mx - cellSize / 2}
                y={my - tapArea / 2}
                width={cellSize}
                height={tapArea}
                fill="transparent"
                onPress={() => handleTap({ type: 'h', row: r, col: c })}
              />
            );
          })
        )}

        {/* Tap targets — vertical */}
        {Array.from({ length: cells }, (_, r) =>
          Array.from({ length: g }, (_, c) => {
            if (isDrawn({ type: 'v', row: r, col: c })) return null;
            const a = dotPos(r, c), b = dotPos(r + 1, c);
            const mx = a.x, my = (a.y + b.y) / 2;
            return (
              <Rect
                key={`vt-${r}-${c}`}
                x={mx - tapArea / 2}
                y={my - cellSize / 2}
                width={tapArea}
                height={cellSize}
                fill="transparent"
                onPress={() => handleTap({ type: 'v', row: r, col: c })}
              />
            );
          })
        )}

        {/* Dots */}
        {Array.from({ length: g }, (_, r) =>
          Array.from({ length: g }, (_, c) => {
            const { x, y } = dotPos(r, c);
            return (
              <Circle key={`dot-${r}-${c}`} cx={x} cy={y} r={dotRadius} fill={theme.dot} />
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
