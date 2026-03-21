# Phase 1 Design Spec — Dots & Boxes

**Date:** 2026-03-22
**Status:** Revised after spec review (iteration 4)
**Scope:** Five features that complete the launch-ready experience

---

## Background

Dots & Boxes currently has a solid functional core: local 2-player, vs AI (3 difficulties),
online multiplayer via room codes, coins, themes, and a leaderboard. Three independent AI
reviews (ChatGPT, Gemini, Perplexity) unanimously identified the same gaps:

1. No onboarding — new players have no idea what to do
2. No online turn timer — griefing/stalling is possible
3. Touch precision issues on dense grids
4. No way to share a game result
5. Online mode requires a friend with a room code — solo players have no path in

Phase 1 fixes all five.

---

## Constraints (non-negotiable)

- Expo Go compatible — no native builds, no Cloud Functions
- Firebase v10 web SDK (NOT @react-native-firebase)
- Anonymous auth only — no Game Center / Google Play identity
- `moduleResolution: "node"` in tsconfig — do not change
- `useOnlineGame` must return the same shape as `useGameEngine`
- All timer enforcement is **best-effort client-side only** — a modified client could ignore a
  timer. This is acceptable for a casual game; acknowledged and intentional.

---

## Feature 1: Interactive Tutorial

### Goal
New players complete one guided mini-game on first launch and understand three core concepts:
drawing lines, claiming boxes (extra turn), and chain awareness.

### Trigger & placement

On mount in `app/index.tsx`, read `AsyncStorage` key `tutorialSeen`.
To avoid a flash, `showTutorial` state is initialised to `false` and set only after the
AsyncStorage read completes.

**Placement in the component tree:**
`TutorialOverlay` must be a **sibling of `ScrollView`** inside the root `SafeAreaView`
(not a child of `ScrollView`, where `position: absolute` would scroll with content):

```tsx
<SafeAreaView>
  <ScrollView>...</ScrollView>
  {showTutorial && <TutorialOverlay onDone={handleTutorialDone} replayMode={false} />}
</SafeAreaView>
```

`TutorialOverlay` uses `StyleSheet.absoluteFillObject` to cover the full screen.

**AsyncStorage failure:** If the read throws, default to `tutorialSeen = true` (skip tutorial)
and log the error. Never block the app for a storage failure.

### Board states

Each tutorial step uses a hardcoded `Partial<GameState>` (only `lines` and `boxes` needed)
defined as static constants inside `TutorialOverlay.tsx`. No utility function needed —
these are plain objects matching the existing type shapes.

### Three forced steps

| Step | Pre-filled state | Instruction text | Advance condition |
|------|-----------------|-----------------|-------------------|
| 1 | Empty 3×3 | "Tap any edge between two dots to draw a line" | Any valid line tapped |
| 2 | 3 sides of one box already drawn | "Complete this box to claim it — and earn another turn!" | The one closing line tapped |
| 3 | A 3-box chain with one open end, highlighted | "Careful — closing this chain gives your opponent 3 boxes!" | "Got it →" button tapped |

**Step advancement — signal threading:**
`TutorialOverlay` renders `GameBoard` directly and passes its own `onLineTap` handler to it.
`TutorialOverlay` is self-contained: it does **not** use `useGameEngine` and does **not** share
`onLineTap` with any parent screen. The flow is:

```tsx
// Inside TutorialOverlay.tsx
<GameBoard
  state={STEP_STATES[step]}          // hardcoded GameState snapshot
  onLineTap={handleTutorialLineTap}  // owned by TutorialOverlay
  allowedLines={STEP_ALLOWED[step]}  // Set<string> for this step
  disabled={false}
  currentPlayer={1}
  theme={theme}
  // ... other required props
/>
```

`handleTutorialLineTap` inside `TutorialOverlay`:
- If `step < 2` and the tapped line is in `allowedLines`: call `setStep(step + 1)`
- If `step === 2`: no-op (step 3 advances via "Got it" button)
- No game engine processing occurs — the tutorial manages its own local state.

### `allowedLines` prop — string key format

**`Set<LineId>` cannot be used for membership checks** (reference equality always fails).
Instead:

