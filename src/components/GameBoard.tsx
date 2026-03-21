import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, PanResponder, useWindowDimensions } from 'react-native';
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
  allowedLines?: Set<string>;   // tutorial restriction (key format: "h-row-col")
}

export default function GameBoard({
  state, config, onLineTap, disabled, lastLine, newBoxes = [], boardKey, allowedLines,
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

  // Paper ruling — equally spaced horizontal lines like a notebook
  const ruleSpacing = Math.round(half);
  const numRules    = Math.floor(svgSize / ruleSpacing) + 2;

  // ── PanResponder snap-to-line input ──────────────────────────────────────
  const boardViewRef = useRef<View>(null);
  const boardOrigin  = useRef({ x: 0, y: 0 });
  const [previewLine, setPreviewLine] = useState<LineId | null>(null);

  const findNearestLine = useCallback((localX: number, localY: number): LineId | null => {
    const threshold = cellSize * 0.45;
    let best: LineId | null = null;
    let bestDist = Infinity;

    const checkLine = (type: 'h' | 'v', row: number, col: number, mx: number, my: number) => {
      const drawn = type === 'h' ? state.hLines[row][col] : state.vLines[row][col];
      if (drawn) return;
      const dx = localX - mx;
      const dy = localY - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < threshold && dist < bestDist) {
        bestDist = dist;
        best = { type, row, col };
      }
    };

    // Horizontal line midpoints
    for (let r = 0; r < g; r++) {
      for (let c = 0; c < cells; c++) {
        const a = dotPos(r, c);
        const b = dotPos(r, c + 1);
        checkLine('h', r, c, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
    }
    // Vertical line midpoints
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < g; c++) {
        const a = dotPos(r, c);
        const b = dotPos(r + 1, c);
        checkLine('v', r, c, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
    }
    return best;
  }, [state.hLines, state.vLines, cellSize, g, cells, padding]);

  const disabledRef    = useRef(disabled ?? false);
  const allowedRef     = useRef(allowedLines);
  const onLineTapRef   = useRef(onLineTap);
  const previewLineRef = useRef<LineId | null>(null);
  const findNearestRef = useRef(findNearestLine);

  // Keep refs current on every render
  useEffect(() => { disabledRef.current    = disabled ?? false; }, [disabled]);
  useEffect(() => { allowedRef.current     = allowedLines; }, [allowedLines]);
  useEffect(() => { onLineTapRef.current   = onLineTap; }, [onLineTap]);
  useEffect(() => { findNearestRef.current = findNearestLine; }, [findNearestLine]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder:  () => !disabledRef.current,

      onPanResponderGrant: (_, gestureState) => {
        if (disabledRef.current) return;
        const localX = gestureState.x0 - boardOrigin.current.x;
        const localY = gestureState.y0 - boardOrigin.current.y;
        const nearest = findNearestRef.current(localX, localY);
        if (nearest) {
          const key = `${nearest.type}-${nearest.row}-${nearest.col}`;
          if (!allowedRef.current || allowedRef.current.has(key)) {
            previewLineRef.current = nearest;
            setPreviewLine(nearest);
          }
        }
      },

      onPanResponderMove: (_, gestureState) => {
        if (disabledRef.current) return;
        const localX = gestureState.moveX - boardOrigin.current.x;
        const localY = gestureState.moveY - boardOrigin.current.y;
        const nearest = findNearestRef.current(localX, localY);
        if (nearest) {
          const key = `${nearest.type}-${nearest.row}-${nearest.col}`;
          if (!allowedRef.current || allowedRef.current.has(key)) {
            previewLineRef.current = nearest;
            setPreviewLine(nearest);
            return;
          }
        }
        previewLineRef.current = null;
        setPreviewLine(null);
      },

      onPanResponderRelease: () => {
        const line = previewLineRef.current;
        if (line && !disabledRef.current) {
          onLineTapRef.current(line);
        }
        previewLineRef.current = null;
        setPreviewLine(null);
      },

      onPanResponderTerminate: () => {
        previewLineRef.current = null;
        setPreviewLine(null);
      },
    })
  ).current;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View
        ref={boardViewRef}
        {...panResponder.panHandlers}
        onLayout={() => {
          boardViewRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
            boardOrigin.current = { x: pageX, y: pageY };
          });
        }}
      >
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

        {/* ── Ghost preview line ── */}
        {previewLine && (() => {
          const pl = previewLine;
          const isH = pl.type === 'h';
          const a = dotPos(pl.row, pl.col);
          const b = isH ? dotPos(pl.row, pl.col + 1) : dotPos(pl.row + 1, pl.col);
          const currentColor = state.currentPlayer === 1 ? theme.p1 : theme.p2;
          return (
            <Line
              key="preview"
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={currentColor}
              strokeWidth={lineW}
              strokeLinecap="round"
              opacity={0.4}
            />
          );
        })()}

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
      </View>   {/* closes the panResponder View */}
    </View>
  );
}
