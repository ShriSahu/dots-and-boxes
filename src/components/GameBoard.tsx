import React, { useState, useEffect } from 'react';
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
  state, config, onLineTap, disabled, lastLine, newBoxes = [], boardKey,
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
  // Generous tap area — slightly larger than cell to avoid dead zones at dots
  const tapH = Math.round(cellSize * 0.52); // tap target height for horizontal lines
  const tapW = Math.round(cellSize * 0.52); // tap target width  for vertical lines

  // ── Flash last drawn line briefly ────────────────────────────────────────
  const [flashLine, setFlashLine] = useState<LineId | null>(null);
  useEffect(() => {
    if (!lastLine) return;
    setFlashLine(lastLine);
    const t = setTimeout(() => setFlashLine(null), 300);
    return () => clearTimeout(t);
  }, [lastLine]);

  // ── Box-claim flash: briefly brighten newly claimed boxes ─────────────────
  const [flashBoxes, setFlashBoxes] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!newBoxes || newBoxes.length === 0) return;
    setFlashBoxes(new Set(newBoxes));
    const t = setTimeout(() => setFlashBoxes(new Set()), 380);
    return () => clearTimeout(t);
  }, [newBoxes, boardKey]);

  const dotPos = (r: number, c: number) => ({
    x: padding + c * cellSize,
    y: padding + r * cellSize,
  });

  const playerColor = (p: Player | 0) =>
    p === 1 ? theme.p1 : p === 2 ? theme.p2 : 'transparent';

  const isFlash = (type: 'h' | 'v', row: number, col: number) =>
    flashLine?.type === type && flashLine.row === row && flashLine.col === col;

  // onPressIn fires on touch-DOWN (immediate) — no delay like onPress
  const handlePressIn = (line: LineId) => {
    if (disabled) return;
    const drawn = line.type === 'h'
      ? state.hLines[line.row][line.col]
      : state.vLines[line.row][line.col];
    if (drawn) return;
    onLineTap(line);
  };

  // Paper ruling — equally spaced horizontal lines like a notebook
  const ruleSpacing = Math.round(half);
  const numRules    = Math.floor(svgSize / ruleSpacing) + 2;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={svgSize} height={svgSize}>

        {/* ── Ruled paper background ── */}
        {Array.from({ length: numRules }, (_, i) => (
          <Line
            key={`rule-${i}`}
            x1={0}       y1={i * ruleSpacing}
            x2={svgSize} y2={i * ruleSpacing}
            stroke={theme.paperLine}
            strokeWidth={0.8}
          />
        ))}

        {/* ── Red margin line ── */}
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
            const tl    = dotPos(r, c);
            const key   = `${r}-${c}`;
            const isNew = flashBoxes.has(key);
            const initial = (owner === 1 ? config.p1Name : config.p2Name)[0].toUpperCase();
            return (
              <G key={`box-${r}-${c}`}>
                <Rect
                  x={tl.x + 2} y={tl.y + 2}
                  width={cellSize - 4} height={cellSize - 4}
                  fill={isNew
                    ? (owner === 1 ? theme.p1 + '66' : theme.p2 + '66')
                    : (owner === 1 ? theme.p1Light : theme.p2Light)}
                />
                <SvgText
                  x={tl.x + cellSize / 2}
                  y={tl.y + cellSize / 2 + 4}
                  fontSize={Math.round(cellSize * 0.36)}
                  fontFamily={theme.fontHandwritten}
                  fontWeight="bold"
                  fill={playerColor(owner)}
                  textAnchor="middle"
                  opacity={isNew ? 0.6 : 1}
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
                strokeWidth={flash ? lineW * 1.6 : lineW}
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
                strokeWidth={flash ? lineW * 1.6 : lineW}
                strokeLinecap="round"
              />
            );
          })
        )}

        {/* ── Tap targets — horizontal lines (onPressIn = fires on touch-down) ── */}
        {Array.from({ length: g }, (_, r) =>
          Array.from({ length: cells }, (_, c) => {
            if (state.hLines[r][c]) return null;
            const a = dotPos(r, c), b = dotPos(r, c + 1);
            const mx = (a.x + b.x) / 2;
            return (
              <Rect
                key={`ht-${r}-${c}`}
                x={mx - half}       y={a.y - tapH / 2}
                width={cellSize}    height={tapH}
                fill="transparent"
                onPressIn={() => handlePressIn({ type: 'h', row: r, col: c })}
              />
            );
          })
        )}

        {/* ── Tap targets — vertical lines (onPressIn = fires on touch-down) ── */}
        {Array.from({ length: cells }, (_, r) =>
          Array.from({ length: g }, (_, c) => {
            if (state.vLines[r][c]) return null;
            const a = dotPos(r, c), b = dotPos(r + 1, c);
            const my = (a.y + b.y) / 2;
            return (
              <Rect
                key={`vt-${r}-${c}`}
                x={a.x - tapW / 2}  y={my - half}
                width={tapW}        height={cellSize}
                fill="transparent"
                onPressIn={() => handlePressIn({ type: 'v', row: r, col: c })}
              />
            );
          })
        )}

        {/* ── Dots (on top) ── */}
        {Array.from({ length: g }, (_, r) =>
          Array.from({ length: g }, (_, c) => {
            const { x, y } = dotPos(r, c);
            return (
              <G key={`dot-${r}-${c}`}>
                <Circle cx={x + 1} cy={y + 1.5} r={dotR} fill="rgba(42,36,24,0.2)" />
                <Circle cx={x}     cy={y}         r={dotR} fill={theme.dot} />
              </G>
            );
          })
        )}

      </Svg>
    </View>
  );
}
