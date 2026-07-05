import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, PanResponder, useWindowDimensions, Animated, Easing } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText, G } from 'react-native-svg';
import { GameState, GameConfig, LineId, Player } from '../types/game.types';
import { useTheme } from '../hooks/useTheme';

const AnimatedLine   = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const LINE_GROW_MS = 130;

function lineKey(type: 'h' | 'v', row: number, col: number): string {
  return `${type}-${row}-${col}`;
}

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

  // Kept fresh via effect below so the once-created PanResponder (see
  // onPanResponderRelease) never closes over a stale cellSize/padding.
  const dotPosRef = useRef(dotPos);
  useEffect(() => { dotPosRef.current = dotPos; });

  // ── Line-grow-in animation: new lines animate from the tapped endpoint to
  // full length instead of snapping in instantly. Bookkeeping below runs once
  // per render (refs only — no extra re-render) so the very first render of a
  // newly-drawn line already starts at progress 0; a follow-up effect kicks
  // off the actual Animated.timing after commit.
  const lineAnimsRef     = useRef<Map<string, Animated.Value>>(new Map());
  const anchorMapRef     = useRef<Map<string, boolean>>(new Map());
  const prevDrawnKeysRef = useRef<Set<string> | null>(null);
  const pendingAnchorRef = useRef<Map<string, boolean>>(new Map());
  const pendingStartRef  = useRef<string[]>([]);

  {
    const currentKeys = new Set<string>();
    for (let r = 0; r < g; r++) for (let c = 0; c < cells; c++) {
      if (state.hLines[r][c]) currentKeys.add(lineKey('h', r, c));
    }
    for (let r = 0; r < cells; r++) for (let c = 0; c < g; c++) {
      if (state.vLines[r][c]) currentKeys.add(lineKey('v', r, c));
    }

    const isFirstPass = prevDrawnKeysRef.current === null;
    const prevKeys     = prevDrawnKeysRef.current ?? new Set<string>();

    currentKeys.forEach(key => {
      if (lineAnimsRef.current.has(key)) return;
      const isNewlyDrawn = !isFirstPass && !prevKeys.has(key);
      const anchorIsB    = pendingAnchorRef.current.get(key) ?? false;
      pendingAnchorRef.current.delete(key);
      anchorMapRef.current.set(key, anchorIsB);
      if (isNewlyDrawn) {
        lineAnimsRef.current.set(key, new Animated.Value(0));
        pendingStartRef.current.push(key);
      } else {
        // Pre-existing (first mount / reconnect) — render at full length, no animation.
        lineAnimsRef.current.set(key, new Animated.Value(1));
      }
    });

    // Lines removed (undo) — drop tracking so a future redraw animates again.
    prevKeys.forEach(key => {
      if (!currentKeys.has(key)) {
        lineAnimsRef.current.delete(key);
        anchorMapRef.current.delete(key);
      }
    });

    prevDrawnKeysRef.current = currentKeys;
  }

  useEffect(() => {
    if (pendingStartRef.current.length === 0) return;
    const keys = pendingStartRef.current;
    pendingStartRef.current = [];
    keys.forEach(key => {
      const v = lineAnimsRef.current.get(key);
      if (!v) return;
      Animated.timing(v, {
        toValue: 1,
        duration: LINE_GROW_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    });
  });

  // ── Subtle press feedback on the tapped dots/edge ─────────────────────────
  const pressAnim = useRef(new Animated.Value(0)).current;

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
            pressAnim.stopAnimation();
            pressAnim.setValue(0);
            Animated.timing(pressAnim, {
              toValue: 1, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: false,
            }).start();
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

      onPanResponderRelease: (_, gestureState) => {
        const line = previewLineRef.current;
        if (line && !disabledRef.current) {
          const key = lineKey(line.type, line.row, line.col);
          const a = dotPosRef.current(line.row, line.col);
          const b = line.type === 'h'
            ? dotPosRef.current(line.row, line.col + 1)
            : dotPosRef.current(line.row + 1, line.col);
          const localX  = gestureState.moveX - boardOrigin.current.x;
          const localY  = gestureState.moveY - boardOrigin.current.y;
          const distA   = Math.hypot(localX - a.x, localY - a.y);
          const distB   = Math.hypot(localX - b.x, localY - b.y);
          // Anchor the grow-in animation at the endpoint nearest the tap.
          pendingAnchorRef.current.set(key, distB < distA);
          onLineTapRef.current(line);
        }
        previewLineRef.current = null;
        setPreviewLine(null);
        pressAnim.stopAnimation();
        Animated.timing(pressAnim, {
          toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: false,
        }).start();
      },

      onPanResponderTerminate: () => {
        previewLineRef.current = null;
        setPreviewLine(null);
        pressAnim.stopAnimation();
        Animated.timing(pressAnim, {
          toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: false,
        }).start();
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
            const key = lineKey('h', r, c);
            const progress = lineAnimsRef.current.get(key);
            const anchorIsB = anchorMapRef.current.get(key) ?? false;
            const anchor = anchorIsB ? b : a;
            const far    = anchorIsB ? a : b;
            return (
              <AnimatedLine
                key={`hl-${r}-${c}`}
                x1={anchor.x} y1={anchor.y}
                x2={progress ? progress.interpolate({ inputRange: [0, 1], outputRange: [anchor.x, far.x] }) : far.x}
                y2={progress ? progress.interpolate({ inputRange: [0, 1], outputRange: [anchor.y, far.y] }) : far.y}
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
            const key = lineKey('v', r, c);
            const progress = lineAnimsRef.current.get(key);
            const anchorIsB = anchorMapRef.current.get(key) ?? false;
            const anchor = anchorIsB ? b : a;
            const far    = anchorIsB ? a : b;
            return (
              <AnimatedLine
                key={`vl-${r}-${c}`}
                x1={anchor.x} y1={anchor.y}
                x2={progress ? progress.interpolate({ inputRange: [0, 1], outputRange: [anchor.x, far.x] }) : far.x}
                y2={progress ? progress.interpolate({ inputRange: [0, 1], outputRange: [anchor.y, far.y] }) : far.y}
                stroke={playerColor(owner)}
                strokeWidth={flash ? lineW * 1.6 : lineW}
                strokeLinecap="round"
              />
            );
          })
        )}

        {/* ── Ghost preview line + press feedback on its two dots ── */}
        {previewLine && (() => {
          const pl = previewLine;
          const isH = pl.type === 'h';
          const a = dotPos(pl.row, pl.col);
          const b = isH ? dotPos(pl.row, pl.col + 1) : dotPos(pl.row + 1, pl.col);
          const currentColor = state.currentPlayer === 1 ? theme.p1 : theme.p2;
          const haloR = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [dotR, dotR * 1.9] });
          const haloOpacity = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.32] });
          return (
            <G key="preview">
              <Line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={currentColor}
                strokeWidth={lineW}
                strokeLinecap="round"
                opacity={0.4}
              />
              <AnimatedCircle cx={a.x} cy={a.y} r={haloR} fill={currentColor} opacity={haloOpacity} />
              <AnimatedCircle cx={b.x} cy={b.y} r={haloR} fill={currentColor} opacity={haloOpacity} />
            </G>
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
      </View>
    </View>
  );
}
