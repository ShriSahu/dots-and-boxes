# Phase 1 Design Spec — Dots & Boxes

**Date:** 2026-03-22
**Status:** Approved for implementation
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

## Feature 1: Interactive Tutorial

### Goal
New players complete one guided mini-game on first launch and understand the three core
concepts: drawing lines, claiming boxes (extra turn), and chain awareness.

### Behaviour
- Triggers **once**, on first app open, detected via `AsyncStorage` key `tutorialSeen`
- Uses a locked **3×3 board** as the tutorial arena
- Three forced steps, each with a callout overlay + highlighted tap target:
  1. **Draw a line** — "Tap any edge between two dots to draw a line"
  2. **Close a box** — Board is pre-arranged so one tap closes a box.
     Callout: "Complete a box to claim it — and get another turn!"
  3. **Chain awareness** — A pre-filled board shows a 3-box chain about to be given away.
     Callout: "Careful — giving your opponent a long chain lets them score big!"
- Player cannot proceed until they tap the correct target at each step
- On completion: `AsyncStorage.setItem('tutorialSeen', 'true')`, overlay dismisses
- A `?` icon on the home screen (top-right area) replays the tutorial at any time

### Files affected
- `app/index.tsx` — add `?` button, check `tutorialSeen` on mount, launch tutorial
- `src/components/TutorialOverlay.tsx` — new component (self-contained)
- `src/utils/storage.ts` — add `getTutorialSeen()` / `setTutorialSeen()` helpers

### Out of scope
- No skip button on first launch (forces completion)
- No animated characters or voiceover
- Tutorial does not award coins

---

## Feature 2: Online Turn Timer (15s)

### Goal
Prevent stalling/griefing in online games. Make online pacing consistent with local mode.

### Behaviour
- Every online turn has a **15-second countdown**, non-configurable
- Timer is shown in the existing `ScoreBar` component (same visual as local timer)
- On expiry: current player's turn is auto-skipped (same `onAutoSkip` callback path)
- Timer resets on every turn change (including after a box capture that gives an extra turn)
- The Firestore room document stores `turnStartedAt: Timestamp` — clients calculate
  remaining time locally from this value (avoids server-side timer dependency)
- AFK detection (existing 30s system) remains as a secondary safeguard for abandoned games

### Files affected
- `src/hooks/useOnlineGame.ts` — read `turnStartedAt` from room doc, expose `timerRemaining`
- `src/services/gameRoom.ts` — write `turnStartedAt` on every move/turn change
- `app/online-game.tsx` — pass `timerRemaining` to `ScoreBar`

### Out of scope
- No user-configurable timer in online mode
- No overtime / grace period

---

## Feature 3: Touch Snapping / Precision Fix

### Goal
Make line selection reliable on all grid sizes, especially 5×5 and 6×6 on small screens.

### Behaviour
- On `touchStart` / `onPressIn`: find the nearest line segment within a **snap threshold**
  - Threshold: `20px` (device-independent units)
  - If no line is within threshold, no preview is shown
- Show a **ghost/preview highlight** on the nearest line (semi-transparent, themed colour)
  while the finger is held down
- Commit the move on `touchEnd` / `onPressOut` — not on press-down
- If finger is lifted outside the threshold of any line, cancel (no move made)
- The snap threshold scales with grid size:
  - 3×3 / 4×4: 24px
  - 5×5: 20px
  - 6×6: 16px

### Files affected
- `src/components/GameBoard.tsx` — replace current `onPressIn` commit with snap-preview
  + `onPressOut` commit logic

### Out of scope
- No drag-to-draw (tap only)
- Snapping applies to both local and online modes

---

## Feature 4: Share Result Button

### Goal
Let players share their game result to any app (iMessage, WhatsApp, Twitter, etc.) with
one tap after a game ends.

### Behaviour
- A **Share** button appears in the game-over overlay, between the score row and the
  action buttons (Menu / Play Again)
- Tapping it calls React Native's `Share.share()` with a generated message:
  - Win:  `"I beat {opponent} {myScore}–{theirScore} in Dots & Boxes! 🎉 Can you beat me?"`
  - Loss: `"I lost {myScore}–{theirScore} to {opponent} in Dots & Boxes 😤 Rematch incoming"`
  - Draw: `"Tied {score}–{score} with {opponent} in Dots & Boxes 🤝 Too close to call!"`
