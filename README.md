# 🎮 Dots & Boxes

A classic pen-and-paper Dots & Boxes game built with **React Native + TypeScript + Expo** — runs on Web, iOS, and Android from a single codebase.

---

## ✨ Features

- 🎮 **2 Player local** or **vs Smart AI**
- 📐 **Grid sizes**: 3×3, 4×4, 5×5, 6×6
- 🤖 **3-tier AI strategy** (win moves → safe moves → sacrifice analysis)
- 🖊️ **Classic paper / notebook aesthetic**
- 📱 Runs on **Web, iOS, Android**

---

## 🚀 Quick Start (Web — Play Instantly)

Just open `index.html` in any browser. No install needed!

```bash
open index.html
```

---

## 📱 React Native + Expo Setup

### 1. Install Expo CLI

```bash
npm install -g expo-cli eas-cli
```

### 2. Create the project

```bash
npx create-expo-app dotsandboxes --template blank-typescript
cd dotsandboxes
```

### 3. Install dependencies

```bash
npx expo install react-native-svg
npx expo install expo-av
npx expo install react-native-reanimated
npm install @react-navigation/native @react-navigation/stack
npx expo install react-native-screens react-native-safe-area-context
npx expo install expo-font @expo-google-fonts/caveat
```

### 4. Copy source files

Copy the entire `src/` folder from this repo into your project root.

### 5. Run

```bash
# Web
npx expo start --web

# iOS simulator (Mac only)
npx expo start --ios

# Android emulator
npx expo start --android

# Scan QR with Expo Go app on your phone
npx expo start
```

---

## 🏗️ Build for Production

### Setup EAS Build (one time)

```bash
eas login
eas build:configure
```

### Build iOS (requires Apple Developer account)

```bash
eas build --platform ios
```

### Build Android

```bash
eas build --platform android
```

### Build Web (static export)

```bash
npx expo export --platform web
# Output in dist/ — deploy to Netlify, Vercel, etc.
```

---

## 📁 Project Structure

```
dotsandboxes/
├── index.html              # Standalone web version (no install needed)
├── src/
│   ├── types/
│   │   └── game.types.ts   # TypeScript interfaces
│   ├── constants/
│   │   └── theme.ts        # Colors, fonts
│   ├── utils/
│   │   └── gameHelpers.ts  # Pure game logic helpers
│   ├── ai/
│   │   └── aiPlayer.ts     # AI strategy
│   ├── hooks/
│   │   └── useGameEngine.ts # Game state hook
│   └── components/
│       ├── GameBoard.tsx    # SVG game board
│       ├── ScoreBar.tsx     # Score display
│       ├── GridSelector.tsx # Grid size picker
│       └── ModeSelector.tsx # Mode picker
├── app/                    # Expo Router screens
│   ├── index.tsx           # Home screen
│   ├── game.tsx            # Game screen
│   └── result.tsx          # Result screen
└── README.md
```

---

## 🎯 Game Rules

1. Players take turns clicking/tapping the gap between two dots to draw a line
2. If your line **completes all 4 sides of a box**, you claim it and **get another turn**
3. Otherwise, the turn passes to the other player
4. When all lines are drawn, the player with the **most boxes wins**

---

## 🤖 AI Strategy

The AI uses a 3-tier strategy:
1. **Win move** — take any line that completes a box immediately
2. **Safe move** — avoid lines that would leave a box with 3 sides (giving opponent a free box)
3. **Sacrifice** — if forced, pick the move that gives the opponent the fewest boxes

---

## 🌐 Deploy to Web

### Netlify (free)
```bash
npx expo export --platform web
# Drag the dist/ folder to netlify.com/drop
```

### Vercel
```bash
npm install -g vercel
npx expo export --platform web
vercel dist/
```

---

## 📄 License

MIT — free to use, modify, and distribute.
