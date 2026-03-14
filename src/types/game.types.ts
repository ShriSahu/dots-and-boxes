export type Player = 1 | 2;
export type BoxOwner = 0 | 1 | 2;
export type GameMode = '2player' | 'ai' | 'online';
export type GridSize = 3 | 4 | 5 | 6;
export type Difficulty = 'easy' | 'medium' | 'hard';
export type TimerOption = 0 | 10 | 15 | 30;
export type RoomStatus = 'waiting' | 'active' | 'finished' | 'abandoned';
export type ThemeName = 'parchment' | 'neon' | 'chalkboard' | 'blueprint';

export interface Snapshot {
  hLines: boolean[][];
  vLines: boolean[][];
  boxes: BoxOwner[][];
  currentPlayer: Player;
  scores: { p1: number; p2: number };
}

export interface GameState {
  hLines: boolean[][];
  vLines: boolean[][];
  boxes: BoxOwner[][];
  currentPlayer: Player;
  scores: { p1: number; p2: number };
  isGameOver: boolean;
  history: Snapshot[];
}

export interface GameConfig {
  gridSize: GridSize;
  mode: GameMode;
  p1Name: string;
  p2Name: string;
  difficulty: Difficulty;
  timerSeconds: TimerOption;
}

export interface LineId {
  type: 'h' | 'v';
  row: number;
  col: number;
}

export interface GameResult {
  winner: 'p1' | 'p2' | 'draw';
  scores: { p1: number; p2: number };
  p1Name: string;
  p2Name: string;
}

export interface Stats {
  w: number;
  l: number;
  d: number;
}

export interface OnlineRoom {
  roomCode: string;
  status: RoomStatus;
  gridSize: GridSize;
  timerSeconds: TimerOption;
  host: { uid: string; name: string; score: number };
  guest: { uid: string | null; name: string | null; score: number };
  currentPlayerUid: string;
  moveCount: number;
  hLines: boolean[];
  vLines: boolean[];
  boxes: number[];
  lastMove: { type: 'h' | 'v'; row: number; col: number; uid: string } | null;
  createdAt: any;
  updatedAt: any;
  rematchRequestedBy: string | null;
  rematchRoomCode: string | null;
}

export interface CoinTransaction {
  uid: string;
  delta: number;
  reason: 'win' | 'draw' | 'participation' | 'purchase' | 'bonus';
  roomCode: string | null;
  createdAt: any;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  coins: number;
  lastDailyBonus?: any;
  stats: { onlineWins: number; onlineLosses: number; onlineDraws: number };
}