```ts
// In GameBoard, the new prop is:
allowedLines?: Set<string>

// Key format: "<type>-<row>-<col>"
// e.g., horizontal line at row 0, col 1 → "h-0-1"
//        vertical line at row 2, col 0  → "v-2-0"

// In GameBoard's PanResponder grant handler:
const key = `${nearestLine.type === 'horizontal' ? 'h' : 'v'}-${nearestLine.row}-${nearestLine.col}`;
const isAllowed = !allowedLines || allowedLines.has(key);
if (!isAllowed) return; // silently ignore tap
```

`TutorialOverlay` constructs `allowedLines` as a `Set<string>` using the same key format.

### Replay

A `?` icon button in `app/index.tsx` (placed in the existing `topBar` row, after the Shop button)
sets `showTutorial = true`. In replay mode (`replayMode={true}`), every step shows a visible
`✕` close button that calls `onDone()` immediately.

### Files affected
- `app/index.tsx` — check `tutorialSeen` on mount; manage `showTutorial` state; add `?` button;
  render `TutorialOverlay` as sibling of `ScrollView`
- `src/components/TutorialOverlay.tsx` — new; hardcoded board snapshots; step state machine;
  passes `allowedLines: Set<string>` and `onLineTap` to `GameBoard`
- `src/components/GameBoard.tsx` — add optional `allowedLines?: Set<string>` prop (used in
  snapping handler, see Feature 3)
- `src/utils/storage.ts` — add `getTutorialSeen(): Promise<boolean>` and
  `setTutorialSeen(): Promise<void>`

### Success criteria
- First launch: tutorial overlay appears, covers full screen, completes 3 steps
- `tutorialSeen` persists across app restarts — tutorial does not reappear
- `?` button opens tutorial; `✕` closes it in replay mode
- Tapping an incorrect line (not in `allowedLines`) does nothing
- AsyncStorage failure does not crash or block the app
- Tutorial overlay does not scroll with the home screen content

---

## Feature 2: Online Turn Timer (15s)

### Goal
Prevent stalling/griefing in online games. Make online pacing consistent with local mode.

### Trust model
Timer enforcement is client-side only. The active player submits the skip when their own
timer fires. The Firestore `currentPlayerUid` guard in `applyMove` prevents the opposing
client from submitting a skip on someone else's behalf. A cheating client can ignore their
own timer — accepted limitation for a casual game.

### Type changes (`src/types/game.types.ts`)

Add to `OnlineRoom` interface:
```ts
turnStartedAt: number | null   // Unix ms; null before first move
```

Add `MatchmakingDoc` interface (see Feature 5).

### `skipTurn` write shape (`src/services/gameRoom.ts`)

`skipTurn(roomCode: string, uid: string)` writes to the room document:
```ts
{
  lastMove: { type: 'skip', row: -1, col: -1, uid },
  moveCount: increment(1),
  turnStartedAt: serverTimestamp(),
  // currentPlayerUid is toggled by the same logic as applyMove
}
```

The `lastMove` type in `OnlineRoom` must be updated to accept `type: 'horizontal' | 'vertical' | 'skip'`.

**Skip guard in `useOnlineGame` subscriber (critical):**
The Firestore `onSnapshot` subscriber in `useOnlineGame` reads `room.lastMove` to update
`lineOwnersRef` and determine who drew which line. It must guard against `type: 'skip'`:

```ts
const lm = room.lastMove;
if (lm && lm.type !== 'skip') {
  // existing lineOwner assignment logic
  lineOwnersRef.current.hLineOwners[lm.row][lm.col] = player;  // etc.
}
```

Without this guard, a skip move with `row: -1, col: -1` would attempt
`lineOwnersRef.current.hLineOwners[-1][-1]` — a runtime crash.

**`timerSeconds` in the room document:**
The existing `OnlineRoom` type has `timerSeconds: TimerOption`. When a room is created via
Quick Match or the existing lobby flow, `timerSeconds` should be written as `15` (not `0`)
so both clients can derive the same timer duration from the document rather than relying on
a hardcoded constant. `buildInitialRoomDoc()` (Feature 5) sets `timerSeconds: 15`.
`createRoom()` in `gameRoom.ts` continues to accept a `timerSeconds` param and passes it
through unchanged — lobby-created rooms keep whatever the host sets (currently `0`).

The `currentPlayerUid` guard in `skipTurn` is identical to `applyMove`:
```ts
if (data.currentPlayerUid !== uid) throw new Error('Not your turn');
```
This prevents a race where both the opponent's real move and the active player's auto-skip
arrive simultaneously — whichever writes first wins; the other throws and is silently caught.

### Timer calculation in `useOnlineGame`

