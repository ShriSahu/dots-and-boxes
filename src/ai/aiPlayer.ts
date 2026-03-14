import { GameState, GridSize, LineId, Difficulty } from '../types/game.types';
import {
  getAllAvailableLines,
  getCompletedBoxes,
  countSidesOfBox,
  simApplyLine,
} from '../utils/gameHelpers';

export function getAIMove(state: GameState, gridSize: GridSize, difficulty: Difficulty): LineId {
  switch (difficulty) {
    case 'easy':   return _aiEasy(state, gridSize);
    case 'hard':   return _aiHard(state, gridSize);
    default:       return _aiMedium(state, gridSize);
  }
}

// ── Easy: grab winning move if available, otherwise random ──────────────────
function _aiEasy(state: GameState, g: GridSize): LineId {
  const avail = getAllAvailableLines(state, g);
  if (!avail.length) return { type: 'h', row: 0, col: 0 };
  for (const l of avail) {
    if (getCompletedBoxes(simApplyLine(state, l), l, g).length > 0) return l;
  }
  return avail[Math.floor(Math.random() * avail.length)];
}

// ── Medium: win → safe → minimize gift ─────────────────────────────────────
function _aiMedium(state: GameState, g: GridSize): LineId {
  const avail = getAllAvailableLines(state, g);
  if (!avail.length) return { type: 'h', row: 0, col: 0 };
  const cells = g - 1;

  for (const l of avail) {
    if (getCompletedBoxes(simApplyLine(state, l), l, g).length > 0) return l;
  }

  const safe = avail.filter(l => {
    const sim = simApplyLine(state, l);
    for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) {
      if (sim.boxes[r][c]) continue;
      if (countSidesOfBox(sim, r, c) === 3) return false;
    }
    return true;
  });
  if (safe.length) return safe[Math.floor(Math.random() * safe.length)];

  let best = avail[0], bestGift = Infinity;
  for (const l of avail) {
    const sim = simApplyLine(state, l);
    let gift = 0;
    for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) {
      if (sim.boxes[r][c]) continue;
      if (countSidesOfBox(sim, r, c) === 3) gift++;
    }
    if (gift < bestGift) { bestGift = gift; best = l; }
  }
  return best;
}

// ── Hard: minimax with alpha-beta pruning ───────────────────────────────────
function _aiHard(state: GameState, g: GridSize): LineId {
  const avail = getAllAvailableLines(state, g);
  if (!avail.length) return { type: 'h', row: 0, col: 0 };
  const cells = g - 1;

  for (const l of avail) {
    if (getCompletedBoxes(simApplyLine(state, l), l, g).length > 0) return l;
  }

  const safe = avail.filter(l => {
    const sim = simApplyLine(state, l);
    for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) {
      if (sim.boxes[r][c]) continue;
      if (countSidesOfBox(sim, r, c) === 3) return false;
    }
    return true;
  });
  if (safe.length) return safe[Math.floor(Math.random() * safe.length)];

  const maxDepth = g <= 3 ? 8 : g <= 4 ? 6 : g <= 5 ? 4 : 3;
  let bestMove = avail[0], bestVal = -Infinity;
  for (const l of avail) {
    const { ns, claimed } = _mmStep(state, l, g, 2);
    const val = _mmSearch(ns, g, maxDepth - 1, -Infinity, Infinity, claimed > 0);
    if (val > bestVal) { bestVal = val; bestMove = l; }
  }
  return bestMove;
}

type SimState = Pick<GameState, 'hLines' | 'vLines' | 'boxes'>;

function _mmStep(state: SimState, line: LineId, g: GridSize, player: 1 | 2) {
  const hLines = state.hLines.map(r => [...r]);
  const vLines = state.vLines.map(r => [...r]);
  const boxes  = state.boxes.map(r => [...r]) as GameState['boxes'];
  if (line.type === 'h') hLines[line.row][line.col] = true;
  else vLines[line.row][line.col] = true;
  const ns: SimState = { hLines, vLines, boxes };
  const completed = getCompletedBoxes(ns, line, g);
  completed.forEach(([r, c]) => { boxes[r][c] = player; });
  return { ns, claimed: completed.length };
}

function _mmSearch(
  state: SimState, g: GridSize, depth: number,
  alpha: number, beta: number, isAITurn: boolean,
): number {
  const cells = g - 1;
  const avail = getAllAvailableLines(state as GameState, g);
  if (!avail.length || depth <= 0) {
    let score = 0;
    for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) {
      const o = state.boxes[r][c];
      if (o === 2) score++; else if (o === 1) score--;
    }
    return score;
  }
  const player: 1 | 2 = isAITurn ? 2 : 1;
  if (isAITurn) {
    let best = -Infinity;
    for (const l of avail) {
      const { ns, claimed } = _mmStep(state, l, g, player);
      const v = _mmSearch(ns, g, depth - 1, alpha, beta, claimed > 0);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const l of avail) {
      const { ns, claimed } = _mmStep(state, l, g, player);
      const v = _mmSearch(ns, g, depth - 1, alpha, beta, claimed > 0 ? false : true);
      if (v < best) best = v;
      if (v < beta) beta = v;
      if (beta <= alpha) break;
    }
    return best;
  }
}
