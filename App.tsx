import React, { useRef, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  BackHandler,
  Platform,
} from 'react-native';
import { WebView, type WebViewNavigation, type WebViewMessageEvent } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

const DRIVER_URL = 'https://vista-driver.vercel.app';
const NAVY = '#1B2E6B';

const SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

// Runs BEFORE page JS: stubs out Service Worker so WKWebView doesn't
// choke on SW registration (WKWebView doesn't support SW in RN WebView).
// The chunk-load guard in the page calls location.reload() on SW errors,
// causing an infinite reload loop → white screen.
const SW_STUB = `
  (function() {
    try {
      Object.defineProperty(navigator, 'serviceWorker', {
        get: function() { return undefined; },
        configurable: true
      });
    } catch(e) {}
  })();
  true;
`;

const ERROR_INJECTION = `
  (function() {
    window.onerror = function(msg, src, line, col, err) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'JS_ERROR',
        msg: msg,
        src: src,
        line: line,
        col: col,
        err: err ? err.toString() : null
      }));
      return false;
    };
    window.addEventListener('unhandledrejection', function(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'PROMISE_ERROR',
        reason: e.reason ? e.reason.toString() : String(e)
      }));
    });
    document.addEventListener('DOMContentLoaded', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'loaded',
        url: window.location.href
      }));
    });
    true;
  })();
`;

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const splashHidden = useRef(false);

  const hideSplash = useCallback(() => {
    if (!splashHidden.current) {
      splashHidden.current = true;
      SplashScreen.hideAsync();
    }
  }, []);

  const onLoad = useCallback(() => {
    hideSplash();
  }, [hideSplash]);

  const onError = useCallback(() => {
    hideSplash();
  }, [hideSplash]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.warn('[VISTA Driver WebView]', JSON.stringify(data));
    } catch {
      console.log('[VISTA Driver WebView message]', event.nativeEvent.data);
    }
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [canGoBack]);

  const onNavigationStateChange = (state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={NAVY} />
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <WebView
          ref={webViewRef}
          source={{ uri: DRIVER_URL }}
          style={styles.webview}
          onLoad={onLoad}
          onError={onError}
          onHttpError={onError}
          onMessage={onMessage}
          onNavigationStateChange={onNavigationStateChange}
          originWhitelist={['*']}
          userAgent={SAFARI_UA}
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          javaScriptCanOpenWindowsAutomatically
          domStorageEnabled
          geolocationEnabled
          mixedContentMode="always"
          allowUniversalAccessFromFileURLs
          allowFileAccessFromFileURLs
          setSupportMultipleWindows={false}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#C8922A" />
            </View>
          )}
          onShouldStartLoadWithRequest={() => true}
          injectedJavaScriptBeforeContentLoaded={SW_STUB}
          injectedJavaScript={ERROR_INJECTION}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NAVY,
  },
  webview: {
    flex: 1,
    backgroundColor: NAVY,
  },
  loader: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: NAVY,
  },
});
