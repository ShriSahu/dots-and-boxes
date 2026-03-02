export type Player = 1 | 2;
export type BoxOwner = 0 | 1 | 2;
export type GameMode = '2player' | 'ai';
export type GridSize = 3 | 4 | 5 | 6;

export interface GameState {
  hLines: boolean[][];   // [row][col] — rows+1 rows, cols cols
  vLines: boolean[][];   // [row][col] — rows rows, cols+1 cols
  boxes: BoxOwner[][];   // [row][col] — rows x cols
  currentPlayer: Player;
  scores: { p1: number; p2: number };
  isGameOver: boolean;
  lastClaimedBoxes: number; // how many boxes claimed in last move
}

export interface GameConfig {
  gridSize: GridSize;
  mode: GameMode;
  p1Name: string;
  p2Name: string;
}

export interface LineId {
  type: 'h' | 'v';
  row: number;
  col: number;
}
