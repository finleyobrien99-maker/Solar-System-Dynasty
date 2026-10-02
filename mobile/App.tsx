// Solar Dynasty on your phone: the web game (built into game/gameHtml.ts by
// `npm run build:app` in the project root) running in a full-screen WebView,
// with the phone handling saves, haptics, sharing and the back button.

import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef } from 'react';
import { BackHandler, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import gameHtml from './game/gameHtml';
import { loadAll, store } from './game/storage';

const BG = '#060913';
// A stable origin for the page, so its localStorage survives restarts. The
// game never navigates, so nothing is ever fetched from this address.
const BASE_URL = 'https://solar-dynasty.local/';

type Message =
  | { type: 'haptic'; kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' }
  | { type: 'store'; key: string; value: string | null }
  | { type: 'share'; filename: string; text: string }
  | { type: 'exit' };

/** Hand the page every save the phone holds, before any of the game's code runs. */
function pageWithSaves(saves: Record<string, string>): string {
  const json = JSON.stringify(saves).replace(/</g, '\\u003c');
  return gameHtml.replace('<head>', `<head><script>window.__NATIVE_STORE__=${json};</script>`);
}

function haptic(kind: Extract<Message, { type: 'haptic' }>['kind']): void {
  const n = Haptics.NotificationFeedbackType;
  const i = Haptics.ImpactFeedbackStyle;
  const run =
    kind === 'success' ? Haptics.notificationAsync(n.Success)
    : kind === 'warning' ? Haptics.notificationAsync(n.Warning)
    : kind === 'error' ? Haptics.notificationAsync(n.Error)
    : Haptics.impactAsync(kind === 'heavy' ? i.Heavy : kind === 'medium' ? i.Medium : i.Light);
  run.catch(() => {});
}

async function share(filename: string, text: string): Promise<void> {
  const safe = filename.replace(/[^\w.-]+/g, '-');
  const file = new File(Paths.cache, safe);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export your dynasty', UTI: 'public.json' });
  }
}

export default function App() {
  const web = useRef<WebView>(null);
  // Read once: later saves already live in the page's own storage.
  const source = useMemo(() => ({ html: pageWithSaves(loadAll()), baseUrl: BASE_URL }), []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // The page closes whatever is open, or asks us to exit.
      web.current?.injectJavaScript('window.__onNativeBack && window.__onNativeBack(); true;');
      return true;
    });
    return () => sub.remove();
  }, []);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: Message;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'haptic':
        haptic(msg.kind);
        break;
      case 'store':
        store(msg.key, msg.value);
        break;
      case 'share':
        share(msg.filename, msg.text).catch((err) => console.warn('Share failed', err));
        break;
      case 'exit':
        BackHandler.exitApp();
        break;
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar style="light" />
        <WebView
          ref={web}
          source={source}
          originWhitelist={['*']}
          onMessage={onMessage}
          style={styles.web}
          containerStyle={styles.web}
          javaScriptEnabled
          domStorageEnabled
          bounces={false}
          overScrollMode="never"
          textZoom={100}
          setSupportMultipleWindows={false}
          allowsLinkPreview={false}
          hideKeyboardAccessoryView
          webviewDebuggingEnabled={__DEV__}
          // If the OS kills the page in the background, bring it straight back.
          onRenderProcessGone={() => web.current?.reload()}
          onContentProcessDidTerminate={() => web.current?.reload()}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  web: { flex: 1, backgroundColor: BG },
});
