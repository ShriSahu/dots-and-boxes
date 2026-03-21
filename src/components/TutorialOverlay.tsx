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

// Step 2: top-left box has top, left, bottom drawn — only right side ("v-0-1") missing
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
