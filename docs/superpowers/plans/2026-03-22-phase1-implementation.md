# Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five features to the Dots & Boxes mobile app: interactive tutorial, online turn timer (15s), touch-snap precision input, share-result button, and quick-match matchmaking.

**Architecture:** Features are implemented in dependency order — types first, then services, then hooks, then UI components. GameBoard.tsx is the most invasive change (PanResponder rewrite); it is done before Tutorial which depends on it. Quick Match adds a new Firestore collection and bypasses the existing lobby entirely.

**Tech Stack:** React Native / Expo Go, Firebase v10 (web SDK), react-native-svg, AsyncStorage, Firestore Transactions.

**Spec:** `docs/superpowers/specs/2026-03-22-phase1-design.md`

---

## File Map

| File | Status | What changes |
|------|--------|-------------|
| `src/types/game.types.ts` | Modify | Add `turnStartedAt`, extend `lastMove` with `'skip'` type, add `MatchmakingDoc` |
| `src/utils/storage.ts` | Modify | Add `getTutorialSeen()` / `setTutorialSeen()` |
| `app/game.tsx` | Modify | Add Share Result button to game-over overlay |
| `app/online-game.tsx` | Modify | Add Share Result button; wire `timerMax` / `timerRemaining` / `onAutoSkip` |
| `src/services/gameRoom.ts` | Modify | `applyMove` writes `turnStartedAt`; add `skipTurn()` and `buildInitialRoomDoc()` |
| `src/hooks/useOnlineGame.ts` | Modify | Timer effect, `onAutoSkip` event, real `timerRemaining` return value |
| `src/components/GameBoard.tsx` | Modify | Remove Rect tap targets; add PanResponder on View wrapper with `measure()`; ghost preview Line; `allowedLines` prop |
| `src/components/TutorialOverlay.tsx` | **Create** | Self-contained tutorial with 3 steps, owns its GameBoard |
| `src/services/matchmaking.ts` | **Create** | `joinQueue`, `cancelQueue`, `subscribeToMatch`, `attemptMatch`, `generateRoomCode` (4-letter), `buildInitialRoomDoc` |
| `app/index.tsx` | Modify | Tutorial trigger + `?` button; Quick Match / Room Code buttons + matchmaking state machine |
| `firestore.rules` | Modify | Add `matchmaking` collection rules |

---

## Task 1: Types Foundation

**Files:**
- Modify: `src/types/game.types.ts`

- [ ] **Step 1: Add `turnStartedAt` to `OnlineRoom`, extend `lastMove` type, add `MatchmakingDoc`**

Replace the `OnlineRoom` interface and add `MatchmakingDoc` in `src/types/game.types.ts`:

```ts
// In OnlineRoom — change lastMove type:
lastMove: { type: 'h' | 'v' | 'skip'; row: number; col: number; uid: string } | null;
// Add after existing OnlineRoom fields:
turnStartedAt: number | null;  // Unix ms; null before first move
```

Full updated `OnlineRoom` interface (replace lines 64–81):
```ts
export interface OnlineRoom {
  roomCode:          string;
  status:            RoomStatus;
  gridSize:          GridSize;
  timerSeconds:      TimerOption;
  host:  { uid: string;        name: string;        score: number };
  guest: { uid: string | null; name: string | null; score: number };
  currentPlayerUid:  string;
  moveCount:         number;
  hLines:  boolean[];
  vLines:  boolean[];
  boxes:   number[];
  lastMove: { type: 'h' | 'v' | 'skip'; row: number; col: number; uid: string } | null;
  createdAt:          any;
  updatedAt:          any;
  rematchRequestedBy: string | null;
  rematchRoomCode:    string | null;
  turnStartedAt:      number | null;
}
```

Add `MatchmakingDoc` at end of file (before last line):
```ts
export interface MatchmakingDoc {
  uid:             string;
  name:            string;
  gridSize:        GridSize;
  joinedAt:        any;   // Firestore Timestamp
  status:          'waiting' | 'matched' | 'cancelled' | 'timeout';
  roomCode:        string | null;
  matchedGridSize: GridSize | null;
  hostUid:         string | null;  // set by transaction; both clients read this to derive isHost
}
```

- [ ] **Step 2: Verify TypeScript accepts the change**

Open `src/types/game.types.ts` in the IDE and confirm zero red underlines.
Then run `npx expo start --no-dev` and confirm the bundler starts without type errors.
Stop the server (Ctrl+C).

- [ ] **Step 3: Commit**

```bash
cd C:/Shri_Development/dots-and-boxes
git add src/types/game.types.ts
git commit -m "feat(types): add turnStartedAt, skip lastMove type, MatchmakingDoc"
```

---

## Task 2: Storage Helpers

**Files:**
- Modify: `src/utils/storage.ts`

- [ ] **Step 1: Add tutorial key and helpers**

Add to `src/utils/storage.ts` after the `KEYS` object:

```ts
const TUTORIAL_KEY = 'db_tutorial_seen';

export async function getTutorialSeen(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(TUTORIAL_KEY);
    return v === 'true';
  } catch (_) {
    return true; // on failure, skip tutorial to avoid blocking app
  }
}

export async function setTutorialSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(TUTORIAL_KEY, 'true');
  } catch (_) {}
}
```

- [ ] **Step 2: Verify TypeScript**

Confirm no type errors in IDE.

- [ ] **Step 3: Commit**

```bash
git add src/utils/storage.ts
git commit -m "feat(storage): add getTutorialSeen / setTutorialSeen helpers"
```

---

## Task 3: Share Result Button

**Files:**
- Modify: `app/game.tsx`
- Modify: `app/online-game.tsx`

- [ ] **Step 1: Add Share button to `app/game.tsx`**

At the top of `app/game.tsx`, add `Share` to the react-native import:
```ts
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Pressable, useWindowDimensions, Share,
} from 'react-native';
```