A `useEffect` keyed on `[room?.moveCount]` recalculates `timerRemaining`:
```ts
useEffect(() => {
  if (!room?.turnStartedAt) return;
  const elapsed = Date.now() - room.turnStartedAt;
  const remaining = Math.max(0, 15 - Math.floor(elapsed / 1000));
  setTimerRemaining(remaining);
  // Start 1s interval to decrement
}, [room?.moveCount]);
```

When `timerRemaining` reaches 0 **and it is my turn** (`isMyTurn`):
1. Call `skipTurn(roomCode, myUid)` — fire-and-forget
2. Fire `onAutoSkip(myName)` locally (before Firestore confirms) so the toast appears immediately

### ScoreBar wiring in `online-game.tsx`
- `timerRemaining` from `useOnlineGame` (currently hardcoded `0` → replace with hook value)
- `timerMax` from `room?.timerSeconds ?? 15` (currently hardcoded `0` → replace with value from room doc)

### `onAutoSkip` added to `OnlineGameEvents`
```ts
onAutoSkip?: (playerName: string) => void
```
Fired locally by the active client when it submits a skip. `app/online-game.tsx` passes
`onAutoSkip` to show the same toast as local mode: `"Time's up — {playerName} skipped"`.

### Files affected
- `src/types/game.types.ts` — add `turnStartedAt`, update `lastMove` type, add `MatchmakingDoc`
- `src/services/gameRoom.ts` — `applyMove` writes `turnStartedAt: serverTimestamp()`;
  add `skipTurn()`
- `src/hooks/useOnlineGame.ts` — add timer effect; add `onAutoSkip` to events;
  return real `timerRemaining`
- `app/online-game.tsx` — pass `timerMax={15}` and `timerRemaining`; add `onAutoSkip` handler

### Success criteria
- ScoreBar shows 15s countdown during online games
- Timer resets on every move (including extra turns after box capture)
- Turn auto-skips when timer hits 0 for the active player
- Toast: "Time's up — {playerName} skipped"
- `timerMax` and `timerRemaining` are never both `0` during an active online game

---

## Feature 3: Touch Snapping / Precision Fix

### Goal
Make line selection reliable on all grid sizes, especially 5×5 and 6×6 on small screens.

### Architecture

**The current `onPressIn`-on-Rect model must be replaced.** The snap-preview-then-commit flow
requires raw coordinate tracking across a gesture, which `onPressIn` cannot provide.

**New model: `PanResponder` on a `View` wrapper around the `Svg`**

```tsx
<View
  {...panResponder.panHandlers}
  onLayout={e => { boardOrigin.current = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y }; }}
>
  <Svg width={boardSize} height={boardSize}>
    {/* existing lines, dots, boxes */}
    {previewLine && <Line ... />}  {/* ghost preview */}
  </Svg>
</View>
```

> **Critical:** `PanResponder` must be attached to the **`View` wrapper**, not to the `Svg`
> element. `react-native-svg`'s `Svg` does not propagate the React Native responder protocol
> correctly on iOS. The `Svg` itself remains a pure rendering target.

### Coordinate mapping

`onLayout` gives the board's position **relative to its parent**, but `PanResponder`'s
`gestureState.x0` / `y0` are **screen-absolute** coordinates. These cannot be subtracted
directly. Instead, use a `ref` with `measure()` to obtain the screen-absolute origin:

```ts
const boardViewRef = useRef<View>(null);
const boardOrigin  = useRef({ x: 0, y: 0 });

// On the View wrapper:
<View
  ref={boardViewRef}
  {...panResponder.panHandlers}
  onLayout={() => {
    boardViewRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      boardOrigin.current = { x: pageX, y: pageY };
    });
  }}
>
```

`pageX` and `pageY` from `measure()` are screen-absolute. In `onPanResponderGrant`:
```ts
const localX = gestureState.x0 - boardOrigin.current.x;
const localY = gestureState.y0 - boardOrigin.current.y;
```

Each `LineId` has a computable midpoint from `cellSize`, `row`, and `col`.
Find the nearest undrawn line using Euclidean distance to midpoints.

### Snap threshold
```
threshold = cellSize * 0.45
```
Proportional to `cellSize` — device-independent across all screen sizes and grid densities.

### `Rect` tap targets

The existing `Rect` elements **must be removed entirely** from `GameBoard`.

