# Dots & Boxes

A classic pen-and-paper Dots & Boxes game built with **React Native + Expo + TypeScript**.
Supports local play, AI opponent, and real-time **online multiplayer** with a **coin reward system** and unlockable themes.

Runs on Android, iOS, and Web from a single codebase — no native build required for development (Expo Go).

---

## Features

### Game Modes
- **2 Players (local)** — pass-and-play on one device
- **vs AI** — 3-tier smart AI (easy / medium / hard)
- **Online Multiplayer** — real-time play over the internet via Firebase Firestore

### Gameplay
- Grid sizes: 3×3, 4×4, 5×5, 6×6
- Turn timer: Off / 10s / 15s / 30s (local modes only)
- Undo move (local modes)
- Haptic feedback on moves and game events
- Toast notifications for box claims and turn switches

### Online Multiplayer
- Create a room → get a 6-character code → share with a friend
- Join a room by entering the code
- Board locked when it is the opponent's turn
- "Opponent disconnected" overlay when the other player leaves
- Rematch with one tap — roles swap automatically

### Coin System
| Event | Coins |
|---|---|
| Win online | +25 |
| Win vs AI | +10 |
| Draw | +3 |
| Participate (loss) | +1 |
| Daily first game | +5 |

- Floating coin animation on game over
- Real-time coin balance in the home screen header
- Coins stored in Firestore per anonymous user

### Theme Shop
| Theme | Cost |
|---|---|
| Parchment (default) | Free |
| Neon | 150 coins |
| Chalkboard | 200 coins |
| Blueprint | 250 coins |

Each theme changes background, dot colour, line colours, box fills, and card styles.
Active theme is persisted in Firestore and applied via a `useTheme()` context hook.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.76 + Expo 52 |
| Navigation | Expo Router (file-based) |
| Language | TypeScript |
| Backend / DB | Firebase Firestore (web SDK v10) |
| Auth | Firebase Anonymous Auth |
| Fonts | Google Fonts — Caveat (handwritten) |
| Graphics | react-native-svg |
| Storage | AsyncStorage (local prefs/stats) |

> Uses the Firebase **web SDK** (`firebase` npm package) — NOT `@react-native-firebase`. Works in Expo Go without any native build.

---

## Quick Start

### Run on your phone (Expo Go — easiest)

1. Install **Expo Go** from the App Store or Play Store
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npx expo start
   ```
4. Scan the QR code with Expo Go (Android) or the Camera app (iOS)

### Run on Android emulator

```bash
npx expo start
# press 'a' in terminal
```

### Run on web

```bash
npx expo start --web
```

---

## Project Structure

```
dots-and-boxes/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout — fonts, ThemeProvider
│   ├── index.tsx                 # Home / settings screen
│   ├── game.tsx                  # Local game screen (2player + AI)
│   ├── lobby.tsx                 # Online lobby (create / join room)
│   ├── online-game.tsx           # Online game screen
│   └── shop.tsx                  # Coin shop + theme unlock
│
├── src/
│   ├── types/
│   │   ├── game.types.ts         # All TypeScript types (GameMode, OnlineRoom, CoinTransaction, etc.)
│   │   └── firebase-shim.d.ts   # Firebase module declarations for TS
│   ├── constants/
│   │   └── theme.ts              # Default parchment theme tokens
│   ├── hooks/
│   │   ├── useGameEngine.ts      # Local game state hook
│   │   ├── useOnlineGame.ts      # Firestore-backed online game hook
│   │   └── useTheme.ts           # ThemeContext + THEMES + THEME_META
│   ├── components/
│   │   ├── GameBoard.tsx         # SVG board rendering
│   │   └── ScoreBar.tsx          # Score + timer bar
│   ├── services/
│   │   ├── firebase.ts           # Firebase init + getAnonymousUid()
│   │   ├── coins.ts              # Coin CRUD, daily bonus, theme purchase
│   │   └── gameRoom.ts           # Room create/join/move/subscribe/rematch
│   ├── utils/
│   │   ├── gameHelpers.ts        # Pure game logic (unchanged)
│   │   └── storage.ts            # AsyncStorage prefs + stats
│   └── ai/
│       └── aiPlayer.ts           # AI strategy (unchanged)
│
├── index.html                    # Standalone web version (no install needed)
├── app.json                      # Expo config
├── eas.json                      # EAS Build config
├── babel.config.js
├── tsconfig.json
└── package.json
```

---

## Firebase Setup

The app uses Firebase project `dotsboxes-d05ea`.

**Firestore collections:**

| Collection | Purpose |
|---|---|
| `rooms/{roomCode}` | Online game rooms — board state, moves, scores |
| `users/{uid}` | User profile, coin balance, purchased themes |
| `coinTransactions/{id}` | Coin audit log |

**Auth:** Anonymous only — no login required.
**SDK:** Firebase v10 web SDK (not `@react-native-firebase`).

To use your own Firebase project, update `src/services/firebase.ts` with your config object from the Firebase Console.

---

## Game Rules

1. Players take turns drawing a line between two adjacent dots
2. If your line **completes all 4 sides of a box**, you claim it and **take another turn**
3. The turn passes to the opponent if no box is completed
4. The game ends when all lines are drawn
5. The player with the **most boxes wins**

---

## AI Strategy (3-tier)

1. **Win move** — immediately take any line that completes a box
2. **Safe move** — avoid lines that give the opponent a 3-sided box
3. **Sacrifice** — if forced, choose the move that gives the opponent the fewest boxes

Difficulty levels:
- **Easy** — mostly random moves
- **Medium** — win + safe logic
- **Hard** — full minimax / sacrifice analysis

---

## Build for Production

### EAS Build (iOS + Android)

```bash
npm install -g eas-cli
eas login
eas build --platform android
eas build --platform ios   # requires Apple Developer account
```

### Web (static export)

```bash
npx expo export --platform web
# Output in dist/ — deploy to Netlify, Vercel, etc.
```

---

## License

MIT — free to use, modify, and distribute.