- Button label: "Share Result"
- Button style: secondary (outlined), same visual weight as the Menu button
- Share is text-only (no image generation in Phase 1)
- Works identically in both `game.tsx` (local/AI) and `online-game.tsx`

### Files affected
- `app/game.tsx` — add Share button to result overlay
- `app/online-game.tsx` — add Share button to result overlay
- No new files required (`Share` from `react-native` is already imported in `lobby.tsx`)

### Out of scope
- No screenshot or result image card (Phase 3)
- No deep link in the share message (Phase 3)

---

## Feature 5: Quick Match (Matchmaking Queue)

### Goal
Let solo players find an opponent instantly without needing a room code. Pairs the two
longest-waiting players automatically.

### Architecture

#### Firestore collection: `matchmaking/{uid}`
```
{
  uid:        string,
  name:       string,
  gridSize:   number,       // player's preferred grid size
  joinedAt:   Timestamp,
  status:     'waiting' | 'matched' | 'cancelled',
  roomCode:   string | null // set when matched
}
```

#### Matching logic (client-side listener approach, no Cloud Functions required)
1. Player A writes their `matchmaking/{uid}` doc with `status: 'waiting'`
2. Player A subscribes to `matchmaking` collection, ordered by `joinedAt asc`, limit 2,
   where `status == 'waiting'`
3. When two `waiting` docs appear:
   - The **host** is determined by whichever uid is lexicographically smaller (deterministic,
     no race condition)
   - The host client calls `createRoom()` using the **smaller** of the two players' grid sizes
   - Host updates both `matchmaking` docs to `status: 'matched', roomCode: <code>`
   - Both clients detect `matched`, read `roomCode`, navigate to `online-game`
4. Cleanup: on navigation or cancel, set own doc to `status: 'cancelled'`

#### Timeout
- If no second player appears within **30 seconds**, show:
  "No players found. Try again or use a room code."
- Cancel button available at any time

#### Entry point
- Home screen: when mode is `online`, the "Go to Lobby →" button becomes two buttons:
  - **Quick Match** (primary) — enters matchmaking queue
  - **Room Code** (secondary) — navigates to existing lobby

#### Grid size conflict resolution
- Use the **smaller** of the two players' selected grid sizes
- Both players see the resolved grid size on the game screen

### Files affected
- `app/index.tsx` — split online CTA into Quick Match + Room Code buttons
- `src/services/matchmaking.ts` — new file: `joinQueue()`, `cancelQueue()`,
  `subscribeToMatch()`, `resolveGridSize()`
- `src/services/gameRoom.ts` — no changes needed (createRoom already exists)
- `app/online-game.tsx` — no changes needed (already accepts roomCode param)
- Firestore security rules — add `matchmaking` collection rules

### Out of scope
- No ELO / skill-based pairing (Phase 2)
- No region-based matching
- No party/squad queuing

---

## What Does NOT Change in Phase 1

- Coin rewards, amounts, daily bonus
- Shop, themes, theme unlock flow
- Leaderboard screen
- Local 2-player and vs AI game logic
- Existing room code lobby (additive, not replaced)
- Firebase auth (still anonymous)
- TypeScript config, moduleResolution, firebase-shim

---

## Success Criteria

| Feature | Done when... |
|---------|-------------|
| Tutorial | First-launch overlay completes 3 steps; `?` replays it; `tutorialSeen` persists across app restarts |
| Online timer | ScoreBar shows 15s countdown in online games; turn auto-skips on expiry |
| Touch snapping | Ghost preview appears on nearest line; move commits on release; works on 6×6 |
| Share result | Share sheet opens with correct message for win/loss/draw in both game screens |
| Quick Match | Two devices auto-pair and land in same game within ~5s of both tapping Quick Match |

---

## Open Questions (deferred to Phase 2)

- Deep link in share message (requires app store listing / universal links)
- ELO rating for matchmaking
- Reconnect after disconnect in online games
- Push notifications
