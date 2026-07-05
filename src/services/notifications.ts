import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Local notifications only. True background/killed-app delivery would require
// a remote push channel (APNs for iOS, FCM for Android) wired through a
// server — that needs Apple/Google push credentials this project doesn't
// have configured. This module only fires notifications while the app
// process is still alive (backgrounded, not force-quit).
const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

let handlerSet = false;
function ensureHandler(): void {
  if (handlerSet || !SUPPORTED) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!SUPPORTED) return false;
  ensureHandler();
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (_) {
    return false;
  }
}

/** Fires an immediate local notification announcing it's the player's turn. */
export async function notifyYourTurn(roomCode: string): Promise<void> {
  if (!SUPPORTED) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Your turn!",
        body: `It's your turn in room ${roomCode}.`,
        sound: true,
      },
      trigger: null, // fire immediately
    });
  } catch (_) {}
}
