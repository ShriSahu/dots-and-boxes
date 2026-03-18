# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start Expo dev server (scan QR with Expo Go app)
npm start

# Run on specific platform
npm run android   # Android emulator
npm run ios       # iOS simulator
npm run web       # Web via metro

# Production builds (requires EAS CLI + Expo account)
eas build --platform android
eas build --platform ios
```

There are no lint or test scripts defined. TypeScript errors surface via the Expo dev server and IDE diagnostics.

## Architecture

This repo contains **two independent games**:

1. **`index.html`** — Standalone web PWA. Self-contained single file (HTML/CSS/JS inline). No build step, no dependencies. Open directly in a browser.

2. **Mobile app (Expo / React Native)** — The primary codebase. Uses Expo Router (file-based routing), Firebase for online multiplayer, and AsyncStorage for local state.

### Mobile app data flow

```
app/_layout.tsx       — ThemeProvider wraps everything; loads fonts
app/index.tsx         — Home: mode/grid/name/timer settings, stats, coin display
app/game.tsx          — Local game (2-player or AI); uses useGameEngine
app/lobby.tsx         — Create or join online room; navigates to online-game
app/online-game.tsx   — Multiplayer game; uses useOnlineGame (same interface as useGameEngine)
app/shop.tsx          — Theme shop; reads/writes coins via src/services/coins.ts
```

**Key design constraint:** `useOnlineGame` (`src/hooks/useOnlineGame.ts`) returns the exact same shape as `useGameEngine` (`src/hooks/useGameEngine.ts`). This means `GameBoard` and `ScoreBar` components work unchanged for both local and online modes.

### State layers

| Layer | Mechanism | Used for |
|-------|-----------|---------|
| Local prefs & stats | AsyncStorage (`src/utils/storage.ts`) | Names, grid size, timer, win/loss counts |
| Theme | AsyncStorage + Firestore `users/{uid}.activeTheme` | Active theme, purchased themes |
| Coins | Firestore `users/{uid}` + `coinTransactions/{id}` | Balance, spend, earn |
| Online game | Firestore `rooms/{roomCode}` | Real-time moves, scores |

### Firebase

- **Project:** `dotsboxes-d05ea`
- **Auth:** Anonymous only via `getAnonymousUid()` in `src/services/firebase.ts`
- **SDK:** Firebase v10 web SDK (NOT `@react-native-firebase`) — works in Expo Go without native builds
- `getReactNativePersistence` is loaded via `require('firebase/auth')` (not `import`) to avoid a TS resolution error at compile time

### TypeScript notes

- `moduleResolution: "node"` — do NOT change to `bundler` or `node16`; Expo's base config uses node and Firebase types depend on it
- `noImplicitAny: false` — required because Firebase v10 types don't resolve cleanly under node moduleResolution
- `src/types/firebase-shim.d.ts` — manually re-declares `firebase/*` modules so TS can find them
- Path alias `@/*` → `src/*` is configured in `tsconfig.json` and `babel.config.js`

### AI opponent

`src/ai/aiPlayer.ts` implements 3-tier strategy (easy/medium/hard). Easy picks random moves, medium uses basic heuristics, hard uses chain-avoidance logic. Pure function — no side effects.

### Coin rewards

Win online: +25 | Win vs AI: +10 | Draw: +3 | Participation: +1 | Daily bonus: +5