Retaining them as "visual spacers" is not safe: in `react-native-svg`, any `Rect` with a
`fill` (including `fill="transparent"`) captures touch events and will prevent them from
reaching the `PanResponder` on the outer `View`. Removing the `Rect` elements eliminates
this conflict. All hit-testing is now handled by the PanResponder's nearest-line distance
calculation — no SVG-level hit areas are needed.

### Ghost preview visual
An additional `Line` SVG element is rendered when `previewLine` is set:
- Color: active player's theme color (`theme.p1` if player 1's turn, `theme.p2` otherwise)
- Opacity: `0.4`
- StrokeWidth: same as drawn lines
- Z-order: rendered after all drawn lines (on top)

### `allowedLines` integration (Feature 1)
In `onPanResponderGrant`, after finding the nearest line:
```ts
const key = `${line.type === 'horizontal' ? 'h' : 'v'}-${line.row}-${line.col}`;
if (allowedLines && !allowedLines.has(key)) return; // tutorial restriction
```

### PanResponder handlers summary
| Handler | Action |
|---------|--------|
| `onPanResponderGrant` | Compute nearest line; set `previewLine` if within threshold and allowed |
| `onPanResponderMove` | Recompute nearest line from current position; update `previewLine` |
| `onPanResponderRelease` | If `previewLine` set and line is undrawn and not `disabled`: call `onLineTap`; clear `previewLine` |
| Any handler when `disabled` | Return immediately; no preview, no commit |

### `previewLine` prop / state
`previewLine: LineId | null` is **internal state** of `GameBoard` — not a prop.
It does not need to be exposed to parent screens. No `GameBoard` prop interface change is
needed for the ghost preview (only `allowedLines` is a new prop).

### Files affected
- `src/components/GameBoard.tsx` — remove `Rect` tap targets; add `PanResponder` on `View`
  wrapper with `boardViewRef` + `measure()`-based origin; add `previewLine` internal state;
  add ghost `Line` SVG element; add `allowedLines?: Set<string>` prop

### Success criteria
- Ghost line appears (correct player color, 40% opacity) on nearest line while finger is held
- Move commits only on finger release
- Move is cancelled if no line is within `cellSize * 0.45` of the touch point
- Works correctly on 3×3 through 6×6 grids
- `disabled={true}` shows no ghost and accepts no input
- `allowedLines` correctly restricts preview and commit (tutorial integration verified)

---

## Feature 4: Share Result Button

### Goal
Let players share their game result with one tap after a game ends.

### Layout order in game-over overlay

The coin row in `game.tsx` is only shown when `config.mode === 'ai'` (not for 2-player mode).
The Share button placement adapts:

**`game.tsx` — AI mode** (coin row present):
1. Emoji, Title, Score row, Coin row, **Share Result button**, Action buttons

**`game.tsx` — 2-player mode** (no coin row):
1. Emoji, Title, Score row, **Share Result button**, Action buttons

**`online-game.tsx`** (coin row always present):
1. Emoji, Title, Score row, Coin row, **Share Result button**, Action buttons

In all cases the Share button sits immediately above the action buttons row.

### Message format
- Win:  `"{winner} beat {loser} {winScore}–{loseScore} in Dots & Boxes! 🎉"`
- Loss: same format — winner is always first regardless of local player role
- Draw: `"{p1Name} and {p2Name} tied {score}–{score} in Dots & Boxes! 🤝"`

**Name truncation:** Names over 12 characters are truncated with `…` in the share text only:
```ts
const trunc = (s: string) => s.length > 12 ? s.slice(0, 12) + '…' : s;
```

**Availability guard:** Button renders only when `result !== null`. In `online-game.tsx`,
`result` is set only after `state.isGameOver` (requires Firestore confirmation) — names are
always resolved at this point.

### Button style
Secondary (outlined) button, same visual style as the "← Menu" button. Label: "Share Result".

### Files affected
- `app/game.tsx` — add Share button; import `Share` from `react-native`
- `app/online-game.tsx` — add Share button (same pattern; `Share` already imported)

### Success criteria
- Button appears in game-over overlay in both local and online games
- Correct message for win, loss, draw
- Native share sheet opens on tap
- Names over 12 characters are truncated in share text
- Button does not appear mid-game

---

## Feature 5: Quick Match (Matchmaking Queue)

### Goal
Let solo players find an opponent without a room code.

### Navigation graph change
Current: mode=online → "Go to Lobby →" → `/lobby` (create or join room)

