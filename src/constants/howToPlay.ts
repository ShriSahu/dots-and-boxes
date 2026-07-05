import { HowToPlayStep } from '../components/HowToPlayModal';

export const TTT_HOW_TO_PLAY: HowToPlayStep[] = [
  {
    emoji: '🔳',
    title: '9 boards in one',
    body: 'The board is a 3×3 grid of small tic-tac-toe boards. Win a small board by getting 3 in a row on it, just like classic tic-tac-toe.',
  },
  {
    emoji: '➡️',
    title: 'Your move sends them',
    body: "Whichever cell you play in your small board sends your opponent to the matching small board next. Play the top-right cell, and they must play in the top-right board.",
  },
  {
    emoji: '🆓',
    title: 'Free choice',
    body: "If that board is already won or full, your opponent gets to play in any open board instead. Sending someone to a decided board is a big gift — avoid it!",
  },
  {
    emoji: '🏆',
    title: 'Win the meta-game',
    body: 'Win 3 small boards in a row (row, column, or diagonal) on the big grid to win the whole game. All boards decided with no line = a draw.',
  },
];

export const HEX_HOW_TO_PLAY: HowToPlayStep[] = [
  {
    emoji: '🔷',
    title: 'Connect your sides',
    body: "The board is a rhombus of hexagons. Player 1 (top/bottom edges) must connect the top row to the bottom row. Player 2 (left/right edges) must connect the left column to the right column.",
  },
  {
    emoji: '⬡',
    title: 'One stone per turn',
    body: 'Players alternate placing one stone on any empty hex. There is no capturing — stones never move or get removed.',
  },
  {
    emoji: '🚫',
    title: 'No draws possible',
    body: "Once the board fills up, exactly one side is guaranteed to have connected — Hex mathematically can never end in a draw.",
  },
  {
    emoji: '🧠',
    title: 'Tip: blocking is building',
    body: 'A hex touches 6 neighbors (including two diagonals). Blocking your opponent\'s path often extends your own at the same time — look for moves that do both.',
  },
];

export const SPOTBOT_HOW_TO_PLAY: HowToPlayStep[] = [
  {
    emoji: '🎮',
    title: 'A quick, mystery round',
    body: "You'll play one fast round of classic tic-tac-toe (X) against an opponent (O). You won't be told upfront whether they're a real matched human player or an AI bot.",
  },
  {
    emoji: '⏱️',
    title: 'Matchmaking with a fallback',
    body: "The game looks for another waiting human for a few seconds. If nobody's around, a bot quietly steps in so you can still play immediately.",
  },
  {
    emoji: '🕵️',
    title: 'Guess: human or bot?',
    body: 'After the round ends (win, lose, or draw), guess whether your opponent was a human or a bot based on how they played.',
  },
  {
    emoji: '🪙',
    title: 'Score points',
    body: 'Guess correctly to earn coins and build up your spotting record, shown after every round.',
  },
];
