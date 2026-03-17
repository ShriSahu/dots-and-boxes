import React, { useState, useEffect, useCallback } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText, G } from 'react-native-svg';
import { GameState, GameConfig, LineId, Player } from '../types/game.types';
import { useTheme } from '../hooks/useTheme';

interface Props {
  state: GameState;
  config: GameConfig;
  onLineTap: (line: LineId) => void;
  disabled?: boolean;
  lastLine?: LineId | null;
  newBoxes?: string[];
  boardKey?: number;
}

export default function GameBoard({
  state, config, onLineTap, disabled, lastLine,
}: Props) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();

  const g     = config.gridSize;
  const cells = g - 1;

  const maxSize  = Math.min(width - 32, height - 280, 520);
  const cellSize = Math.floor(maxSize / g);
  const padding  = Math.round(cellSize * 0.5);
  const svgSize  = cells * cellSize + padding * 2;
  const dotR     = Math.max(4, cellSize * 0.1);
  const lineW    = Math.max(3.5, cellSize * 0.12);
  const half     = cellSize / 2;

  // ── Briefly thicken the last drawn line ──────────────────────────────────
  const [flashLine, setFlashLine] = useState<LineId | null>(null);
  useEffect(() => {
    if (!lastLine) return;
    setFlashLine(lastLine);
    const t = setTimeout(() => setFlashLine(null), 280);
    return () => clearTimeout(t);
  }, [lastLine]);

  const dotPos = (r: number, c: number) => ({
    x: padding + c * cellSize,
    y: padding + r * cellSize,
  });

  const playerColor = (p: Player | 0) =>
    p === 1 ? theme.p1 : p === 2 ? theme.p2 : 'transparent';

  const isFlash = (type: 'h' | 'v', row: number, col: number) =>
    flashLine?.type === type && flashLine.row === row && flashLine.col === col;

  // ── Single native touch handler ──────────────────────────────────────────
  // Fires on TOUCH DOWN (not release) for immediate feel.
  // Finds the nearest undrawn line within reach of the tap point.
  const handleTouch = useCallback((tx: number, ty: number) => {
    let best: LineId | null = null;
    let bestD = Infinity;

    // Horizontal lines
    for (let r = 0; r < g; r++) {
      for (let c = 0; c < cells; c++) {
        if (state.hLines[r][c]) continue;
        const mx = padding + c * cellSize + half;
        const my = padding + r * cellSize;
        const dx = Math.abs(tx - mx);
        const dy = Math.abs(ty - my);
        if (dx <= half + 2 && dy <= half) {
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = { type: 'h', row: r, col: c }; }
        }
      }
    }

    // Vertical lines
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < g; c++) {
        if (state.vLines[r][c]) continue;
        const mx = padding + c * cellSize;
        const my = padding + r * cellSize + half;
        const dx = Math.abs(tx - mx);
        const dy = Math.abs(ty - my);
        if (dx <= half && dy <= half + 2) {
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = { type: 'v', row: r, col: c }; }
        }
      }
    }

    if (best) onLineTap(best);
  }, [state.hLines, state.vLines, g, cells, padding, cellSize, half, onLineTap]);

  // Paper ruling — equally spaced horizontal lines like a notebook
  const ruleSpacing = Math.round(half);
  const numRules    = Math.floor(svgSize / ruleSpacing) + 2;

  return (
    // Outer View is exactly svgSize × svgSize so locationX/locationY from
    // the responder events map 1-to-1 to SVG coordinates.
    <View
      style={{ width: svgSize, height: svgSize }}
      onStartShouldSetResponder={() => !disabled}
      onResponderGrant={e =>
        handleTouch(e.nativeEvent.locationX, e.nativeEvent.locationY)
      }
    >
      <Svg width={svgSize} height={svgSize}>

        {/* ── Ruled paper background ── */}
        {Array.from({ length: numRules }, (_, i) => (
          <Line
            key={`rule-${i}`}
            x1={0}      y1={i * ruleSpacing}
            x2={svgSize} y2={i * ruleSpacing}
            stroke={theme.paperLine}
            strokeWidth={0.8}
          />
        ))}

        {/* ── Red margin line (left side) ── */}
        <Line
          x1={Math.round(padding * 0.5)} y1={0}
          x2={Math.round(padding * 0.5)} y2={svgSize}
          stroke={theme.marginLine}
          strokeWidth={1.5}
        />

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
                  fill={owner === 1 ? theme.p1Light : theme.p2Light}
                />
                <SvgText
                  x={tl.x + cellSize / 2}
                  y={tl.y + cellSize / 2 + 4}
                  fontSize={Math.round(cellSize * 0.36)}
                  fontFamily={theme.fontHandwritten}
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
            const owner = state.hLineOwners[r][c];
            const a = dotPos(r, c), b = dotPos(r, c + 1);
            const flash = isFlash('h', r, c);
            return (
              <Line
                key={`hl-${r}-${c}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={playerColor(owner)}
                strokeWidth={flash ? lineW * 1.5 : lineW}
                strokeLinecap="round"
              />
            );
          })
        )}

        {/* ── Drawn vertical lines ── */}
        {Array.from({ length: cells }, (_, r) =>
          Array.from({ length: g }, (_, c) => {
            if (!state.vLines[r][c]) return null;
            const owner = state.vLineOwners[r][c];
            const a = dotPos(r, c), b = dotPos(r + 1, c);
            const flash = isFlash('v', r, c);
            return (
              <Line
                key={`vl-${r}-${c}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={playerColor(owner)}
                strokeWidth={flash ? lineW * 1.5 : lineW}
                strokeLinecap="round"
              />
            );
          })
        )}

        {/* ── Dots (rendered last — on top) ── */}
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