Add the `handleShare` function after the `handleNewGame` function (find it around line 118):
```ts
const handleShare = useCallback(() => {
  if (!result) return;
  const trunc = (s: string) => s.length > 12 ? s.slice(0, 12) + '…' : s;
  const p1 = trunc(result.p1Name);
  const p2 = trunc(result.p2Name);
  let message: string;
  if (result.winner === 'draw') {
    message = `${p1} and ${p2} tied ${result.scores.p1}–${result.scores.p2} in Dots & Boxes! 🤝`;
  } else {
    const winner = result.winner === 'p1' ? p1 : p2;
    const loser  = result.winner === 'p1' ? p2 : p1;
    const ws = result.winner === 'p1' ? result.scores.p1 : result.scores.p2;
    const ls = result.winner === 'p1' ? result.scores.p2 : result.scores.p1;
    message = `${winner} beat ${loser} ${ws}–${ls} in Dots & Boxes! 🎉`;
  }
  Share.share({ message });
}, [result]);
```

In the game-over overlay JSX, add the Share button between the coin row and the action buttons. Find the `<View style={styles.resultBtns}>` element and insert before it:

```tsx
<TouchableOpacity
  style={styles.resultBtnSecondary}
  onPress={handleShare}
>
  <Text style={styles.resultBtnSecondaryText}>Share Result</Text>
</TouchableOpacity>
```

- [ ] **Step 2: Add Share button to `app/online-game.tsx`**

`Share` is already in react-native. Add `handleShare` after the existing handlers (around line 160):
```ts
const handleShare = useCallback(() => {
  if (!result) return;
  const trunc = (s: string) => s.length > 12 ? s.slice(0, 12) + '…' : s;
  const p1 = trunc(result.p1Name);
  const p2 = trunc(result.p2Name);
  let message: string;
  if (result.winner === 'draw') {
    message = `${p1} and ${p2} tied ${result.scores.p1}–${result.scores.p2} in Dots & Boxes! 🤝`;
  } else {
    const winner = result.winner === 'p1' ? p1 : p2;
    const loser  = result.winner === 'p1' ? p2 : p1;
    const ws = result.winner === 'p1' ? result.scores.p1 : result.scores.p2;
    const ls = result.winner === 'p1' ? result.scores.p2 : result.scores.p1;
    message = `${winner} beat ${loser} ${ws}–${ls} in Dots & Boxes! 🎉`;
  }
  Share.share({ message });
}, [result]);
```

Add `Share` to the react-native imports at the top of `online-game.tsx`:
```ts
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Pressable, ActivityIndicator,
  useWindowDimensions, Share,
} from 'react-native';
```

In the game-over overlay JSX (around line 399), locate `<View style={styles.resultBtns}>` and insert the Share button before it:
```tsx
<TouchableOpacity
  style={[styles.resultBtnSecondary, { borderColor: theme.border }]}
  onPress={handleShare}
>
  <Text style={[styles.resultBtnSecondaryText, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>
    Share Result
  </Text>
</TouchableOpacity>
```

- [ ] **Step 3: Manual verification**

Run `npm start`, scan QR code. Play a local game to completion. Confirm:
- "Share Result" button appears in the game-over overlay
- Tapping it opens the native share sheet with the correct message
- Win/draw/loss messages are correct

- [ ] **Step 4: Commit**

```bash
git add app/game.tsx app/online-game.tsx
git commit -m "feat(share): add Share Result button to game-over overlay"
```

---

## Task 4: Online Timer — Service Layer

**Files:**
- Modify: `src/services/gameRoom.ts`

- [ ] **Step 1: Update `applyMove` to write `turnStartedAt`**

In `src/services/gameRoom.ts`, locate `applyMove`'s `tx.update` call (around line 153) and add `turnStartedAt: serverTimestamp()`:

```ts
tx.update(ref, {
  hLines: newHLines,
  vLines: newVLines,
  boxes: newBoxes,
  currentPlayerUid: nextPlayerUid,
  moveCount: data.moveCount + 1,
  lastMove: { ...move, uid: myUid },
  'host.score': hostScore,
  'guest.score': guestScore,
  status: isGameOver ? 'finished' : 'active',
  updatedAt: serverTimestamp(),
  turnStartedAt: serverTimestamp(),   // ADD THIS LINE
});
```

Also add `increment` to the Firebase imports at the top:
```ts
import {
  doc, setDoc, getDoc, updateDoc, onSnapshot,
  runTransaction, serverTimestamp, increment,
} from 'firebase/firestore';
```

- [ ] **Step 2: Add `skipTurn` function**

Add after `applyMove` in `src/services/gameRoom.ts`:

```ts
export async function skipTurn(
  roomCode: string,
  myUid: string,
): Promise<void> {
  const ref = doc(db, 'rooms', roomCode.toUpperCase());

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found');
    const data = snap.data() as OnlineRoom;
    if (data.currentPlayerUid !== myUid) throw new Error('Not your turn');
    if (data.status !== 'active') throw new Error('Game not active');

    const nextUid = myUid === data.host.uid ? data.guest.uid! : data.host.uid;

    tx.update(ref, {
      currentPlayerUid: nextUid,
      moveCount: increment(1),
      lastMove: { type: 'skip', row: -1, col: -1, uid: myUid },
      updatedAt: serverTimestamp(),
      turnStartedAt: serverTimestamp(),
    });
  });
}
```

- [ ] **Step 3: Add `buildInitialRoomDoc` pure function**

Add after `skipTurn` in `src/services/gameRoom.ts`:

```ts
/** Pure function — no Firestore reads. Used by matchmaking transaction. */
export function buildInitialRoomDoc(
  hostUid: string,
  hostName: string,
  guestUid: string,
  guestName: string,
  gridSize: GridSize,
) {
  const board = emptyBoard(gridSize);
  return {
    status: 'active' as const,
    gridSize,
    timerSeconds: 15 as TimerOption,
    host:  { uid: hostUid,  name: hostName,  score: 0 },
    guest: { uid: guestUid, name: guestName, score: 0 },
    currentPlayerUid: hostUid,
    moveCount: 0,
    ...board,
    lastMove: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    rematchRequestedBy: null,
    rematchRoomCode: null,
    turnStartedAt: null,
  };
}
```

Also update the import line in `gameRoom.ts` to include `TimerOption`:
The existing import already has `TimerOption` — verify it's there.

- [ ] **Step 4: Verify TypeScript**

Confirm no type errors in IDE. The `type: 'skip'` in `skipTurn` must now be accepted since Task 1 extended the `lastMove` type.

- [ ] **Step 5: Commit**

