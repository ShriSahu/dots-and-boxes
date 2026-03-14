import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme, THEMES, THEME_META } from '../src/hooks/useTheme';
import { getAnonymousUid } from '../src/services/firebase';
import {
  loadCoinBalance, getPurchasedThemes,
  purchaseTheme, setActiveTheme,
} from '../src/services/coins';
import type { ThemeName } from '../src/types/game.types';

const THEME_NAMES: ThemeName[] = ['parchment', 'neon', 'chalkboard', 'blueprint'];

export default function ShopScreen() {
  const { theme, themeName, setTheme } = useTheme();
  const s = makeStyles(theme);

  const [uid, setUid]               = useState('');
  const [coins, setCoins]           = useState(0);
  const [purchased, setPurchased]   = useState<string[]>(['parchment']);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    (async () => {
      const id = await getAnonymousUid();
      setUid(id);
      const [bal, owned] = await Promise.all([
        loadCoinBalance(id),
        getPurchasedThemes(id),
      ]);
      setCoins(bal);
      setPurchased(owned);
      setLoading(false);
    })();
  }, []);

  const handleSelect = async (name: ThemeName) => {
    if (!purchased.includes(name)) {
      const meta = THEME_META[name];
      if (coins < meta.cost) {
        Alert.alert(
          'Not enough coins',
          `You need ${meta.cost} coins to unlock ${meta.label}. Keep playing to earn more!`,
        );
        return;
      }
      Alert.alert(
        `Unlock ${meta.label}?`,
        `This will cost ${meta.cost} 🪙`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Buy for ${meta.cost} 🪙`,
            onPress: async () => {
              const ok = await purchaseTheme(uid, name, meta.cost);
              if (ok) {
                setCoins(c => c - meta.cost);
                setPurchased(p => [...p, name]);
                setTheme(name);
                await setActiveTheme(uid, name);
              } else {
                Alert.alert('Not enough coins');
              }
            },
          },
        ],
      );
      return;
    }
    setTheme(name);
    await setActiveTheme(uid, name);
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={[s.iconBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
          onPress={() => router.back()}>
          <Text style={[s.iconBtnText, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
          🪙 Shop
        </Text>
        <View style={[s.coinBadge, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Text style={[s.coinBadgeText, { color: theme.text, fontFamily: theme.fontHandwritten }]}>
            🪙 {coins}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[s.sectionTitle, { color: theme.textMuted, fontFamily: theme.fontSemiBold }]}>
          Themes
        </Text>
        <Text style={[s.sectionSub, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
          Tap a theme to preview or unlock it
        </Text>

        {THEME_NAMES.map(name => {
          const meta     = THEME_META[name];
          const t        = THEMES[name];
          const owned    = purchased.includes(name);
          const active   = themeName === name;

          return (
            <TouchableOpacity
              key={name}
              style={[
                s.themeCard,
                { backgroundColor: t.bgCard, borderColor: active ? t.p1 : t.border },
                active && { borderWidth: 2.5 },
              ]}
              onPress={() => handleSelect(name)}
              activeOpacity={0.82}
            >
              {/* Preview strip */}
              <View style={[s.previewStrip, { backgroundColor: t.bg }]}>
                <View style={[s.previewDot, { backgroundColor: t.dot }]} />
                <View style={[s.previewLine, { backgroundColor: t.p1 }]} />
                <View style={[s.previewDot, { backgroundColor: t.dot }]} />
                <View style={[s.previewBox, { backgroundColor: t.p1Light, borderColor: t.p1 }]}>
                  <Text style={{ color: t.p1, fontSize: 12, fontFamily: t.fontHandwritten }}>A</Text>
                </View>
                <View style={[s.previewDot, { backgroundColor: t.dot }]} />
                <View style={[s.previewLine, { backgroundColor: t.p2 }]} />
                <View style={[s.previewDot, { backgroundColor: t.dot }]} />
              </View>

              {/* Info */}
              <View style={s.themeInfo}>
                <View style={s.themeTitleRow}>
                  <Text style={[s.themeEmoji]}>{meta.emoji}</Text>
                  <Text style={[s.themeLabel, { color: t.text, fontFamily: t.fontHandwritten }]}>
                    {meta.label}
                  </Text>
                  {active && (
                    <View style={[s.activeBadge, { backgroundColor: t.p1 }]}>
                      <Text style={s.activeBadgeText}>Active</Text>
                    </View>
                  )}
                </View>

                {owned
                  ? <Text style={[s.ownedText, { color: t.textMuted, fontFamily: t.fontRegular }]}>
                      {active ? 'Currently active' : 'Tap to activate'}
                    </Text>
                  : <View style={s.priceRow}>
                      <Text style={[s.priceText, { color: t.p2, fontFamily: t.fontHandwritten }]}>
                        🪙 {meta.cost}
                      </Text>
                      <Text style={[s.lockText, { color: t.textMuted, fontFamily: t.fontRegular }]}>
                        {coins >= meta.cost ? '· Tap to unlock' : `· Need ${meta.cost - coins} more`}
                      </Text>
                    </View>
                }
              </View>
            </TouchableOpacity>
          );
        })}

        {/* How to earn coins */}
        <View style={[s.earnCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Text style={[s.earnTitle, { color: theme.text, fontFamily: theme.fontSemiBold }]}>
            How to earn coins
          </Text>
          {[
            { label: 'Win vs AI',        coins: '+10 🪙' },
            { label: 'Win online',       coins: '+25 🪙' },
            { label: 'Draw',             coins: '+3 🪙'  },
            { label: 'Participate',      coins: '+1 🪙'  },
            { label: 'Daily first game', coins: '+5 🪙'  },
          ].map(row => (
            <View key={row.label} style={s.earnRow}>
              <Text style={[s.earnLabel, { color: theme.textMuted, fontFamily: theme.fontRegular }]}>
                {row.label}
              </Text>
              <Text style={[s.earnCoins, { color: theme.p1, fontFamily: theme.fontHandwritten }]}>
                {row.coins}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    safe:   { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10,
    },
    iconBtn: {
      width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
      borderRadius: 22, borderWidth: 1.5,
    },
    iconBtnText: { fontSize: 24, fontWeight: '700', fontFamily: theme.fontHandwritten },
    title:       { fontFamily: theme.fontHandwritten, fontSize: 28, fontWeight: '700' },
    coinBadge: {
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1.5, borderRadius: 16,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    coinBadgeText: { fontSize: 18, fontWeight: '700' },
    scroll:        { padding: 16, gap: 12 },
    sectionTitle:  { fontSize: 20, fontWeight: '600', marginBottom: 2 },
    sectionSub:    { fontSize: 13, marginBottom: 8 },

    themeCard: {
      borderWidth: 1.5, borderRadius: 14,
      overflow: 'hidden',
      shadowOffset: { width: 2, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3,
    },
    previewStrip: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', paddingVertical: 14, gap: 10,
    },
    previewDot:  { width: 10, height: 10, borderRadius: 5 },
    previewLine: { width: 32, height: 4, borderRadius: 2 },
    previewBox:  {
      width: 28, height: 28, borderRadius: 4, borderWidth: 1.5,
      alignItems: 'center', justifyContent: 'center',
    },
    themeInfo:     { padding: 14 },
    themeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    themeEmoji:    { fontSize: 22 },
    themeLabel:    { fontSize: 24, fontWeight: '700', flex: 1 },
    activeBadge: {
      borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
    },
    activeBadgeText: {
      fontFamily: 'Caveat_700Bold', fontSize: 11, fontWeight: '700',
      color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5,
    },
    ownedText: { fontSize: 13 },
    priceRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
    priceText: { fontSize: 20, fontWeight: '700' },
    lockText:  { fontSize: 13 },

    earnCard: {
      borderWidth: 1.5, borderRadius: 12, padding: 16, gap: 10, marginTop: 8,
    },
    earnTitle:  { fontSize: 18, fontWeight: '600', marginBottom: 4 },
    earnRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    earnLabel:  { fontSize: 15 },
    earnCoins:  { fontSize: 18, fontWeight: '700' },
  });
}
