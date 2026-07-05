import { TTTCell, TTTBoardResult } from './ttt.types';

export type SpotBotOpponentKind = 'human' | 'bot';
export type SpotBotPhase = 'queueing' | 'playing' | 'guessing' | 'result';

export interface SpotBotRoundState {
  /** A single classic 3x3 tic-tac-toe board. */
  cells:         TTTCell[];
  currentPlayer: 1 | 2;
  /** 0 = in progress, 1/2 = winner, 3 = draw. */
  result:        TTTBoardResult;
  isOver:        boolean;
  history:       number[];
}

export type SpotBotRoomStatus = 'waiting' | 'active' | 'finished' | 'abandoned';

export interface SpotBotOnlineRoom {
  roomCode:         string;
  status:           SpotBotRoomStatus;
  cells:            TTTCell[];
  host:  { uid: string; name: string };
  guest: { uid: string; name: string };
  currentPlayerUid: string;
  moveCount:        number;
  result:           TTTBoardResult;
  lastMove:         { cell: number; uid: string } | null;
  createdAt:        any;
  updatedAt:        any;
}

export interface SpotBotScore {
  correctGuesses: number;
  totalGuesses:   number;
}