New:
```
mode=online → "Quick Match" → matchmaking flow in index.tsx → /online-game
           → "Use Room Code" → /lobby (unchanged)
```

`app/lobby.tsx` is **not modified**. Quick Match is a parallel path that bypasses the lobby
entirely and navigates directly to `/online-game` once matched.

### Firestore collection: `matchmaking/{uid}`
```ts
interface MatchmakingDoc {
  uid:             string;
  name:            string;
  gridSize:        GridSize;               // player's selected grid size
  joinedAt:        Timestamp;
  status:          'waiting' | 'matched' | 'cancelled' | 'timeout';
  roomCode:        string | null;
  matchedGridSize: GridSize | null;        // min(player1.gridSize, player2.gridSize)
}
```

### Matching flow

**Step 1 — Player enters queue:**
`joinQueue(uid, name, gridSize)` in `matchmaking.ts` writes
`{ uid, name, gridSize, joinedAt: serverTimestamp(), status: 'waiting', roomCode: null, matchedGridSize: null }`.

**Step 2 — Listen for a partner:**
`subscribeToMatch(uid, callback)` subscribes to the `matchmaking` collection:
```
where('status', '==', 'waiting')
orderBy('joinedAt', 'asc')
limit(2)
```
When two documents appear (including own), attempt the matching transaction.

**Step 3 — Matching transaction (race-condition safe):**
```ts
await runTransaction(db, async (tx) => {
  const docA = await tx.get(matchmakingRef(uidA));  // lexicographically smaller uid
  const docB = await tx.get(matchmakingRef(uidB));  // larger uid

  // Guard: only proceed if both still waiting and both joined recently (< 40s ago)
  const now = Date.now();
  if (docA.data()?.status !== 'waiting') throw new Error('already matched');
  if (docB.data()?.status !== 'waiting') throw new Error('already matched');
  if (now - docA.data()!.joinedAt.toMillis() > 40_000) throw new Error('stale');
  if (now - docB.data()!.joinedAt.toMillis() > 40_000) throw new Error('stale');

  const resolvedGrid = Math.min(docA.data()!.gridSize, docB.data()!.gridSize) as GridSize;
  const roomCode = generateRoomCode(); // pure function, no Firestore read

  // Write room document directly inside the transaction
  tx.set(roomRef(roomCode), buildInitialRoomDoc(uidA, docA.data()!.name, uidB, docB.data()!.name, resolvedGrid));

  // Update both matchmaking docs
  tx.update(matchmakingRef(uidA), { status: 'matched', roomCode, matchedGridSize: resolvedGrid });
  tx.update(matchmakingRef(uidB), { status: 'matched', roomCode, matchedGridSize: resolvedGrid });
});
```

> **Key point:** `createRoom()` from `gameRoom.ts` is **NOT called** inside the transaction.
> Instead, `buildInitialRoomDoc()` is a new pure function (no Firestore reads) that returns
> the plain room document object. `tx.set` writes it directly. `generateRoomCode()` is a pure
> function (random 4-letter string) — no uniqueness check in Phase 1 (collision probability
> with 26^4 = 456,976 possibilities is negligible for a small user base).

**Transaction failure handling:**
- If the transaction throws (because one doc was already matched/stale), the error is caught silently
- The subscribing client continues listening; the next Firestore snapshot may show a new partner

**Guest loading state on navigation:**
The host's transaction writes the room doc and updates the guest's matchmaking doc atomically,
but Firestore's `onSnapshot` for the room (in `useOnlineGame`) may fire before the room doc
is visible to the guest (propagation delay). The existing `online-game.tsx` already handles
this: it shows an `ActivityIndicator` while `!room` is null (the "Connecting…" state).
No additional loading state is needed — the existing null-room loading UI covers this window.

**Step 4 — Navigation (both clients):**
Both clients' `subscribeToMatch` callbacks detect their own doc changing to `status: 'matched'`.
They read `roomCode` and `matchedGridSize` from their own doc (not from the transaction return value).
Then navigate:
```ts
router.replace({ pathname: '/online-game', params: { roomCode, isHost: uid === uidA ? 'true' : 'false', myUid: uid, gridSize: matchedGridSize } });
```

### Document lifecycle

| Event | Write |
|-------|-------|
| Enter queue | `status: 'waiting'` |
| Matched | Transaction sets `status: 'matched'` |
| Cancel button pressed | `cancelQueue(uid)` → `status: 'cancelled'` |
| 30s timeout fires | `status: 'timeout'` |
| Component unmount (useEffect cleanup) | If `status` still `waiting`: `status: 'cancelled'` |

