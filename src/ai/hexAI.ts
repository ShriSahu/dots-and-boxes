import { HexCell, HexMove, HexPlayer } from '../types/hex.types';
import { getHexNeighbors, getLegalHexMoves } from '../utils/hexHelpers';

const INF = Infinity;

/**
 * 0-1 BFS shortest-path cost for `player` to connect their two edges, where
 * entering a cell already owned by `player` costs 0, an empty cell costs 1
 * (one stone needed there), and an opponent cell costs Infinity (blocked).
 * This is the standard "resistance distance" style heuristic used by simple
 * Hex bots: lower cost = fewer stones needed to complete the connection.
 */
function shortestPathCost(board: HexCell[][], size: number, player: HexPlayer): number {
  const dist: number[][] = Array.from({ length: size }, () => Array(size).fill(INF));
  // Deque-based 0-1 BFS
  const deque: [number, number][] = [];

  const cellCost = (r: number, c: number): number => {
    const v = board[r][c];
    if (v === player) return 0;
    if (v === 0) return 1;
    return INF;
  };

  const starts: [number, number][] = [];
  if (player === 1) {
    for (let c = 0; c < size; c++) starts.push([0, c]);
  } else {
    for (let r = 0; r < size; r++) starts.push([r, 0]);
  }

  for (const [r, c] of starts) {
    const cost = cellCost(r, c);
    if (cost < dist[r][c]) {
      dist[r][c] = cost;
      if (cost === 0) deque.unshift([r, c]); else deque.push([r, c]);
    }
  }

  while (deque.length) {
    const [r, c] = deque.shift()!;
    const d = dist[r][c];
    for (const [nr, nc] of getHexNeighbors(r, c, size)) {
      const stepCost = cellCost(nr, nc);
      if (stepCost === INF) continue;
      const nd = d + stepCost;
      if (nd < dist[nr][nc]) {
        dist[nr][nc] = nd;
        if (stepCost === 0) deque.unshift([nr, nc]); else deque.push([nr, nc]);
      }
    }
  }

  let best = INF;
  if (player === 1) {
    for (let c = 0; c < size; c++) best = Math.min(best, dist[size - 1][c]);
  } else {
    for (let r = 0; r < size; r++) best = Math.min(best, dist[r][size - 1]);
  }
  return best;
}

/**
 * Heuristic AI: for each legal move, scores how much it shortens the AI's
 * own path to connecting its sides, plus a bonus for how much it would have
 * helped the opponent had they taken it (i.e. blocking value). Picks the
 * best-scoring move, with light randomization among near-ties so play isn't
 * fully deterministic.
 */
export function getHexAIMove(
  board: HexCell[][], size: number, aiPlayer: HexPlayer,
): HexMove {
  const legal = getLegalHexMoves({ board, isGameOver: false }, size);
  if (!legal.length) return { row: 0, col: 0 };

  const opponent: HexPlayer = aiPlayer === 1 ? 2 : 1;
  const myCostBefore  = shortestPathCost(board, size, aiPlayer);
  const oppCostBefore = shortestPathCost(board, size, opponent);

  let bestScore = -Infinity;
  let bestMoves: HexMove[] = [];

  for (const move of legal) {
    const trial = board.map(r => [...r]) as HexCell[][];
    trial[move.row][move.col] = aiPlayer;
    const myCostAfter = shortestPathCost(trial, size, aiPlayer);

    const trialOpp = board.map(r => [...r]) as HexCell[][];
    trialOpp[move.row][move.col] = opponent;
    const oppCostIfTheyTookIt = shortestPathCost(trialOpp, size, opponent);

    const myImprovement  = myCostBefore - myCostAfter;
    const blockingValue  = oppCostIfTheyTookIt - oppCostBefore;
    const score = myImprovement * 2 + blockingValue;

    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}
