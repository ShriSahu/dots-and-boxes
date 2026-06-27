import { GameState, LineId, Difficulty } from '../../types/game.types';
import { buildInitialState, getAllAvailableLines, countSidesOfBox, simApplyLine } from '../../utils/gameHelpers';
import { getAIMove } from '../aiPlayer';

function draw(state: GameState, line: LineId) {
  if (line.type === 'h') state.hLines[line.row][line.col] = true;
  else state.vLines[line.row][line.col] = true;
}

function sameLine(a: LineId, b: LineId) {
  return a.type === b.type && a.row === b.row && a.col === b.col;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

describe('getAIMove', () => {
  it.each(DIFFICULTIES)('returns a legal available move on an empty board (%s)', (d) => {
    const s = buildInitialState(3);
    const move = getAIMove(s, 3, d);
    const avail = getAllAvailableLines(s, 3);
    expect(avail.some(l => sameLine(l, move))).toBe(true);
  });

  it.each(DIFFICULTIES)('takes the box-completing move when one exists (%s)', (d) => {
    const s = buildInitialState(3);
    // Box (0,0) has 3 sides; the bottom is the only completing move.
    draw(s, { type: 'h', row: 0, col: 0 }); // top
    draw(s, { type: 'v', row: 0, col: 0 }); // left
    draw(s, { type: 'v', row: 0, col: 1 }); // right
    const completing: LineId = { type: 'h', row: 1, col: 0 };
    const move = getAIMove(s, 3, d);
    expect(sameLine(move, completing)).toBe(true);
  });

  it.each<Difficulty>(['medium', 'hard'])(
    'avoids creating a 3-sided box when a safe move exists (%s)',
    (d) => {
      const s = buildInitialState(3);
      // Box (0,0) has 2 sides. Adding its remaining sides would gift a 3-sided box.
      draw(s, { type: 'h', row: 0, col: 0 }); // top
      draw(s, { type: 'v', row: 0, col: 0 }); // left
      const giftMoves: LineId[] = [
        { type: 'v', row: 0, col: 1 }, // right -> makes box(0,0) 3-sided
        { type: 'h', row: 1, col: 0 }, // bottom -> makes box(0,0) 3-sided
      ];
      const move = getAIMove(s, 3, d);
      expect(giftMoves.some(g => sameLine(g, move))).toBe(false);

      // The chosen move must not produce any 3-sided unclaimed box.
      const sim = simApplyLine(s, move);
      let creates3 = false;
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 2; c++)
          if (!sim.boxes[r][c] && countSidesOfBox(sim, r, c) === 3) creates3 = true;
      expect(creates3).toBe(false);
    },
  );

  it('returns a fallback move when the board is full', () => {
    const s = buildInitialState(3);
    getAllAvailableLines(s, 3).forEach(l => draw(s, l));
    const move = getAIMove(s, 3, 'medium');
    expect(move).toEqual({ type: 'h', row: 0, col: 0 });
  });
});