Documents are never deleted (audit trail). The `joinedAt < 40s` guard in the transaction
prevents stale `waiting` docs from matching new users.

### Timeout & UI states

During matchmaking, `app/index.tsx` shows an inline state below the Quick Match button:
- `waiting`: spinner + "Looking for a match…" + Cancel button
- `matched`: auto-navigates (no UI shown)
- `timeout`: "No players found. Try again or use a room code instead."
- `cancelled`: returns to normal button state

A 30-second `setTimeout` fires `cancelQueue(uid)` and sets local state to `timeout`.

### Grid conflict resolution
The smaller grid size is written to `matchedGridSize` in the transaction.
The guest reads this from their doc and passes it to `online-game`. No UI notification
is shown for the size change (minor UX trade-off, acceptable in Phase 1).

### Firestore security rules for `matchmaking`
```
match /matchmaking/{uid} {
  // Any authenticated user can read all waiting docs (needed to find a partner)
  allow read: if request.auth != null;
  // Only the document owner can create or update their own doc
  allow create, update: if request.auth != null && request.auth.uid == uid;
  // No deletes (audit trail)
  allow delete: if false;
}
```

### New utility functions in `src/services/matchmaking.ts`
- `joinQueue(uid, name, gridSize)` — writes matchmaking doc
- `cancelQueue(uid)` — updates status to cancelled
- `subscribeToMatch(uid, onMatched)` — real-time listener; calls `onMatched({roomCode, matchedGridSize, isHost})` when status=matched
- `attemptMatch(myUid, partnerUid)` — runs the transaction described above
- `generateRoomCode()` — pure function, 4 uppercase letters
- `buildInitialRoomDoc(uidA, nameA, uidB, nameB, gridSize)` — pure function returning room doc object

### Files affected
- `app/index.tsx` — replace single online CTA with Quick Match + Room Code buttons;
  manage matchmaking state machine (idle → waiting → matched/timeout/cancelled)
- `src/services/matchmaking.ts` — new file
- `src/types/game.types.ts` — add `MatchmakingDoc` interface
- `firestore.rules` — add matchmaking collection rules

### Success criteria
- Two devices both tapping Quick Match are paired and land in the same game within ~5s
- Only one room is created per match (transaction prevents duplicates)
- Cancel before match removes the player from the queue
- 30s timeout shows the correct message
- Force-quit users (stale docs > 40s old) are not matched to new players
- Matched game uses the smaller of the two grid sizes
- "Use Room Code" still routes to `/lobby` unchanged

---

## What Does NOT Change in Phase 1

- Coin rewards, amounts, daily bonus
- Shop, themes, theme unlock flow
- Leaderboard screen
- Local 2-player and vs AI game logic (except `allowedLines` prop on GameBoard)
- Existing room code lobby (additive, not replaced)
- Firebase auth (still anonymous)
- TypeScript config, moduleResolution, firebase-shim

---

## Phase 1 File Change Summary

| File | Change type | Feature |
|------|-------------|---------|
| `app/index.tsx` | Modified | Tutorial (1), Quick Match (5) |
| `app/game.tsx` | Modified | Share Result (4) |
| `app/online-game.tsx` | Modified | Online Timer (2), Share Result (4) |
| `src/components/TutorialOverlay.tsx` | **New** | Tutorial (1) |
| `src/components/GameBoard.tsx` | Modified | Snapping (3), allowedLines (1) |
| `src/hooks/useOnlineGame.ts` | Modified | Online Timer (2) |
| `src/services/gameRoom.ts` | Modified | Online Timer (2) |
| `src/services/matchmaking.ts` | **New** | Quick Match (5) |
| `src/types/game.types.ts` | Modified | Online Timer (2), Quick Match (5) |
| `src/utils/storage.ts` | Modified | Tutorial (1) |
| `firestore.rules` | Modified | Quick Match (5) |

---

## Open Questions (deferred to Phase 2)

- Deep link in share message (requires app store listing / universal links)
- ELO rating for matchmaking
- Reconnect after disconnect in online games
- Push notifications
- XP / level / progression system
- Daily challenges
- Firestore index for matchmaking query (may be needed at scale)
- Room code uniqueness check in matchmaking (needed at scale, not in Phase 1)
