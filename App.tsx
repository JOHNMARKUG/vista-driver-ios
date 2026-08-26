import React, { useRef, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  BackHandler,
  Platform,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

const DRIVER_URL = 'https://vista-driver.vercel.app';
const NAVY = '#1B2E6B';

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  const onLoad = useCallback(() => {
    SplashScreen.hideAsync();
  }, []);

  // Android hardware back button navigates the WebView back
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
          onNavigationStateChange={onNavigationStateChange}
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          geolocationEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#C8922A" />
            </View>
          )}
          onShouldStartLoadWithRequest={() => true}
          applicationNameForUserAgent="VISTADriverApp/1.0"
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
