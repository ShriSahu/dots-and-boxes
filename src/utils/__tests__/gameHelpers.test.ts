import { GameState, LineId } from '../../types/game.types';
import {
  buildInitialState,
  getCompletedBoxes,
  isLineDrawn,
  getAllAvailableLines,
  countSidesOfBox,
  simApplyLine,
  takeSnapshot,
} from '../gameHelpers';

/** Mutates a local test state by marking a line drawn. */
function draw(state: GameState, line: LineId) {
  if (line.type === 'h') state.hLines[line.row][line.col] = true;
  else state.vLines[line.row][line.col] = true;
}

describe('buildInitialState', () => {
  it('builds correctly sized empty grids for gridSize 3', () => {
    const s = buildInitialState(3);
    // dots = 3, cells = 2
    expect(s.hLines).toHaveLength(3);
    expect(s.hLines[0]).toHaveLength(2);
    expect(s.vLines).toHaveLength(2);
    expect(s.vLines[0]).toHaveLength(3);
    expect(s.boxes).toHaveLength(2);
    expect(s.boxes[0]).toHaveLength(2);
  });

  it('starts with player 1, zero scores, no history, not over', () => {
    const s = buildInitialState(4);
    expect(s.currentPlayer).toBe(1);
    expect(s.scores).toEqual({ p1: 0, p2: 0 });
    expect(s.history).toEqual([]);
    expect(s.isGameOver).toBe(false);
  });

  it('has all lines undrawn initially', () => {
    const s = buildInitialState(5);
    expect(s.hLines.flat().every(v => v === false)).toBe(true);
    expect(s.vLines.flat().every(v => v === false)).toBe(true);
    expect(s.boxes.flat().every(v => v === 0)).toBe(true);
  });
});

describe('isLineDrawn', () => {
  it('reflects drawn state for h and v lines', () => {
    const s = buildInitialState(3);
    const h: LineId = { type: 'h', row: 0, col: 0 };
    const v: LineId = { type: 'v', row: 1, col: 2 };
    expect(isLineDrawn(s, h)).toBe(false);
    draw(s, h);
    draw(s, v);
    expect(isLineDrawn(s, h)).toBe(true);
    expect(isLineDrawn(s, v)).toBe(true);
  });
});

describe('getAllAvailableLines', () => {
  it('returns every line on an empty grid', () => {
    const s = buildInitialState(3);
    // h: 3*2 = 6, v: 2*3 = 6 -> 12
    expect(getAllAvailableLines(s, 3)).toHaveLength(12);
  });

  it('excludes already drawn lines', () => {
    const s = buildInitialState(3);
    draw(s, { type: 'h', row: 0, col: 0 });
    draw(s, { type: 'v', row: 0, col: 0 });
    expect(getAllAvailableLines(s, 3)).toHaveLength(10);
  });
});

describe('countSidesOfBox', () => {
  it('counts drawn sides of a box', () => {
    const s = buildInitialState(3);
    expect(countSidesOfBox(s, 0, 0)).toBe(0);
    draw(s, { type: 'h', row: 0, col: 0 }); // top
    draw(s, { type: 'v', row: 0, col: 0 }); // left
    expect(countSidesOfBox(s, 0, 0)).toBe(2);
    draw(s, { type: 'v', row: 0, col: 1 }); // right
    draw(s, { type: 'h', row: 1, col: 0 }); // bottom
    expect(countSidesOfBox(s, 0, 0)).toBe(4);
  });
});

describe('getCompletedBoxes', () => {
  it('returns no box when fewer than 4 sides are drawn', () => {
    const s = buildInitialState(3);
    draw(s, { type: 'h', row: 0, col: 0 });
    draw(s, { type: 'v', row: 0, col: 0 });
    draw(s, { type: 'v', row: 0, col: 1 });
    const last: LineId = { type: 'v', row: 0, col: 1 };
    expect(getCompletedBoxes(s, last, 3)).toEqual([]);
  });

  it('returns the box completed by the final side', () => {
    const s = buildInitialState(3);
    draw(s, { type: 'h', row: 0, col: 0 });
    draw(s, { type: 'v', row: 0, col: 0 });
    draw(s, { type: 'v', row: 0, col: 1 });
    const closing: LineId = { type: 'h', row: 1, col: 0 };
    draw(s, closing);
    expect(getCompletedBoxes(s, closing, 3)).toEqual([[0, 0]]);
  });

  it('detects two boxes completed by a single shared line', () => {
    const s = buildInitialState(3);
    // Box (0,0): top, left, right. Box (1,0): left, right, bottom.
    draw(s, { type: 'h', row: 0, col: 0 }); // box(0,0) top
    draw(s, { type: 'v', row: 0, col: 0 }); // box(0,0) left
    draw(s, { type: 'v', row: 0, col: 1 }); // box(0,0) right
    draw(s, { type: 'v', row: 1, col: 0 }); // box(1,0) left
    draw(s, { type: 'v', row: 1, col: 1 }); // box(1,0) right
    draw(s, { type: 'h', row: 2, col: 0 }); // box(1,0) bottom
    // Shared line between the two boxes closes both at once.
    const shared: LineId = { type: 'h', row: 1, col: 0 };
    draw(s, shared);
    const completed = getCompletedBoxes(s, shared, 3);
    expect(completed).toEqual(expect.arrayContaining([[0, 0], [1, 0]]));
    expect(completed).toHaveLength(2);
  });

  it('does not re-report an already-owned box', () => {
    const s = buildInitialState(3);
    draw(s, { type: 'h', row: 0, col: 0 });
    draw(s, { type: 'v', row: 0, col: 0 });
    draw(s, { type: 'v', row: 0, col: 1 });
    const closing: LineId = { type: 'h', row: 1, col: 0 };
    draw(s, closing);
    s.boxes[0][0] = 1; // already claimed
    expect(getCompletedBoxes(s, closing, 3)).toEqual([]);
  });
});

describe('simApplyLine', () => {
  it('returns a new state with the line drawn', () => {
    const s = buildInitialState(3);
    const line: LineId = { type: 'h', row: 0, col: 0 };
    const next = simApplyLine(s, line);
    expect(next.hLines[0][0]).toBe(true);
  });

  it('does not mutate the original h/v line arrays', () => {
    const s = buildInitialState(3);
    simApplyLine(s, { type: 'v', row: 0, col: 0 });
    expect(s.vLines[0][0]).toBe(false);
  });
});

describe('takeSnapshot', () => {
  it('produces a deep copy independent of the source state', () => {
    const s = buildInitialState(3);
    draw(s, { type: 'h', row: 0, col: 0 });
    s.scores.p1 = 2;
    const snap = takeSnapshot(s);
    // Mutate source afterwards; snapshot must be unaffected.
    s.hLines[0][0] = false;
    s.scores.p1 = 5;
    expect(snap.hLines[0][0]).toBe(true);
    expect(snap.scores.p1).toBe(2);
  });
});
