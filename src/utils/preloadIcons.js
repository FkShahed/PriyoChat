import * as Font from 'expo-font';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';

/**
 * Icons in this app are drawn from font files. A font is normally downloaded/decoded the FIRST time
 * an icon of that family is shown, which is why icons used only inside one screen (the call icons
 * in the chat screen come from MaterialCommunityIcons) appeared a moment late when opening a chat.
 *
 * Loading all the families once, in the background right when the app starts, means every icon is
 * already ready by the time any screen needs it. Fire-and-forget: it never blocks startup and any
 * failure is ignored (icons then simply load on first use, exactly as before).
 */
let started = false;

export function preloadIcons() {
  if (started) return;
  started = true;
  try {
    Font.loadAsync({
      ...Ionicons.font,
      ...MaterialCommunityIcons.font,
      ...Feather.font,
    }).catch(() => {});
  } catch (e) {
    // ignore
  }
}

// Start immediately when this module is imported (AppNavigator imports it at app start)
preloadIcons();
