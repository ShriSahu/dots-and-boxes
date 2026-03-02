import { GameState, GridSize, LineId } from '../types/game.types';
import { getAllLines, isLineDrawn, getCompletedBoxes, countSidesOfBox } from '../utils/gameHelpers';

export function getAIMove(state: GameState, gridSize: GridSize): LineId {
  const allLines = getAllLines(gridSize);
  const available = allLines.filter(l => !isLineDrawn(state, l));

  if (available.length === 0) return allLines[0];

  // Tier 1: Take any move that completes a box
  for (const line of available) {
    const newState = applyLine(state, line);
    const completed = getCompletedBoxes(newState, line, gridSize);
    if (completed.length > 0) return line;
  }

  // Tier 2: Safe moves — don't give opponent a box (avoid making any box have 3 sides)
  const safeMoves = available.filter(line => {
    const newState = applyLine(state, line);
    const cells = gridSize - 1;
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        if (newState.boxes[r][c] === 0 && countSidesOfBox(newState, r, c) === 3) {
          return false; // this move would give opponent a box
        }
      }
    }
    return true;
  });

  if (safeMoves.length > 0) {
    // Among safe moves, pick randomly
    return safeMoves[Math.floor(Math.random() * safeMoves.length)];
  }

  // Tier 3: Sacrifice — pick the move that gives opponent fewest boxes
  let bestMove = available[0];
  let bestGift = Infinity;

  for (const line of available) {
    const newState = applyLine(state, line);
    const cells = gridSize - 1;
    let gift = 0;
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        if (newState.boxes[r][c] === 0 && countSidesOfBox(newState, r, c) === 3) gift++;
      }
    }
    if (gift < bestGift) { bestGift = gift; bestMove = line; }
  }

  return bestMove;
}

function applyLine(state: GameState, line: LineId): GameState {
  const hLines = state.hLines.map(row => [...row]);
  const vLines = state.vLines.map(row => [...row]);
  if (line.type === 'h') hLines[line.row][line.col] = true;
  else vLines[line.row][line.col] = true;
  return { ...state, hLines, vLines };
}