```bash
git add src/services/gameRoom.ts
git commit -m "feat(gameRoom): add turnStartedAt to applyMove, add skipTurn, buildInitialRoomDoc"
```

---

## Task 5: Online Timer — Hook

**Files:**
- Modify: `src/hooks/useOnlineGame.ts`

- [ ] **Step 1: Add `onAutoSkip` to `OnlineGameEvents`**

In `useOnlineGame.ts`, update the `OnlineGameEvents` interface (lines 10–15):
```ts
export interface OnlineGameEvents {
  onBoxClaimed?: (count: number, player: Player, boxKeys: string[], line: LineId) => void;
  onTurnSwitch?: () => void;
  onGameOver?: () => void;
  onOpponentDisconnected?: () => void;
  onAutoSkip?: (playerName: string) => void;   // ADD THIS
}
```

- [ ] **Step 2: Add `timerRemaining` state and timer effect**

Add new imports at the top:
```ts
import { skipTurn } from '../services/gameRoom';
```

Inside the `useOnlineGame` function, after the existing `useState` declarations (around line 28), add:
```ts
const [timerRemaining, setTimerRemaining] = useState(0);
const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

After the `eventsRef` declaration block, add the timer effect:
```ts
// ── Online turn timer ────────────────────────────────────────────────────
useEffect(() => {
  if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  if (!room?.turnStartedAt || room.status !== 'active') {
    setTimerRemaining(0);
    return;
  }

  const timerMax = room.timerSeconds || 15;

  const tick = () => {
    const elapsed = Math.floor((Date.now() - room.turnStartedAt!) / 1000);
    const remaining = Math.max(0, timerMax - elapsed);
    setTimerRemaining(remaining);

    if (remaining === 0 && room.currentPlayerUid === myUid) {
      // It's my turn and time is up — submit skip
      const myPlayer: Player = isHost ? 1 : 2;
      const myPlayerName = isHost ? room.host.name : (room.guest.name ?? '');
      skipTurn(roomCode, myUid).catch(() => {});
      eventsRef.current.onAutoSkip?.(myPlayerName);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  tick(); // run immediately
  timerIntervalRef.current = setInterval(tick, 1000);

  return () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  };
}, [room?.moveCount, room?.status]); // reset on every move
```

- [ ] **Step 3: Add skip guard to Firestore subscriber**

In the `subscribeToRoom` callback (around line 59), the existing code:
```ts
if (r.lastMove) {
  const lm = r.lastMove;
  if (lm.type === 'h') lineOwnersRef.current.hLineOwners[lm.row][lm.col] = player;
  else                  lineOwnersRef.current.vLineOwners[lm.row][lm.col] = player;
```

Must be updated to guard against `type: 'skip'`:
```ts
if (r.lastMove) {
  const lm = r.lastMove;
  if (lm.type !== 'skip') {
    // Only update line owners for real moves (not skips)
    if (lm.type === 'h') lineOwnersRef.current.hLineOwners[lm.row][lm.col] = player;
    else                  lineOwnersRef.current.vLineOwners[lm.row][lm.col] = player;
  }
  if (lm.type !== 'skip') {
    const line: LineId = { type: lm.type as 'h' | 'v', row: lm.row, col: lm.col };
    setLastLine(line);
    setTimeout(() => setLastLine(null), 260);
  }
```

Also update the part that calls `setLastLine` — it must only run for non-skip moves. The existing code after the lineOwner block:
```ts
const line: LineId = { type: lm.type, row: lm.row, col: lm.col };
setLastLine(line);
setTimeout(() => setLastLine(null), 260);
```
This reference to `lm.type` must be cast since it can now be `'skip'`:
```ts
const line: LineId = { type: lm.type as 'h' | 'v', row: lm.row, col: lm.col };
```
But wrapping in the `if (lm.type !== 'skip')` block avoids the need for a cast entirely.

- [ ] **Step 4: Return real `timerRemaining`**

In the `return` statement of `useOnlineGame` (around line 173), change:
```ts
timerRemaining: 0,
```
to:
```ts
timerRemaining,
```

- [ ] **Step 5: Cleanup timer on unmount**

Add a cleanup effect at the end of the hook body before the return:
```ts
useEffect(() => {
  return () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  };
}, []);
```

- [ ] **Step 6: Verify TypeScript**

Confirm no type errors. The `lm.type as 'h' | 'v'` cast inside the skip guard may be needed in one place.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useOnlineGame.ts
git commit -m "feat(useOnlineGame): add 15s turn timer, onAutoSkip, skip guard in subscriber"
```

---

## Task 6: Online Timer — Screen Wiring

**Files:**
- Modify: `app/online-game.tsx`

- [ ] **Step 1: Wire `timerMax` and `timerRemaining` to ScoreBar**

In `app/online-game.tsx`, find the `ScoreBar` usage (around line 310). It currently has:
```tsx
timerRemaining={0}
timerMax={0}
```

Change to:
```tsx
timerRemaining={timerRemaining}
timerMax={room?.timerSeconds ?? 15}
```

The `timerRemaining` value comes from `useOnlineGame` (now returning the real value).

- [ ] **Step 2: Add `onAutoSkip` handler**

In the `useOnlineGame` call (around line 69), add `onAutoSkip` to the events object:
```ts
const { room, state, isMyTurn, isSubmitting, opponentName, myName, lastLine, timerRemaining, drawLine, abandon, requestRematch } =
  useOnlineGame(roomCode, myUid, isHost, gridSize, {
    onBoxClaimed: ...,
    onTurnSwitch: ...,
    onGameOver: ...,
    onOpponentDisconnected: ...,
    onAutoSkip: (playerName) => {
      showToast(`Time's up — ${playerName} skipped`, theme.textMuted);
    },
  });
