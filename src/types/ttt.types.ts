export type TTTCell   = 0 | 1 | 2;
export type TTTPlayer = 1 | 2;
/** Per small-board outcome: 0 = undecided, 1/2 = won by player, 3 = drawn (full, no winner). */
export type TTTBoardResult = 0 | 1 | 2 | 3;
export type TTTMode = '2player' | 'ai' | 'online';
export type TTTDifficulty = 'easy' | 'medium' | 'hard';

export interface TTTMove {
  board: number; // 0-8, index of the small board
  cell:  number; // 0-8, index within the small board
}

export interface TTTState {
  /** 9 small boards, each 9 cells. boards[b][c]. */
  boards:        TTTCell[][];
  boardResults:  TTTBoardResult[];
  /** Which board the current player must play in; null = play anywhere open. */
  activeBoard:   number | null;
  currentPlayer: TTTPlayer;
  /** Overall winner: 0 = in progress, 1/2 = winner, 3 = draw. */
  winner:        TTTBoardResult;
  isGameOver:    boolean;
  history:       TTTMove[];
}

export interface TTTConfig {
  mode:       TTTMode;
  p1Name:     string;
  p2Name:     string;
  difficulty: TTTDifficulty;
}

export interface TTTResult {
  winner: 'p1' | 'p2' | 'draw';
  p1Name: string;
  p2Name: string;
}

export type TTTRoomStatus = 'waiting' | 'active' | 'finished' | 'abandoned';

export interface TTTOnlineRoom {
  roomCode:          string;
  status:            TTTRoomStatus;
  boards:            TTTCell[][];
  boardResults:      TTTBoardResult[];
  activeBoard:        number | null;
  host:  { uid: string;        name: string;        lastActive?: any };
  guest: { uid: string | null; name: string | null;  lastActive?: any };
  currentPlayerUid:  string;
  moveCount:         number;
  winner:            TTTBoardResult;
  lastMove:          (TTTMove & { uid: string }) | null;
  createdAt:          any;
  updatedAt:          any;
  rematchRequestedBy: string | null;
  rematchRoomCode:    string | null;
}
