import { BoxOwner, GameState, GridSize, LineId } from '../types/game.types';

export function createInitialState(gridSize: GridSize): Omit<GameState, 'currentPlayer' | 'scores' | 'isGameOver' | 'lastClaimedBoxes'> {
  const dots = gridSize;
  const cells = gridSize - 1;
  return {
    hLines: Array.from({ length: dots }, () => Array(cells).fill(false)),
    vLines: Array.from({ length: cells }, () => Array(dots).fill(false)),
    boxes: Array.from({ length: cells }, () => Array(cells).fill(0) as BoxOwner[]),
  };
}

/** Check how many boxes a given line completes. Returns array of [row,col] for each completed box. */
export function getCompletedBoxes(
  state: Pick<GameState, 'hLines' | 'vLines' | 'boxes'>,
  line: LineId,
  gridSize: GridSize
): [number, number][] {
  const cells = gridSize - 1;
  const completed: [number, number][] = [];

  const checkBox = (r: number, c: number) => {
    if (r < 0 || r >= cells || c < 0 || c >= cells) return;
    if (state.boxes[r][c] !== 0) return;
    const top = state.hLines[r][c];
    const bottom = state.hLines[r + 1][c];
    const left = state.vLines[r][c];
    const right = state.vLines[r][c + 1];
    if (top && bottom && left && right) completed.push([r, c]);
  };

  if (line.type === 'h') {
    // top side of row `line.row`, bottom side of row `line.row - 1`
    checkBox(line.row - 1, line.col);
    checkBox(line.row, line.col);
  } else {
    // left side of col `line.col`, right side of col `line.col - 1`
    checkBox(line.row, line.col - 1);
    checkBox(line.row, line.col);
  }

  return completed;
}

export function isLineDrawn(state: Pick<GameState, 'hLines' | 'vLines'>, line: LineId): boolean {
  if (line.type === 'h') return state.hLines[line.row][line.col];
  return state.vLines[line.row][line.col];
}

export function getAllLines(gridSize: GridSize): LineId[] {
  const lines: LineId[] = [];
  const dots = gridSize;
  const cells = gridSize - 1;
  for (let r = 0; r < dots; r++) for (let c = 0; c < cells; c++) lines.push({ type: 'h', row: r, col: c });
  for (let r = 0; r < cells; r++) for (let c = 0; c < dots; c++) lines.push({ type: 'v', row: r, col: c });
  return lines;
}

export function countSidesOfBox(
  state: Pick<GameState, 'hLines' | 'vLines'>,
  r: number, c: number
): number {
  let count = 0;
  if (state.hLines[r][c]) count++;
  if (state.hLines[r + 1][c]) count++;
  if (state.vLines[r][c]) count++;
  if (state.vLines[r][c + 1]) count++;
  return count;
}
