export type HexCell    = 0 | 1 | 2;
export type HexPlayer  = 1 | 2;
export type HexBoardSize = 9 | 11 | 13;
export type HexMode    = '2player' | 'ai' | 'online';

export interface HexMove {
  row: number;
  col: number;
}

export interface HexState {
  board:         HexCell[][];
  /** Board is always square; typed as number (not HexBoardSize) so pure logic
   *  and tests can exercise arbitrary sizes, while the UI only offers 9/11/13. */
  size:          number;
  currentPlayer: HexPlayer;
  /** 0 = in progress, 1/2 = that player has connected their sides. Hex has no draws. */
  winner:        0 | HexPlayer;
  isGameOver:    boolean;
  history:       HexMove[];
}

export interface HexConfig {
  mode:      HexMode;
  p1Name:    string;
  p2Name:    string;
  boardSize: HexBoardSize;
}

export interface HexResult {
  winner: 'p1' | 'p2';
  p1Name: string;
  p2Name: string;
}

export type HexRoomStatus = 'waiting' | 'active' | 'finished' | 'abandoned';

export interface HexOnlineRoom {
  roomCode:          string;
  status:            HexRoomStatus;
  board:             HexCell[][];
  size:              HexBoardSize;
  host:  { uid: string;        name: string;        lastActive?: any };
  guest: { uid: string | null; name: string | null;  lastActive?: any };
  currentPlayerUid:  string;
  moveCount:         number;
  winner:            0 | HexPlayer;
  lastMove:          (HexMove & { uid: string }) | null;
  createdAt:          any;
  updatedAt:          any;
  rematchRequestedBy: string | null;
  rematchRoomCode:    string | null;
}
