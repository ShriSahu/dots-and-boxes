import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../hooks/useTheme';

export interface HowToPlayStep {
  emoji: string;
  title: string;
  body: string;
}

interface Props {
  title: string;
  steps: HowToPlayStep[];
  onClose: () => void;
}

export default function HowToPlayModal({ title, steps, onClose }: Props) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [step, setStep] = useState(0);
  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <Pressable style={s.overlay} onPress={onClose}>
      <Pressable style={[s.card, { backgroundColor: theme.bg, borderColor: theme.border }]} onPress={() => {}}>
        <TouchableOpacity style={s.closeBtn} onPress={onClose}>
          <Text style={[s.closeText, { color: theme.textMuted }]}>✕</Text>
        </TouchableOpacity>

        <Text style={[s.header, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>{title}</Text>

        <View style={s.dots}>
          {steps.map((_, i) => (
            <View key={i} style={[s.dot, { backgroundColor: i === step ? theme.p1 : theme.border }]} />
          ))}
        </View>

        <Text style={s.emoji}>{current.emoji}</Text>
        <Text style={[s.title, { color: theme.text, fontFamily: theme.fontHandwritten }]}>{current.title}</Text>
        <Text style={[s.body, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>{current.body}</Text>

        <View style={s.navRow}>
          {step > 0 && (
            <TouchableOpacity style={[s.navBtn, { borderColor: theme.border }]} onPress={() => setStep(step - 1)}>
              <Text style={[s.navBtnText, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>← Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.navBtn, s.navBtnPrimary, { backgroundColor: theme.text }]}
            onPress={() => (isLast ? onClose() : setStep(step + 1))}
          >
            <Text style={[s.navBtnPrimaryText, { color: theme.bg, fontFamily: theme.fontHandwritten }]}>
              {isLast ? 'Got it →' : 'Next →'}
            </Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Pressable>
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
      gap: 8,
    },
    closeBtn: { position: 'absolute', top: 12, right: 16 },
    closeText: { fontSize: 20, fontWeight: '600' },
    header: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
    dots: { flexDirection: 'row', gap: 8, marginVertical: 4 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    emoji: { fontSize: 40, lineHeight: 48, marginTop: 4 },
    title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
    body: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 4 },
    navRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    navBtn: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, borderWidth: 2 },
    navBtnText: { fontSize: 16, fontWeight: '600' },
    navBtnPrimary: { borderWidth: 0, paddingHorizontal: 28 },
    navBtnPrimaryText: { fontSize: 18, fontWeight: '700' },
  });
}
