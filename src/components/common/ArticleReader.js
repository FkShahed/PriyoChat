import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Linking, Share, StatusBar, ActivityIndicator, BackHandler, TurboModuleRegistry } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import useThemeStore from '../../store/useThemeStore';

// In-app reader: opens a story inside PriyoChat so the user never has to leave the app.
// If the native WebView is not available in the installed build, it quietly falls back to the
// phone's browser instead of breaking.

// True only when this installed build actually contains the native WebView (it needs a rebuilt APK).
// Checked up front so nothing is rendered (and no error appears) when it is missing.
let _nativeOk = null;
const webViewAvailable = () => {
  if (_nativeOk === null) {
    try { _nativeOk = !!TurboModuleRegistry.get('RNCWebViewModule'); } catch { _nativeOk = false; }
  }
  return _nativeOk;
};

const hostOf = (url) => {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return ''; }
};

class WebBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail?.(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function ReaderWebView({ url, webRef, onProgress, onNav, onError }) {
  // required lazily so a build without the native module cannot crash at import time
  const { WebView } = require('react-native-webview');
  return (
    <WebView
      ref={webRef}
      source={{ uri: url }}
      style={{ flex: 1, backgroundColor: 'transparent' }}
      onLoadProgress={({ nativeEvent }) => onProgress(nativeEvent.progress)}
      onNavigationStateChange={onNav}
      onError={onError}
      onHttpError={() => {}}
      setSupportMultipleWindows={false}
      allowsBackForwardNavigationGestures
      startInLoadingState={false}
      javaScriptEnabled
      domStorageEnabled
      pullToRefreshEnabled
    />
  );
}

export default function ArticleReader({ data, onClose }) {
  const dark = useThemeStore((s) => s.resolvedTheme === 'dark');
  const webRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false, url: '', title: '' });
  const [failed, setFailed] = useState(false);
  const nativeOk = webViewAvailable();
  const visible = !!data && nativeOk;

  // No native WebView in this build: open the phone browser straight away, with no error screen
  useEffect(() => {
    if (data && !nativeOk) {
      Linking.openURL(data.url).catch(() => {});
      onClose();
    }
  }, [data?.url, nativeOk]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (data) { setProgress(0); setNav({ canGoBack: false, canGoForward: false, url: data.url, title: '' }); setFailed(false); }
  }, [data?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const openExternal = () => { if (data?.url) Linking.openURL(data.url).catch(() => {}); };

  // Native WebView missing in this build -> use the phone browser as a graceful fallback
  const handleBoundaryFail = () => {
    if (data?.url) Linking.openURL(data.url).catch(() => {});
    onClose();
  };

  const handleBack = () => {
    if (nav.canGoBack && webRef.current) { webRef.current.goBack(); return true; }
    onClose();
    return true;
  };

  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [visible, nav.canGoBack]); // eslint-disable-line react-hooks/exhaustive-deps

  const shareLink = async () => {
    try { await Share.share({ message: `${data?.title ? `${data.title}\n` : ''}${nav.url || data?.url}` }); } catch { /* ignore */ }
  };

  const C = {
    bg: dark ? '#0C0D10' : '#FFFFFF',
    bar: dark ? '#16181D' : '#F5F6FA',
    text: dark ? '#F2F2F5' : '#14171F',
    sub: dark ? '#8E9099' : '#6B7280',
    border: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
  };
  const host = hostOf(nav.url || data?.url || '');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleBack} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: C.bg }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        <LinearGradient colors={dark ? ['#2A2650', '#16141F'] : ['#5B4BE8', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <TouchableOpacity style={styles.hBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={styles.hTitle} numberOfLines={1}>{data?.source || host || 'Story'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Ionicons name="lock-closed" size={10} color="rgba(255,255,255,0.75)" />
              <Text style={styles.hHost} numberOfLines={1}>{host}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.hBtn} onPress={shareLink} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="share-outline" size={19} color="#FFF" />
          </TouchableOpacity>
        </LinearGradient>

        {/* loading progress */}
        <View style={{ height: 3, backgroundColor: 'transparent' }}>
          {progress > 0 && progress < 1 ? (
            <LinearGradient colors={['#7C3AED', '#22D3EE']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 3, width: `${Math.max(6, progress * 100)}%` }} />
          ) : null}
        </View>

        <View style={{ flex: 1 }}>
          {visible ? (
            <WebBoundary onFail={handleBoundaryFail}>
              {failed ? (
                <View style={styles.errWrap}>
                  <View style={[styles.errIcon, { backgroundColor: C.bar }]}><Ionicons name="cloud-offline" size={32} color={C.sub} /></View>
                  <Text style={[styles.errTitle, { color: C.text }]}>Couldn't open this page</Text>
                  <Text style={[styles.errSub, { color: C.sub }]}>Check your connection and try again.</Text>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => { setFailed(false); webRef.current?.reload?.(); }}>
                    <LinearGradient colors={['#7C3AED', '#5B4BE8']} style={styles.retry}><Text style={styles.retryText}>Try again</Text></LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : (
                <ReaderWebView url={data.url} webRef={webRef} onProgress={setProgress} onNav={(s) => setNav({ canGoBack: s.canGoBack, canGoForward: s.canGoForward, url: s.url || data.url, title: s.title || '' })} onError={() => setFailed(true)} />
              )}
              {progress === 0 && !failed ? (
                <View style={styles.firstLoad} pointerEvents="none"><ActivityIndicator color="#7C3AED" /></View>
              ) : null}
            </WebBoundary>
          ) : null}
        </View>

        {/* bottom toolbar */}
        <View style={[styles.toolbar, { backgroundColor: C.bar, borderTopColor: C.border }]}>
          <TouchableOpacity style={styles.tBtn} disabled={!nav.canGoBack} onPress={() => webRef.current?.goBack()}>
            <Ionicons name="chevron-back" size={22} color={nav.canGoBack ? C.text : C.sub} style={{ opacity: nav.canGoBack ? 1 : 0.4 }} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.tBtn} disabled={!nav.canGoForward} onPress={() => webRef.current?.goForward()}>
            <Ionicons name="chevron-forward" size={22} color={nav.canGoForward ? C.text : C.sub} style={{ opacity: nav.canGoForward ? 1 : 0.4 }} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.tBtn} onPress={() => { setFailed(false); webRef.current?.reload(); }}>
            <Ionicons name="refresh" size={20} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.tBtn} onPress={openExternal}>
            <Ionicons name="open-outline" size={20} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingTop: 46, paddingBottom: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  hBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  hTitle: { color: '#FFF', fontSize: 15.5, fontWeight: '800' },
  hHost: { color: 'rgba(255,255,255,0.75)', fontSize: 11.5, marginLeft: 4, flexShrink: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 6, paddingBottom: 14, borderTopWidth: StyleSheet.hairlineWidth },
  tBtn: { width: 56, height: 40, alignItems: 'center', justifyContent: 'center' },
  firstLoad: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  errWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  errIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  errTitle: { fontSize: 18, fontWeight: '800' },
  errSub: { fontSize: 14, textAlign: 'center', marginTop: 6 },
  retry: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 22, marginTop: 20 },
  retryText: { color: '#FFF', fontWeight: '800' },
});
