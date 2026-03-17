import { BoxOwner, GameState, GridSize, LineId, Snapshot } from '../types/game.types';

export function buildInitialState(gridSize: GridSize): GameState {
  const dots = gridSize;
  const cells = gridSize - 1;
  return {
    hLines:      Array.from({ length: dots  }, () => Array(cells).fill(false)),
    vLines:      Array.from({ length: cells }, () => Array(dots).fill(false)),
    hLineOwners: Array.from({ length: dots  }, () => Array(cells).fill(0) as BoxOwner[]),
    vLineOwners: Array.from({ length: cells }, () => Array(dots).fill(0)  as BoxOwner[]),
    boxes:       Array.from({ length: cells }, () => Array(cells).fill(0) as BoxOwner[]),
    currentPlayer: 1,
    scores: { p1: 0, p2: 0 },
    isGameOver: false,
    history: [],
  };
}

export function getCompletedBoxes(
  state: Pick<GameState, 'hLines' | 'vLines' | 'boxes'>,
  line: LineId,
  gridSize: GridSize,
): [number, number][] {
  const cells = gridSize - 1;
  const completed: [number, number][] = [];

  const check = (r: number, c: number) => {
    if (r < 0 || r >= cells || c < 0 || c >= cells) return;
    if (state.boxes[r][c] !== 0) return;
    if (
      state.hLines[r][c] && state.hLines[r + 1][c] &&
      state.vLines[r][c] && state.vLines[r][c + 1]
    ) completed.push([r, c]);
  };

  if (line.type === 'h') {
    check(line.row - 1, line.col);
    check(line.row, line.col);
  } else {
    check(line.row, line.col - 1);
    check(line.row, line.col);
  }

  return completed;
}

export function isLineDrawn(
  state: Pick<GameState, 'hLines' | 'vLines'>,
  line: LineId,
): boolean {
  return line.type === 'h'
    ? state.hLines[line.row][line.col]
    : state.vLines[line.row][line.col];
}

export function getAllAvailableLines(
  state: Pick<GameState, 'hLines' | 'vLines'>,
  gridSize: GridSize,
): LineId[] {
  const dots = gridSize;
  const cells = gridSize - 1;
  const all: LineId[] = [];
  for (let r = 0; r < dots; r++) for (let c = 0; c < cells; c++) all.push({ type: 'h', row: r, col: c });
  for (let r = 0; r < cells; r++) for (let c = 0; c < dots; c++) all.push({ type: 'v', row: r, col: c });
  return all.filter(l => !isLineDrawn(state, l));
}

export function countSidesOfBox(
  state: Pick<GameState, 'hLines' | 'vLines'>,
  r: number,
  c: number,
): number {
  return (state.hLines[r][c] ? 1 : 0)
    + (state.hLines[r + 1][c] ? 1 : 0)
    + (state.vLines[r][c] ? 1 : 0)
    + (state.vLines[r][c + 1] ? 1 : 0);
}

/** Shallow-clone state with one line applied (does not update boxes). */
export function simApplyLine(
  state: Pick<GameState, 'hLines' | 'vLines' | 'boxes'>,
  line: LineId,
): Pick<GameState, 'hLines' | 'vLines' | 'boxes'> {
  const hLines = state.hLines.map(r => [...r]);
  const vLines = state.vLines.map(r => [...r]);
  if (line.type === 'h') hLines[line.row][line.col] = true;
  else vLines[line.row][line.col] = true;
  return { hLines, vLines, boxes: state.boxes };
}

export function takeSnapshot(state: GameState): Snapshot {
  return {
    hLines:      state.hLines.map(r => [...r]),
    vLines:      state.vLines.map(r => [...r]),
    hLineOwners: state.hLineOwners.map(r => [...r]) as BoxOwner[][],
    vLineOwners: state.vLineOwners.map(r => [...r]) as BoxOwner[][],
    boxes:       state.boxes.map(r => [...r]) as BoxOwner[][],
    currentPlayer: state.currentPlayer,
    scores: { ...state.scores },
  };
}
