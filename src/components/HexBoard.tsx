import React, { useMemo } from 'react';
import { View, PanResponder, useWindowDimensions } from 'react-native';
import Svg, { Polygon, G } from 'react-native-svg';
import { HexState } from '../types/hex.types';
import { useTheme } from '../hooks/useTheme';

interface Props {
  state: HexState;
  onCellTap: (row: number, col: number) => void;
  disabled?: boolean;
}

function hexPoints(cx: number, cy: number, s: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90); // pointy-top
    pts.push(`${cx + s * Math.cos(angle)},${cy + s * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

export default function HexBoard({ state, onCellTap, disabled }: Props) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const { board, size } = state;

  const hexSize = useMemo(() => {
    const maxWidth  = width - 32;
    const maxHeight = height - 320;
    // Rhombus board footprint: width grows by ~1.5*hexWidth per row of shift,
    // so budget conservatively for size rows/cols of hexes.
    const byWidth  = maxWidth / (size * 1.8);
    const byHeight = maxHeight / (size * 1.55);
    return Math.max(10, Math.min(byWidth, byHeight, 26));
  }, [width, height, size]);

  const hexW = Math.sqrt(3) * hexSize;
  const hexH = 2 * hexSize;
  const rowSpacing = hexH * 0.75;

  const center = (r: number, c: number) => ({
    x: c * hexW + r * (hexW / 2) + hexW,
    y: r * rowSpacing + hexH * 0.6,
  });

  const svgWidth  = (size - 1) * hexW + (size - 1) * (hexW / 2) + hexW * 2;
  const svgHeight = (size - 1) * rowSpacing + hexH * 1.2;

  const colorFor = (v: 0 | 1 | 2) => v === 1 ? theme.p1 : v === 2 ? theme.p2 : theme.bgCard;

  // Tap detection: find nearest hex center within radius.
  const boardOrigin = React.useRef({ x: 0, y: 0 });
  const boardViewRef = React.useRef<View>(null);

  const findNearestCell = (localX: number, localY: number): { row: number; col: number } | null => {
    let best: { row: number; col: number } | null = null;
    let bestDist = Infinity;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const { x, y } = center(r, c);
        const d = Math.hypot(localX - x, localY - y);
        if (d < hexSize && d < bestDist) { bestDist = d; best = { row: r, col: c }; }
      }
    }
    return best;
  };

  const disabledRef = React.useRef(disabled ?? false);
  React.useEffect(() => { disabledRef.current = disabled ?? false; }, [disabled]);
  const onCellTapRef = React.useRef(onCellTap);
  React.useEffect(() => { onCellTapRef.current = onCellTap; }, [onCellTap]);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderRelease: (_, gestureState) => {
        if (disabledRef.current) return;
        const localX = gestureState.x0 - boardOrigin.current.x;
        const localY = gestureState.y0 - boardOrigin.current.y;
        const cell = findNearestCell(localX, localY);
        if (cell) onCellTapRef.current(cell.row, cell.col);
      },
    })
  ).current;

  return (
    <View
      ref={boardViewRef}
      {...panResponder.panHandlers}
      onLayout={() => {
        boardViewRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
          boardOrigin.current = { x: pageX, y: pageY };
        });
      }}
    >
      <Svg width={svgWidth} height={svgHeight}>
        {/* Edge tint: top/bottom rows hint player 1's goal edges, left/right hint player 2's. */}
        {Array.from({ length: size }, (_, r) =>
          Array.from({ length: size }, (_, c) => {
            const { x, y } = center(r, c);
            const v = board[r][c];
            const isTopBottomEdge = r === 0 || r === size - 1;
            const isLeftRightEdge = c === 0 || c === size - 1;
            const stroke = isTopBottomEdge ? theme.p1 : isLeftRightEdge ? theme.p2 : theme.border;
            return (
              <G key={`${r}-${c}`}>
                <Polygon
                  points={hexPoints(x, y, hexSize * 0.94)}
                  fill={colorFor(v)}
                  stroke={stroke}
                  strokeWidth={isTopBottomEdge || isLeftRightEdge ? 1.8 : 1}
                  opacity={v === 0 ? 0.9 : 1}
                />
              </G>
            );
          })
        )}
      </Svg>
    </View>
  );
}
