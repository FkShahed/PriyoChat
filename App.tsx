import React, { useEffect } from 'react';
import { StatusBar, AppState, Linking, BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import useAuthStore from './src/store/useAuthStore';
import useSocketStore from './src/store/useSocketStore';
import useCallStore from './src/store/useCallStore';
import NotificationService from './src/services/NotificationService';
import { ensureAppPermissions } from './src/utils/permissionHelper';
import { navigationRef } from './src/navigation/navigationRef';
import { setPendingAutoAccept } from './src/utils/callActionFlag';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Notification action buttons already processed (avoids duplicate handling of the same deep link)
const handledCallActions = new Set<string>();

/**
 * "Decline" pressed on the native incoming-call notification while the app UI is not running.
 * Sends call_reject to the caller via the socket, then sends the app back to the background.
 */
async function declineCallFromNotification(from: string, callId: string, callType: string) {
  // If this device is already in another call, never touch that call: just tell the caller we are busy.
  const cs = useCallStore.getState().callState;
  const inAnotherCall = cs === 'active' || cs === 'connecting' || cs === 'calling' || cs === 'ringing';
  try {
    if (from) {
      let socket = useSocketStore.getState().socket;
      if (!socket || !socket.connected) {
        socket = (await useSocketStore.getState().connect()) || useSocketStore.getState().socket;
      }
      if (socket) {
        socket.emit('call_reject', {
          to: from,
          callId,
          callType,
          ...(inAnotherCall ? { reason: 'busy' } : {}),
        });
      }
    }
  } catch (e: any) {
    console.warn('[App] Decline from notification error:', e?.message);
  }
  if (inAnotherCall) return;
  // Give the socket a moment to flush the reject, then close the (briefly opened) app UI
  setTimeout(() => BackHandler.exitApp(), 1000);
}

export default function App() {
  const { isLoading, isAuthenticated, restoreSession } = useAuthStore();
  const { connect } = useSocketStore();
  const callState = useCallStore((s) => s.callState);

  // Deep linking listener for full-screen incoming call intent
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      if (url.includes('call')) {
        let autoAcceptCall = false;
        let directAcceptParams: { callType: string } | null = null;
        try {
          const queryString = url.split('?')[1] || '';
          const params = new URLSearchParams(queryString);
          const callId = params.get('callId') || '';
          const callerName = params.get('callerName') || 'PriyoChat User';
          const callType = (params.get('callType') || 'audio') as 'audio' | 'video';
          const from = params.get('from') || '';
          const callAction = params.get('action') || '';
          // SDP offer shipped inside the push by the server (small audio offers only). Optional:
          // when missing, the call flow fetches the offer over the socket exactly as before.
          let pushedOffer: any = undefined;
          try {
            const rawOffer = params.get('offer');
            if (rawOffer) {
              const parsedOffer = JSON.parse(rawOffer);
              if (parsedOffer && typeof parsedOffer.sdp === 'string' && parsedOffer.sdp.length > 0) {
                pushedOffer = parsedOffer;
              }
            }
          } catch (e) {
            pushedOffer = undefined;
          }

          // ── Decline button on the native incoming-call notification ──
          // Reject the call over the socket (so the caller's call ends too), then close the app UI.
          if (callAction === 'decline') {
            const key = `${callId}:decline`;
            if (handledCallActions.has(key)) return;
            handledCallActions.add(key);
            declineCallFromNotification(from, callId, callType);
            return;
          }

          if (callAction === 'accept') {
            const key = `${callId}:accept`;
            if (handledCallActions.has(key)) return;
            handledCallActions.add(key);
            autoAcceptCall = true;
          }

          if (callId || from) {
            const accepted = useCallStore.getState().setIncomingCall({
              callId,
              from,
              callerName,
              caller: { _id: from, name: callerName },
              callType,
              ...(pushedOffer ? { offer: pushedOffer } : {}),
            });
            // "Answer" button: go straight into the call (same as the proven in-app accept) without
            // showing the ringing screen, so there is no second ringtone or flicker.
            if (callAction === 'accept') {
              if (accepted === false) {
                autoAcceptCall = false;
              } else {
                useCallStore.getState().setCallAccepted();
                directAcceptParams = { callType };
              }
            }
          }
        } catch (e: any) {
          console.warn('[App] Error parsing deep link call url:', e.message);
        }

        // Proactively trigger socket connection immediately so socket is ready when CallScreen mounts
        try {
          useSocketStore.getState().connect();
        } catch (e) {}

        const navigateToCall = () => {
          if (navigationRef.isReady()) {
            if (directAcceptParams) {
              // Already accepted above: open the call screen directly
              const st = useCallStore.getState();
              (navigationRef as any).navigate('Call', {
                otherUser: st.remoteUser,
                callType: directAcceptParams.callType,
              });
            } else {
              // Fallback (call could not be accepted directly): normal incoming screen, which
              // still honours the Answer press via the short-lived flag.
              if (autoAcceptCall) setPendingAutoAccept();
              (navigationRef as any).navigate('IncomingCall', autoAcceptCall ? { autoAccept: true } : undefined);
            }
          } else {
            setTimeout(navigateToCall, 200);
          }
        };
        navigateToCall();
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  // Proactively check and enforce permissions on launch and whenever user re-enters the app
  useEffect(() => {
    ensureAppPermissions();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        ensureAppPermissions();
      }
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    restoreSession().then(() => {
      if (useAuthStore.getState().isAuthenticated) {
        connect();
        NotificationService.initialize(); // register push token
      }
    });
    return () => NotificationService.cleanup();
  }, []);

  // Dismiss call notification when call is accepted or ended
  useEffect(() => {
    if (callState === 'active' || callState === 'idle' || callState === 'ended') {
      NotificationService.dismissCallNotification();
    }
  }, [callState]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
