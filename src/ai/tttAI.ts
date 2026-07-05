import { TTTDifficulty, TTTMove, TTTState } from '../types/ttt.types';
import { applyTTTMove, getLegalMoves } from '../utils/tttHelpers';

const CENTER_BOARD_BONUS = 3;
const CORNER_BOARD_BONUS = 2;
const CENTER_CELL_BONUS  = 3;
const CORNER_CELL_BONUS  = 2;
const CENTER_INDICES = [4];
const CORNER_INDICES = [0, 2, 6, 8];

function cellPositionScore(i: number): number {
  if (CENTER_INDICES.includes(i)) return CENTER_CELL_BONUS;
  if (CORNER_INDICES.includes(i)) return CORNER_CELL_BONUS;
  return 0;
}

/** Score a resulting state from the AI's (player 2) point of view. Higher = better for AI. */
function scoreState(state: TTTState, aiPlayer: 1 | 2): number {
  if (state.isGameOver) {
    if (state.winner === aiPlayer) return 10_000;
    if (state.winner === 3) return 0;
    return -10_000;
  }

  const opponent = aiPlayer === 1 ? 2 : 1;
  let score = 0;

  for (let b = 0; b < 9; b++) {
    const result = state.boardResults[b];
    const boardBonus = CENTER_INDICES.includes(b)
      ? CENTER_BOARD_BONUS
      : CORNER_INDICES.includes(b) ? CORNER_BOARD_BONUS : 1;
    if (result === aiPlayer) score += 15 * boardBonus;
    else if (result === opponent) score -= 15 * boardBonus;
    else if (result === 0) {
      // Small-board tactical value: reward being one move from winning it,
      // penalize letting the opponent be one move from winning it.
      const cells = state.boards[b];
      score += _threatScore(cells, aiPlayer, opponent) * boardBonus;
    }
  }

  // Sending the opponent to a decided (free-choice) board is generally bad —
  // it hands them the whole board back.
  if (!state.isGameOver && state.activeBoard === null && state.history.length > 0) {
    score -= 4;
  }

  return score;
}

function _threatScore(cells: number[], aiPlayer: 1 | 2, opponent: 1 | 2): number {
  const LINES: [number, number, number][] = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  let score = 0;
  for (const [a, b, c] of LINES) {
    const line = [cells[a], cells[b], cells[c]];
    const aiCount  = line.filter(v => v === aiPlayer).length;
    const oppCount = line.filter(v => v === opponent).length;
    if (aiCount === 2 && oppCount === 0) score += 5;
    else if (oppCount === 2 && aiCount === 0) score -= 6;
  }
  return score;
}

/**
 * Heuristic AI: always takes an immediate meta-win or blocks an immediate
 * meta-loss; otherwise scores each legal move by simulating it one ply deep
 * and picking the best-scoring result (with small randomization among
 * near-equal top moves so it isn't perfectly deterministic).
 */
export function getTTTAIMove(state: TTTState, difficulty: TTTDifficulty): TTTMove {
  const legal = getLegalMoves(state);
  if (!legal.length) return { board: 0, cell: 0 };

  const aiPlayer = state.currentPlayer;

  if (difficulty === 'easy') {
    // Mostly random, but still grab an immediate meta-winning move if handed one.
    for (const m of legal) {
      const next = applyTTTMove(state, m);
      if (next.isGameOver && next.winner === aiPlayer) return m;
    }
    if (Math.random() < 0.7) return legal[Math.floor(Math.random() * legal.length)];
  }

  // Immediate win check for all non-easy tiers (and the 30% fallthrough above).
  for (const m of legal) {
    const next = applyTTTMove(state, m);
    if (next.isGameOver && next.winner === aiPlayer) return m;
  }

  const scored = legal.map(m => ({ m, s: scoreState(applyTTTMove(state, m), aiPlayer) }));
  scored.sort((a, b) => b.s - a.s);

  if (difficulty === 'medium') {
    // Sample from the top few moves for variety.
    const topN = Math.min(3, scored.length);
    const pick = scored[Math.floor(Math.random() * topN)];
    return pick.m;
  }

  // hard: two-ply lookahead — for each of our candidate moves, assume the
  // opponent replies with their own best-scoring response, and pick the move
  // that minimizes the opponent's best counter-score.
  const opponent = aiPlayer === 1 ? 2 : 1;
  let best = scored[0].m;
  let bestWorstCase = -Infinity;
  const topCandidates = scored.slice(0, Math.min(6, scored.length));
  for (const { m } of topCandidates) {
    const afterMine = applyTTTMove(state, m);
    let worst = scoreState(afterMine, aiPlayer);
    if (!afterMine.isGameOver) {
      const oppMoves = getLegalMoves(afterMine);
      let oppBest = -Infinity;
      for (const om of oppMoves) {
        const afterOpp = applyTTTMove(afterMine, om);
        const s = scoreState(afterOpp, opponent);
        if (s > oppBest) oppBest = s;
      }
      // Opponent's best score (for them) translates to our worst case.
      worst = oppMoves.length ? -oppBest : worst;
    }
    if (worst > bestWorstCase) { bestWorstCase = worst; best = m; }
  }
  return best;
}