```

Note: destructure `timerRemaining` from the hook return.

- [ ] **Step 3: Manual verification**

Run `npm start`. Start an online game between two devices (or use lobby with two tabs).
- Confirm ScoreBar shows a countdown from 15 in online games
- Wait for timer to hit 0 — confirm the toast "Time's up — [name] skipped" appears and turn changes
- Confirm timer resets when a move is made

- [ ] **Step 4: Commit**

```bash
git add app/online-game.tsx
git commit -m "feat(online-game): wire timerMax/timerRemaining to ScoreBar, add onAutoSkip toast"
```

---

## Task 7: Touch Snapping — GameBoard Rewrite

**Files:**
- Modify: `src/components/GameBoard.tsx`

This is the most invasive task. Read the full current file carefully before editing.

- [ ] **Step 1: Update imports and Props interface**

At the top of `GameBoard.tsx`, update imports:

```ts
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, PanResponder, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText, G } from 'react-native-svg';
import { GameState, GameConfig, LineId, Player } from '../types/game.types';
import { useTheme } from '../hooks/useTheme';
```

Update the `Props` interface to add `allowedLines`:
```ts
interface Props {
  state: GameState;
  config: GameConfig;
  onLineTap: (line: LineId) => void;
  disabled?: boolean;
  lastLine?: LineId | null;
  newBoxes?: string[];
  boardKey?: number;
  allowedLines?: Set<string>;   // ADD: tutorial restriction (key format: "h-row-col")
}
```

Update the function signature:
```ts
export default function GameBoard({
  state, config, onLineTap, disabled, lastLine, newBoxes = [], boardKey, allowedLines,
}: Props) {
```

- [ ] **Step 2: Remove `handlePressIn` and tap target `Rect` sections**

Delete the entire `handlePressIn` function (lines 67–74):
```ts
// DELETE THIS BLOCK:
const handlePressIn = (line: LineId) => { ... };
```

Delete the two `{/* ── Tap targets ── */}` blocks (lines 176–210), both horizontal and vertical.

- [ ] **Step 3: Add `boardViewRef`, `boardOrigin`, `previewLine` state**

After the existing `useEffect` hooks (after the `flashBoxes` effect), add:
```ts
// ── PanResponder snap-to-line input ──────────────────────────────────────
const boardViewRef = useRef<View>(null);
const boardOrigin  = useRef({ x: 0, y: 0 });
const [previewLine, setPreviewLine] = useState<LineId | null>(null);
```

- [ ] **Step 4: Add `findNearestLine` helper inside the component**

Add after `boardOrigin` and `previewLine`:
```ts
const findNearestLine = useCallback((localX: number, localY: number): LineId | null => {
  const threshold = cellSize * 0.45;
  let best: LineId | null = null;
  let bestDist = Infinity;

  const checkLine = (type: 'h' | 'v', row: number, col: number, mx: number, my: number) => {
    const drawn = type === 'h' ? state.hLines[row][col] : state.vLines[row][col];
    if (drawn) return;
    const dx = localX - mx;
    const dy = localY - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < threshold && dist < bestDist) {
      bestDist = dist;
      best = { type, row, col };
    }
  };

  // Horizontal line midpoints
  for (let r = 0; r < g; r++) {
    for (let c = 0; c < cells; c++) {
      const a = dotPos(r, c);
      const b = dotPos(r, c + 1);
      checkLine('h', r, c, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  }
  // Vertical line midpoints
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < g; c++) {
      const a = dotPos(r, c);
      const b = dotPos(r + 1, c);
      checkLine('v', r, c, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  }
  return best;
}, [state.hLines, state.vLines, cellSize, g, cells, padding]);
```

Note: `dotPos`, `g`, `cells`, `padding` are already in the component scope.

- [ ] **Step 5: Add refs and `PanResponder`**

`PanResponder.create` is called inside `useRef` (created once). Closure values go stale —
use refs for all mutable values the PanResponder handlers need.

Add these refs after `findNearestLine` (before the PanResponder):
```ts
const disabledRef    = useRef(disabled ?? false);
const allowedRef     = useRef(allowedLines);
const onLineTapRef   = useRef(onLineTap);
const previewLineRef = useRef<LineId | null>(null);
const findNearestRef = useRef(findNearestLine);

// Keep refs current on every render
useEffect(() => { disabledRef.current    = disabled ?? false; }, [disabled]);
useEffect(() => { allowedRef.current     = allowedLines; }, [allowedLines]);
useEffect(() => { onLineTapRef.current   = onLineTap; }, [onLineTap]);
useEffect(() => { findNearestRef.current = findNearestLine; }, [findNearestLine]);
```

Then add the PanResponder:
```ts
const panResponder = useRef(
  PanResponder.create({
    onStartShouldSetPanResponder: () => !disabledRef.current,
    onMoveShouldSetPanResponder:  () => !disabledRef.current,

    onPanResponderGrant: (_, gestureState) => {
      if (disabledRef.current) return;
      const localX = gestureState.x0 - boardOrigin.current.x;
      const localY = gestureState.y0 - boardOrigin.current.y;
      const nearest = findNearestRef.current(localX, localY);
      if (nearest) {
        const key = `${nearest.type}-${nearest.row}-${nearest.col}`;
        if (!allowedRef.current || allowedRef.current.has(key)) {
          previewLineRef.current = nearest;
          setPreviewLine(nearest);
        }
      }
    },

    onPanResponderMove: (_, gestureState) => {
      if (disabledRef.current) return;
      const localX = gestureState.moveX - boardOrigin.current.x;
      const localY = gestureState.moveY - boardOrigin.current.y;
      const nearest = findNearestRef.current(localX, localY);
      if (nearest) {
        const key = `${nearest.type}-${nearest.row}-${nearest.col}`;
        if (!allowedRef.current || allowedRef.current.has(key)) {
          previewLineRef.current = nearest;
          setPreviewLine(nearest);
          return;
        }
      }
      previewLineRef.current = null;
      setPreviewLine(null);
    },

    onPanResponderRelease: () => {
      const line = previewLineRef.current;
      if (line && !disabledRef.current) {
        onLineTapRef.current(line);
      }
      previewLineRef.current = null;
      setPreviewLine(null);
    },

    onPanResponderTerminate: () => {
      previewLineRef.current = null;
      setPreviewLine(null);
    },
  })
).current;
```

- [ ] **Step 6: Update the JSX — wrap Svg in View with panHandlers and onLayout**

Replace the existing return:
```tsx
return (
  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={svgSize} height={svgSize}>
```

With:
```tsx
return (
  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    <View
      ref={boardViewRef}
      {...panResponder.panHandlers}
      onLayout={() => {
        boardViewRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
          boardOrigin.current = { x: pageX, y: pageY };
        });
      }}
    >
    <Svg width={svgSize} height={svgSize}>
```

And close the extra `View` before the final closing `</View>`:
```tsx
    </Svg>
    </View>   {/* closes the panResponder View */}
  </View>
);
```

- [ ] **Step 7: Add ghost preview Line SVG element**

After the drawn vertical lines block and before the dots block, add:
```tsx
{/* ── Ghost preview line ── */}
{previewLine && (() => {
  const pl = previewLine;
  const isH = pl.type === 'h';
  const a = dotPos(pl.row, pl.col);
  const b = isH ? dotPos(pl.row, pl.col + 1) : dotPos(pl.row + 1, pl.col);
  const currentColor = state.currentPlayer === 1 ? theme.p1 : theme.p2;
  return (
    <Line
      key="preview"
      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
      stroke={currentColor}
      strokeWidth={lineW}
      strokeLinecap="round"
      opacity={0.4}
    />
  );
})()}
```

- [ ] **Step 8: Verify TypeScript**

Confirm no type errors. Check that `Rect` import is still used (for box fills — yes it is, the Rect for box backgrounds stays). Only the tap-target Rects were removed.

- [ ] **Step 9: Manual verification**

Run `npm start`. Test on a device or simulator:
- Touch and hold near a line — ghost preview appears in active player's color at 40% opacity
- Lift finger — line is drawn
- Touch in empty space away from any line — no ghost, no line drawn
- Test on a 6×6 grid — snapping works on dense grid
- `disabled` board (online game, opponent's turn) — no ghost, no commit

- [ ] **Step 10: Commit**

```bash
git add src/components/GameBoard.tsx
git commit -m "feat(GameBoard): replace onPressIn with PanResponder snap-to-line + ghost preview"
```

---

## Task 8: Tutorial Overlay Component

**Files:**
- Create: `src/components/TutorialOverlay.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/TutorialOverlay.tsx`:

```tsx
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Pressable,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import GameBoard from './GameBoard';
import { setTutorialSeen } from '../utils/storage';
import type { GameState, LineId, GameConfig } from '../types/game.types';

// ── Hardcoded tutorial board states ──────────────────────────────────────────

function emptyState(): GameState {
  const g = 3; const cells = g - 1;
  return {
    hLines:      Array.from({ length: g },     () => Array(cells).fill(false)),
    vLines:      Array.from({ length: cells }, () => Array(g).fill(false)),
    hLineOwners: Array.from({ length: g },     () => Array(cells).fill(0)),
    vLineOwners: Array.from({ length: cells }, () => Array(g).fill(0)),
    boxes:       Array.from({ length: cells }, () => Array(cells).fill(0)),
    currentPlayer: 1,
    scores: { p1: 0, p2: 0 },
    isGameOver: false,
    history: [],
  };
}

// Step 1: empty board — any line is valid
const STEP1_STATE: GameState = emptyState();
const STEP1_ALLOWED: Set<string> | undefined = undefined; // all lines allowed

// Step 2: top-left box has top, left, bottom drawn — only right side ("h-0-1") missing
function step2State(): GameState {
  const s = emptyState();
  s.hLines[0][0] = true;  // top of box
  s.hLines[1][0] = true;  // bottom of box
  s.vLines[0][0] = true;  // left of box
  s.hLineOwners[0][0] = 1;
  s.hLineOwners[1][0] = 1;
  s.vLineOwners[0][0] = 1;
  return s;
}
const STEP2_STATE: GameState = step2State();
// The only allowed tap is the right vertical side of the top-left box: v-0-1
const STEP2_ALLOWED = new Set<string>(['v-0-1']);

// Step 3: a 2-box chain is almost complete — just for illustration, no tap needed
function step3State(): GameState {
  const s = emptyState();
  // Fill a chain: top-left box has top, left, right drawn; middle box has top, right drawn
  s.hLines[0][0] = true; s.hLineOwners[0][0] = 2;
  s.vLines[0][0] = true; s.vLineOwners[0][0] = 2;
  s.vLines[0][1] = true; s.vLineOwners[0][1] = 2;
  s.hLines[0][1] = true; s.hLineOwners[0][1] = 2;
  s.vLines[0][2] = true; s.vLineOwners[0][2] = 2; // right edge
  return s;
}
const STEP3_STATE: GameState = step3State();

// Fake config for the tutorial board
const TUTORIAL_CONFIG: GameConfig = {
  gridSize: 3,
  mode: '2player',
  p1Name: 'You',
  p2Name: 'Opp',
  difficulty: 'medium',
  timerSeconds: 0,
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onDone: () => void;
  replayMode?: boolean;
}

const STEPS = [
  {
    title: 'Draw a line',
    body: 'Tap any edge between two dots to draw a line.',
    state: STEP1_STATE,
    allowed: STEP1_ALLOWED,
    needsTap: true,
  },
  {
    title: 'Claim a box',
    body: 'Complete the box by drawing the last side — and earn another turn!',
    state: STEP2_STATE,
    allowed: STEP2_ALLOWED,
    needsTap: true,
  },
  {
    title: 'Watch for chains',
    body: "Careful — if you close a chain, your opponent claims all the boxes in it. Avoid giving away long chains!",
    state: STEP3_STATE,
    allowed: new Set<string>(), // no taps allowed in step 3
    needsTap: false,
  },
];

export default function TutorialOverlay({ onDone, replayMode = false }: Props) {
  const { theme } = useTheme();
  const [step, setStep] = useState(0);
  const s = makeStyles(theme);

  const current = STEPS[step];

  // IMPORTANT: handleDone must be declared BEFORE handleLineTap and handleGotIt
  // to avoid a temporal dead zone reference error.
  const handleDone = useCallback(async () => {
    await setTutorialSeen();
    onDone();
  }, [onDone]);

  const handleLineTap = useCallback((_line: LineId) => {
    if (current.needsTap) {
      if (step < STEPS.length - 1) {
        setStep(step + 1);
      } else {
        handleDone();
      }
    }
  }, [step, current, handleDone]);

  const handleGotIt = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleDone();
    }
  }, [step, handleDone]);

  return (
    <View style={s.overlay}>
      <View style={[s.card, { backgroundColor: theme.bg, borderColor: theme.border }]}>

        {/* Close button in replay mode */}
        {replayMode && (
          <TouchableOpacity style={s.closeBtn} onPress={onDone}>
            <Text style={[s.closeText, { color: theme.textMuted }]}>✕</Text>
          </TouchableOpacity>
        )}

        {/* Step indicator */}
        <View style={s.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[s.dot, { backgroundColor: i === step ? theme.p1 : theme.border }]}
            />
          ))}
        </View>

        <Text style={[s.title, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
          {current.title}
        </Text>
        <Text style={[s.body, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
          {current.body}
        </Text>

        <View style={s.boardWrap}>
          <GameBoard
            state={current.state}
            config={TUTORIAL_CONFIG}
            onLineTap={handleLineTap}
            disabled={!current.needsTap}
            allowedLines={current.allowed}
          />
        </View>

        {!current.needsTap && (
          <TouchableOpacity
            style={[s.btn, { backgroundColor: theme.text }]}
            onPress={handleGotIt}
          >
            <Text style={[s.btnText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
              {step === STEPS.length - 1 ? "Let's Play! →" : 'Got it →'}
            </Text>
          </TouchableOpacity>
        )}

        {current.needsTap && (
          <Text style={[s.hint, { color: theme.border, fontFamily: theme.fontRegular }]}>
            Tap the board above to continue
          </Text>
        )}
      </View>
    </View>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.72)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    },
    card: {
      width: '88%',
      borderWidth: 2,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      gap: 12,
    },
    closeBtn: {
      position: 'absolute',
      top: 12, right: 16,
    },
    closeText: { fontSize: 20, fontWeight: '600' },
    dots: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
    body: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
    boardWrap: { marginVertical: 8 },
    btn: {
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 32,
      marginTop: 4,
    },
    btnText: { fontSize: 22, fontWeight: '700' },
    hint: { fontSize: 13, marginTop: 4 },
  });
}
```

- [ ] **Step 2: Verify TypeScript**

Confirm no type errors. The `GameBoard` import requires no changes — `allowedLines` is now an accepted prop from Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/components/TutorialOverlay.tsx
git commit -m "feat(tutorial): add TutorialOverlay with 3-step interactive tutorial"
```

---

## Task 9: Tutorial — Home Screen Integration

**Files:**
- Modify: `app/index.tsx`

- [ ] **Step 1: Add imports and tutorial state**

Add to the imports at the top of `app/index.tsx`:
```ts
import { getTutorialSeen } from '../src/utils/storage';
import TutorialOverlay from '../src/components/TutorialOverlay';
```

Inside `HomeScreen`, add new state after existing state declarations:
```ts
const [showTutorial, setShowTutorial] = useState(false);
```

- [ ] **Step 2: Check `tutorialSeen` on mount**

In the existing `useEffect` that loads prefs (around line 38), add the tutorial check:
```ts
useEffect(() => {
  (async () => {
    // ... existing prefs loading code ...

    // Check if tutorial has been seen
    const seen = await getTutorialSeen();
    if (!seen) setShowTutorial(true);
  })();
}, []);
```

- [ ] **Step 3: Add `?` button to topBar**

In the `topBar` View (around line 104), add a `?` button after the Shop button:
```tsx
<TouchableOpacity
  style={[s.shopBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
  onPress={() => setShowTutorial(true)}
>
  <Text style={[s.shopBtnText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
    ?
  </Text>
</TouchableOpacity>
```

- [ ] **Step 4: Render TutorialOverlay as sibling of ScrollView**

The existing JSX structure in `HomeScreen` is:
```tsx
<SafeAreaView style={...}>
  <ScrollView ...>
    ...
  </ScrollView>
</SafeAreaView>
```

Add a `tutorialSeen` state alongside `showTutorial`:
```ts
const [tutorialSeen, setTutorialSeenState] = useState(false);
```

In the `useEffect` that loads prefs, read and store the value:
```ts
const seen = await getTutorialSeen();
setTutorialSeenState(seen);
if (!seen) setShowTutorial(true);
```

Change the `SafeAreaView` structure to:
```tsx
<SafeAreaView style={...}>
  <ScrollView ...>
    ...
  </ScrollView>
  {showTutorial && (
    <TutorialOverlay
      onDone={() => setShowTutorial(false)}
      replayMode={tutorialSeen}
    />
  )}
</SafeAreaView>
```

When the tutorial completes for the first time, `TutorialOverlay.handleDone` calls `setTutorialSeen()` (AsyncStorage) and `onDone()` → `setShowTutorial(false)`. On the next `?` tap, `tutorialSeen` is already `true` → `replayMode={true}` → shows the `✕` close button.

- [ ] **Step 5: Manual verification**

Run `npm start`. First launch (or after clearing AsyncStorage):
- Tutorial overlay appears automatically
- Step 1: tap any line → advances to step 2
- Step 2: tap the highlighted closing line → advances to step 3
- Step 3: "Got it →" button advances and dismisses
- Second launch: tutorial does NOT appear
- Tap `?` button: tutorial appears again with `✕` close button

- [ ] **Step 6: Commit**

```bash
git add app/index.tsx
git commit -m "feat(tutorial): trigger TutorialOverlay on first launch, add ? replay button"
```

---

## Task 10: Quick Match — Service

**Files:**
- Create: `src/services/matchmaking.ts`

- [ ] **Step 1: Create the matchmaking service**

Create `src/services/matchmaking.ts`:

```ts
import {
  doc, setDoc, updateDoc, collection,
  query, where, orderBy, limit,
  onSnapshot, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { buildInitialRoomDoc } from './gameRoom';
import type { GridSize, MatchmakingDoc } from '../types/game.types';

const MATCHMAKING = 'matchmaking';
const ROOMS       = 'rooms';

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** 4-letter uppercase room code (A-Z only, easy to type). */
export function generateMatchCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Queue operations ──────────────────────────────────────────────────────────

export async function joinQueue(
  uid: string,
  name: string,
  gridSize: GridSize,
): Promise<void> {
  await setDoc(doc(db, MATCHMAKING, uid), {
    uid,
    name,
    gridSize,
    joinedAt: serverTimestamp(),
    status: 'waiting',
    roomCode: null,
    matchedGridSize: null,
    hostUid: null,
  } as Omit<MatchmakingDoc, 'joinedAt'> & { joinedAt: any });
}

export async function cancelQueue(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, MATCHMAKING, uid), { status: 'cancelled' });
  } catch (_) {}
}

// ── Subscribe to own matchmaking doc ──────────────────────────────────────────

export function subscribeToMyMatch(
  uid: string,
  onMatched: (roomCode: string, matchedGridSize: GridSize, isHost: boolean) => void,
): () => void {
  return onSnapshot(doc(db, MATCHMAKING, uid), snap => {
    if (!snap.exists()) return;
    const data = snap.data() as MatchmakingDoc;
    if (data.status === 'matched' && data.roomCode && data.matchedGridSize && data.hostUid) {
      // isHost is derived from hostUid written by the transaction — no race condition
      const isHost = data.hostUid === uid;
      onMatched(data.roomCode, data.matchedGridSize, isHost);
    }
  });
}

// ── Subscribe to waiting pool and attempt match ───────────────────────────────

export function subscribeToWaitingPool(
  myUid: string,
  onPartnerFound: (partnerUid: string) => void,
): () => void {
  const q = query(
    collection(db, MATCHMAKING),
    where('status', '==', 'waiting'),
    orderBy('joinedAt', 'asc'),
    limit(2),
  );

  return onSnapshot(q, snapshot => {
    const docs = snapshot.docs.map(d => d.data() as MatchmakingDoc);
    if (docs.length < 2) return;
    // Both slots filled — attempt match
    const uidA = docs[0].uid;
    const uidB = docs[1].uid;
    if (uidA !== myUid && uidB !== myUid) return; // neither is me
    const partnerUid = uidA === myUid ? uidB : uidA;
    onPartnerFound(partnerUid);
  });
}

// ── Matching transaction ───────────────────────────────────────────────────────

export async function attemptMatch(myUid: string, partnerUid: string): Promise<void> {
  // Host = lexicographically smaller uid
  const hostUid   = myUid < partnerUid ? myUid   : partnerUid;
  const guestUid  = myUid < partnerUid ? partnerUid : myUid;

  const myRef      = doc(db, MATCHMAKING, myUid);
  const partnerRef = doc(db, MATCHMAKING, partnerUid);

  try {
    await runTransaction(db, async tx => {
      const mySnap      = await tx.get(myRef);
      const partnerSnap = await tx.get(partnerRef);

      if (!mySnap.exists() || !partnerSnap.exists()) throw new Error('doc missing');

      const myData      = mySnap.data()      as MatchmakingDoc;
      const partnerData = partnerSnap.data() as MatchmakingDoc;

      // Guard: both must still be waiting
      if (myData.status !== 'waiting')      throw new Error('already matched');
      if (partnerData.status !== 'waiting') throw new Error('already matched');

      // Guard: both must have joined recently (< 40s ago)
      const now = Date.now();
      const myJoined      = myData.joinedAt?.toMillis?.() ?? 0;
      const partnerJoined = partnerData.joinedAt?.toMillis?.() ?? 0;
      if (now - myJoined      > 40_000) throw new Error('stale');
      if (now - partnerJoined > 40_000) throw new Error('stale');

      const hostName   = myUid === hostUid   ? myData.name      : partnerData.name;
      const guestName  = myUid === guestUid  ? myData.name      : partnerData.name;
      const resolvedGrid = Math.min(myData.gridSize, partnerData.gridSize) as GridSize;
      const roomCode   = generateMatchCode();

      // Write room doc directly in transaction (no Firestore reads needed)
      const roomDoc = buildInitialRoomDoc(hostUid, hostName, guestUid, guestName, resolvedGrid);
      tx.set(doc(db, ROOMS, roomCode), roomDoc);

      // Update both matchmaking docs — write hostUid so both clients derive isHost reliably
      // (avoids race where partnerUidRef is empty when the match snapshot fires)
      tx.update(myRef,      { status: 'matched', roomCode, matchedGridSize: resolvedGrid, hostUid });
      tx.update(partnerRef, { status: 'matched', roomCode, matchedGridSize: resolvedGrid, hostUid });
    });
  } catch (_) {
    // Transaction failed (already matched, stale, or conflict) — ignore silently
  }
}
```

- [ ] **Step 2: Verify TypeScript**

Confirm no type errors. The `MatchmakingDoc` import comes from Task 1.

- [ ] **Step 3: Commit**

```bash
git add src/services/matchmaking.ts
git commit -m "feat(matchmaking): add matchmaking service with queue, pool listener, and transaction"
```

---

## Task 11: Quick Match — Home Screen Integration

**Files:**
- Modify: `app/index.tsx`

- [ ] **Step 1: Add imports**

Add to imports in `app/index.tsx`:
```ts
import {
  joinQueue, cancelQueue,
  subscribeToMyMatch, subscribeToWaitingPool, attemptMatch,
} from '../src/services/matchmaking';
import type { GridSize } from '../src/types/game.types';
```

- [ ] **Step 2: Add matchmaking state**

Inside `HomeScreen`, add:
```ts
type MatchState = 'idle' | 'waiting' | 'timeout';
const [matchState, setMatchState] = useState<MatchState>('idle');
const matchTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
const unsubPoolRef     = useRef<(() => void) | null>(null);
const unsubMyMatchRef  = useRef<(() => void) | null>(null);
```

- [ ] **Step 3: Add `handleQuickMatch` and `handleCancelMatch`**

Add the handlers:
```ts
const handleQuickMatch = useCallback(async () => {
  if (!uid) return;
  setMatchState('waiting');

  const name = p1Name.trim() || 'Player';

  // Join the queue
  await joinQueue(uid, name, gridSize);

  // Timeout after 30s
  matchTimeoutRef.current = setTimeout(async () => {
    await cancelQueue(uid);
    setMatchState('timeout');
    unsubPoolRef.current?.();
    unsubMyMatchRef.current?.();
  }, 30_000);

  // Listen to waiting pool — attempt match when partner appears
  unsubPoolRef.current = subscribeToWaitingPool(uid, async (partnerUid) => {
    await attemptMatch(uid, partnerUid);
  });

  // Listen to own doc for matched status
  // isHost comes from hostUid written by the transaction — no partnerUidRef race
  unsubMyMatchRef.current = subscribeToMyMatch(uid, (roomCode, matchedGridSize, isHost) => {
    // Clean up
    if (matchTimeoutRef.current) clearTimeout(matchTimeoutRef.current);
    unsubPoolRef.current?.();
    unsubMyMatchRef.current?.();
    setMatchState('idle');
    router.push({
      pathname: '/online-game',
      params: {
        roomCode,
        isHost: isHost ? 'true' : 'false',
        myUid: uid,
        gridSize: String(matchedGridSize),
      },
    });
  });
}, [uid, p1Name, gridSize]);

const handleCancelMatch = useCallback(async () => {
  if (!uid) return;  // guard against empty uid
  if (matchTimeoutRef.current) clearTimeout(matchTimeoutRef.current);
  unsubPoolRef.current?.();
  unsubMyMatchRef.current?.();
  await cancelQueue(uid);
  setMatchState('idle');
}, [uid]);
```

- [ ] **Step 4: Replace online CTA with Quick Match + Room Code buttons**

Find the existing online CTA button in the JSX (around line 324):
```tsx
<TouchableOpacity
  style={[s.startBtn, ...]}
  onPress={startGame}
>
  <Text ...>{mode === 'online' ? 'Go to Lobby →' : 'Start Game →'}</Text>
</TouchableOpacity>
```

Replace with:
```tsx
{mode === 'online' ? (
  <View style={{ width: '100%', gap: 10 }}>
    {matchState === 'waiting' ? (
      <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.p1, alignItems: 'center', gap: 10 }]}>
        <Text style={[s.cardTitle, { color: theme.p1, fontFamily: theme.fontHandwritten }]}>
          Looking for a match…
        </Text>
        <TouchableOpacity
          style={[s.shopBtn, { borderColor: theme.border, paddingHorizontal: 24 }]}
          onPress={handleCancelMatch}
        >
          <Text style={[s.shopBtnText, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    ) : matchState === 'timeout' ? (
      <View style={[s.card, { backgroundColor: theme.bgCard, borderColor: theme.border, alignItems: 'center' }]}>
        <Text style={[{ color: theme.textMuted, fontFamily: theme.fontRegular, textAlign: 'center', fontSize: 14 }]}>
          No players found. Try again or use a room code instead.
        </Text>
      </View>
    ) : null}

    <TouchableOpacity
      style={[s.startBtn, { backgroundColor: theme.text, shadowColor: theme.text }]}
      onPress={handleQuickMatch}
      disabled={matchState === 'waiting'}
      activeOpacity={0.82}
    >
      <Text style={[s.startBtnText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
        Quick Match →
      </Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={[s.startBtn, { backgroundColor: 'transparent', borderWidth: 2, borderColor: theme.border }]}
      onPress={() => router.push('/lobby')}
      activeOpacity={0.82}
    >
      <Text style={[s.startBtnText, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
        Use Room Code
      </Text>
    </TouchableOpacity>
  </View>
) : (
  <TouchableOpacity
    style={[s.startBtn, { backgroundColor: theme.text, shadowColor: theme.text }]}
    onPress={startGame}
    activeOpacity={0.82}
  >
    <Text style={[s.startBtnText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
      Start Game →
    </Text>
  </TouchableOpacity>
)}
```

- [ ] **Step 5: Manual verification**

Run `npm start` on two devices. Both select Online → Quick Match:
- Both show "Looking for a match…" with Cancel button
- Within ~5s both navigate to the same online game
- Timer shows 15s in the online game (from Task 6)

Also verify:
- Cancel button removes player from queue
- 30s timeout shows "No players found" message
- "Use Room Code" still routes to lobby

- [ ] **Step 6: Commit**

```bash
git add app/index.tsx
git commit -m "feat(index): add Quick Match button with matchmaking state machine"
```

---

## Task 12: Firestore Security Rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add matchmaking rules**

Open `firestore.rules`. Add the `matchmaking` collection rules. The file likely has a `rooms` block already. Add after it:

```
match /matchmaking/{uid} {
  // Any authenticated user can read all docs (needed to find a waiting partner)
  allow read: if request.auth != null;
  // Only the document owner can create or update their own doc
  allow create, update: if request.auth != null && request.auth.uid == uid;
  // No deletes (audit trail)
  allow delete: if false;
}
```

- [ ] **Step 2: Deploy rules**

If you have Firebase CLI installed:
```bash
firebase deploy --only firestore:rules
```

If not installed locally, update rules via the Firebase Console:
- Go to https://console.firebase.google.com → Project: dotsboxes-d05ea → Firestore → Rules
- Paste the updated rules and publish

- [ ] **Step 3: Verify**

In Firestore console, attempt a `matchmaking` read from an anonymous user — should succeed.
Attempt a write to `matchmaking/otherUid` — should fail (403).

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(firestore): add matchmaking collection security rules"
```

---

## Final Verification Checklist

Run `npm start` and test each feature end-to-end:

- [ ] **Tutorial:** First launch shows 3-step overlay. `?` button replays with close button. Second launch skips tutorial.
- [ ] **Share Result:** Button appears in game-over overlay for local and online games. Share sheet opens with correct message.
- [ ] **Online Timer:** 15s countdown visible in online games. Auto-skip fires with toast on expiry.
- [ ] **Touch Snapping:** Ghost line appears on nearest line. Move commits on release. Works on 6×6.
- [ ] **Quick Match:** Two devices pair within 5s. Correct grid size used. Cancel and timeout work.

---

## Commit Summary

After all tasks, verify git log shows clean commits:
```bash
git log --oneline -12
```

Expected:
```
feat(firestore): add matchmaking collection security rules
feat(index): add Quick Match button with matchmaking state machine
feat(matchmaking): add matchmaking service with queue, pool listener, and transaction
feat(tutorial): trigger TutorialOverlay on first launch, add ? replay button
feat(tutorial): add TutorialOverlay with 3-step interactive tutorial
feat(GameBoard): replace onPressIn with PanResponder snap-to-line + ghost preview
feat(online-game): wire timerMax/timerRemaining to ScoreBar, add onAutoSkip toast
feat(useOnlineGame): add 15s turn timer, onAutoSkip, skip guard in subscriber
feat(gameRoom): add turnStartedAt to applyMove, add skipTurn, buildInitialRoomDoc
feat(share): add Share Result button to game-over overlay
feat(storage): add getTutorialSeen / setTutorialSeen helpers
feat(types): add turnStartedAt, skip lastMove type, MatchmakingDoc
```
