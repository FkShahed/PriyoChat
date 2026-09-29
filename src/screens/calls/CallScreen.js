import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, Vibration, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Animated as RNAnimated } from 'react-native';
import { Audio } from 'expo-av';
import useCallStore from '../../store/useCallStore';
import useSocketStore from '../../store/useSocketStore';
import useWebRTCCall from '../../hooks/useWebRTCCall';
import { getInitials } from '../../utils/helpers';
import { webrtc } from '../../utils/nativeModules';

// Universal VideoStreamView for Web (HTML5 video) and Mobile (RTCView)
function VideoStreamView({ stream, isLocal = false, mirror = false, zOrder = 0, style, revision = 0 }) {
  const videoRef = useRef(null);
  const videoTrackId = stream?.getVideoTracks?.()?.[0]?.id || '';
  const trackCount = stream?.getTracks?.()?.length || 0;

  useEffect(() => {
    if (Platform.OS === 'web' && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((e) => {
        console.warn('[WebVideo] play error:', e?.message);
      });
    }
  }, [stream, revision, videoTrackId, trackCount]);

  const shouldMirror = isLocal && Boolean(mirror);

  if (Platform.OS === 'web') {
    if (!stream) return null;
    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={true}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: shouldMirror ? 'scaleX(-1)' : 'none',
          backgroundColor: '#000',
          ...style,
        }}
      />
    );
  }

  if (webrtc && webrtc.RTCView && stream) {
    const RTCViewComp = webrtc.RTCView;
    let streamURL = '';
    if (typeof stream.toURL === 'function') {
      try { streamURL = stream.toURL(); } catch (e) {}
    }
    if (!streamURL && stream.streamURL) {
      streamURL = stream.streamURL;
    }
    if (!streamURL && typeof stream === 'string') {
      streamURL = stream;
    }

    if (!streamURL) return null;

    // Composite key changes when stream, video track, or revision bumps,
    // ensuring Android RTCView remounts and binds to the active video sink
    const key = `${streamURL}_${isLocal ? 'loc' : 'rem'}_${videoTrackId || 'notrack'}_${revision}`;

    return (
      <RTCViewComp
        key={key}
        streamURL={streamURL}
        style={style}
        objectFit="cover"
        mirror={shouldMirror}
        zOrder={zOrder}
        zOrderMediaOverlay={isLocal}
      />
    );
  }

  return null;
}

// Dedicated Web Remote Audio player to ensure incoming audio is played
// on Web for both audio calls and video calls without autoplay restrictions.
function WebRemoteAudio({ stream }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !stream || !audioRef.current) return;
    const audioEl = audioRef.current;

    try {
      audioEl.srcObject = stream;
      audioEl.volume = 1.0;
      audioEl.muted = false;

      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('[WebRemoteAudio] Audio playing successfully on Web');
          })
          .catch((err) => {
            console.warn('[WebRemoteAudio] Autoplay blocked, waiting for interaction:', err?.message);
            const resumeAudio = () => {
              if (audioEl) {
                audioEl.muted = false;
                audioEl.play().catch(() => {});
              }
              window.removeEventListener('click', resumeAudio);
              window.removeEventListener('touchstart', resumeAudio);
              window.removeEventListener('keydown', resumeAudio);
            };
            window.addEventListener('click', resumeAudio, { once: true });
            window.addEventListener('touchstart', resumeAudio, { once: true });
            window.addEventListener('keydown', resumeAudio, { once: true });
          });
      }
    } catch (e) {
      console.warn('[WebRemoteAudio] setup error:', e);
    }
  }, [stream]);

  if (Platform.OS !== 'web' || !stream) return null;

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
    />
  );
}

function formatDuration(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function CallScreen({ route, navigation }) {
  const { otherUser: paramOtherUser, callType: paramCallType } = route?.params || {};
  const { remoteUser: storeRemoteUser, callType: storeCallType, callState, isReceiver, offer, resetCall } = useCallStore();

  const otherUser = paramOtherUser || storeRemoteUser || { name: 'PriyoChat User', avatar: null };
  const callType = paramCallType || storeCallType || 'audio';
  console.log('[CallScreen] otherUser:', otherUser?._id, otherUser?.name, 'isReceiver:', isReceiver);
  const { emit } = useSocketStore();

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteTrackVersion, setRemoteTrackVersion] = useState(0);
  const [hasRemoteVideoState, setHasRemoteVideoState] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(callType === 'video');
  const [videoOn, setVideoOn] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [cameraFront, setCameraFront] = useState(true);

  const ringAnim = useRef(new RNAnimated.Value(0)).current;
  const ripple1 = useRef(new RNAnimated.Value(0)).current;
  const ripple2 = useRef(new RNAnimated.Value(0)).current;
  const ripple3 = useRef(new RNAnimated.Value(0)).current;
  const loopRef = useRef(null);
  const timerRef = useRef(null);
  const hasNavigatedBack = useRef(false);
  const targetUserId =
    (typeof otherUser === 'string' ? otherUser : (otherUser?._id || otherUser?.id)) ||
    (typeof storeRemoteUser === 'string' ? storeRemoteUser : (storeRemoteUser?._id || storeRemoteUser?.id)) ||
    useCallStore.getState().remoteUserId;

  // ── WebRTC ────────────────────────────────────────────────────────
  const { cleanup: cleanupWebRTC, setSpeaker, connectionState, iceConnectionState, errorMessage } = useWebRTCCall({
    remoteUserId: targetUserId,
    callType,
    isReceiver,
    offer,
    onLocalStream: useCallback((s) => {
      console.log('[CallScreen] Local stream received');
      setLocalStream(s);
    }, []),
    onRemoteStream: useCallback((s, timestamp, hasVideo) => {
      console.log('[CallScreen] Remote stream received, tracks:', s?.getTracks?.().length, 'hasVideo:', hasVideo);
      setRemoteStream(s);
      setRemoteTrackVersion(timestamp || Date.now());
      if (hasVideo != null) {
        setHasRemoteVideoState(Boolean(hasVideo));
      } else {
        const vTracks = s?.getVideoTracks?.() || [];
        setHasRemoteVideoState(vTracks.some((t) => t.enabled !== false && t.readyState !== 'ended'));
      }

      if (s && typeof s.addEventListener === 'function') {
        const checkTracks = () => {
          setRemoteTrackVersion(Date.now());
          const vTracks = s?.getVideoTracks?.() || [];
          setHasRemoteVideoState(vTracks.some((t) => t.enabled !== false && t.readyState !== 'ended'));
        };
        s.addEventListener('addtrack', checkTracks);
        s.addEventListener('removetrack', checkTracks);
      }
    }, []),
  });

  // ── Ripple animation ─────────────────────────────────────────────
  useEffect(() => {
    const DURATION = 2000; // one ripple cycle

    const makeRipple = (anim, delay) =>
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.delay(delay),
          RNAnimated.timing(anim, {
            toValue: 1,
            duration: DURATION,
            useNativeDriver: true,
          }),
          RNAnimated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );

    const a1 = makeRipple(ripple1, 0);
    const a2 = makeRipple(ripple2, DURATION / 3);
    const a3 = makeRipple(ripple3, (DURATION / 3) * 2);

    a1.start(); a2.start(); a3.start();

    if (!isReceiver) {
      Vibration.vibrate([0, 400, 200, 400]);
    }

    return () => {
      a1.stop(); a2.stop(); a3.stop();
      Vibration.cancel();
    };
  }, []);

  // ── Timer when active ─────────────────────────────────────────────
  useEffect(() => {
    if (callState === 'active') {
      loopRef.current?.stop();
      setCallDuration(0);
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  // ── Ringback tone (Outgoing call while waiting) ────────────────────
  useEffect(() => {
    if (isReceiver) return;
    const isDialing = callState === 'calling' || callState === 'ringing';
    if (!isDialing) return;
    let sound = null;
    let isCancelled = false;
    const play = async () => {
      try {
        if (isCancelled) return;
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: !speakerOn,
        });
        if (isCancelled) return;
        const { sound: s } = await Audio.Sound.createAsync(
          require('../../../assets/ringback.wav'),
          { shouldPlay: true, isLooping: true, volume: 1.0 }
        );
        if (isCancelled) {
          s.stopAsync().catch(() => {});
          s.unloadAsync().catch(() => {});
          return;
        }
        sound = s;
      } catch (e) {
        console.warn('[CallScreen] ringback error:', e);
      }
    };
    play();
    return () => {
      isCancelled = true;
      if (sound) {
        sound.stopAsync().catch(() => {});
        sound.unloadAsync().catch(() => {});
        sound = null;
      }
      try {
        Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true, // Keep it true so WebRTC audio doesn't drop when screen goes off!
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: !speakerOn,
        }).catch(() => {});
      } catch (e) {}
    };
  }, [callState, isReceiver, speakerOn]);

  // On Web: resume remote audio playback on any user interaction
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const unlockWebAudio = () => {
      const audios = document.querySelectorAll('audio');
      audios.forEach((a) => {
        if (a && a.srcObject && a.paused) {
          a.muted = false;
          a.play().catch(() => {});
        }
      });
    };
    window.addEventListener('click', unlockWebAudio);
    window.addEventListener('touchstart', unlockWebAudio);
    return () => {
      window.removeEventListener('click', unlockWebAudio);
      window.removeEventListener('touchstart', unlockWebAudio);
    };
  }, []);

  const navigateAway = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    }
  }, [navigation]);

  useEffect(() => {
    if (callState === 'calling' || callState === 'incoming' || callState === 'connecting' || callState === 'active') {
      hasNavigatedBack.current = false;
    }
  }, [callState]);

  const stopStream = (stream) => {
    if (!stream) return;
    try {
      stream.getTracks?.().forEach((t) => {
        try { t.enabled = false; } catch (e) {}
        try { t.stop(); } catch (e) {}
      });
    } catch (e) {}
  };

  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    remoteStreamRef.current = remoteStream;
  }, [remoteStream]);

  const performFullTeardown = useCallback((callerReason = 'unknown') => {
    console.log('[CallScreen] performFullTeardown called, reason:', callerReason, 'hasNavigatedBack:', hasNavigatedBack.current);
    if (hasNavigatedBack.current) return;
    hasNavigatedBack.current = true;
    Vibration.cancel();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopStream(localStreamRef.current);
    stopStream(remoteStreamRef.current);
    setLocalStream(null);
    setRemoteStream(null);
    setHasRemoteVideoState(false);
    try {
      const NotificationService = require('../../services/NotificationService').default;
      NotificationService.dismissCallNotification();
    } catch (e) {}
    try {
      const CallKeepService = require('../../services/CallKeepService').default;
      CallKeepService.endCall();
    } catch (e) {}
    
    // Release background audio session so the app can sleep now
    try {
      Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      }).catch(() => {});
    } catch (e) {}

    cleanupWebRTC();
    resetCall();
    if (callerReason !== 'unmount_safety') {
      navigateAway();
    }
  }, [cleanupWebRTC, resetCall, navigateAway]);

  const performFullTeardownRef = useRef(performFullTeardown);
  useEffect(() => {
    performFullTeardownRef.current = performFullTeardown;
  }, [performFullTeardown]);

  // ── Remote party ended/rejected ──────────────────────────────────
  // Track previous callState to ONLY trigger when transitioning from an in-call state to ended/idle.
  // Never trigger on initial mount!
  const prevCallStateRef = useRef(callState);
  useEffect(() => {
    const prev = prevCallStateRef.current;
    prevCallStateRef.current = callState;

    if (callState === 'calling' || callState === 'incoming' || callState === 'connecting' || callState === 'active' || callState === 'ringing') {
      hasNavigatedBack.current = false;
    }

    const wasInCall =
      prev === 'active' ||
      prev === 'calling' ||
      prev === 'connecting' ||
      prev === 'ringing' ||
      prev === 'incoming';

    if ((callState === 'ended' || callState === 'idle') && wasInCall && !hasNavigatedBack.current) {
      console.log('[CallScreen] Call ended transition detected (from', prev, 'to', callState, ') -> tearing down');
      performFullTeardownRef.current?.('remote_party_ended_transition');
    }
  }, [callState]);

  // Screen unmount safety cleanup (only on actual unmount!)
  useEffect(() => {
    return () => {
      console.log('[CallScreen] Component unmounting — executing unmount safety teardown');
      performFullTeardownRef.current?.('unmount_safety');
    };
  }, []);

  const handleEndCall = () => {
    if (hasNavigatedBack.current) return;
    const targetId = targetUserId || useCallStore.getState().remoteUserId;
    if (targetId) {
      emit('call_end', { to: targetId, callType, duration: callDuration });
    }
    performFullTeardown('user_end_button');
  };

  const toggleMute = () => {
    localStream?.getAudioTracks().forEach((t) => { t.enabled = muted; });
    setMuted((m) => !m);
  };

  const toggleVideo = () => {
    localStream?.getVideoTracks().forEach((t) => { t.enabled = !videoOn; });
    setVideoOn((v) => !v);
  };

  const toggleCamera = () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()?.[0];
    if (videoTrack && typeof videoTrack._switchCamera === 'function') {
      videoTrack._switchCamera();
      setCameraFront((f) => !f);
    }
  };

  const toggleControls = () => {
    setShowControls((c) => !c);
  };

  const makeRippleStyle = (anim) => ({
    transform: [{
      scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }),
    }],
    opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.5, 0] }),
  });

  const r1Style = makeRippleStyle(ripple1);
  const r2Style = makeRippleStyle(ripple2);
  const r3Style = makeRippleStyle(ripple3);

  const remoteVideoTracks = remoteStream && typeof remoteStream.getVideoTracks === 'function'
    ? remoteStream.getVideoTracks()
    : [];
  const hasRemoteVideo = (callType === 'video') && (
    hasRemoteVideoState ||
    (remoteVideoTracks.length > 0 && remoteVideoTracks.some((t) => t.enabled !== false && t.readyState !== 'ended'))
  );

  const getStatusLabel = () => {
    if (iceConnectionState === 'failed' || connectionState === 'failed') {
      return 'Connection Failed • Retrying...';
    }
    if (callState === 'active') {
      if (callType === 'video' && !hasRemoteVideo) {
        return `Voice Connected • ${formatDuration(callDuration)}`;
      }
      return formatDuration(callDuration);
    }
    if (callState === 'connecting' || connectionState === 'connecting' || iceConnectionState === 'checking') {
      return 'Connecting...';
    }
    if (callState === 'ringing') return 'Ringing...';
    if (isReceiver) return 'Connecting...';
    return 'Calling...';
  };
  const statusLabel = getStatusLabel();

  // ── VIDEO CALL layout ─────────────────────────────────────────────
  if (callType === 'video') {
    return (
      <View style={styles.videoContainer}>
        {/* On Web: dedicated unmuted audio playback for remote stream */}
        {Platform.OS === 'web' && remoteStream ? (
          <WebRemoteAudio stream={remoteStream} />
        ) : null}

        {/* Remote video (full screen) - rendered continuously once remoteStream exists */}
        {remoteStream ? (
          <VideoStreamView
            stream={remoteStream}
            isLocal={false}
            mirror={false}
            zOrder={0}
            style={styles.remoteVideo}
            revision={remoteTrackVersion}
          />
        ) : null}

        {/* Fallback overlay when remote video is not yet ready */}
        {!hasRemoteVideo && (
          <LinearGradient colors={['#070B19', '#0D1A3A', '#060A17']} style={StyleSheet.absoluteFill}>
            <View style={styles.waitingOverlay}>
              <View style={styles.waitingAvatarContainer}>
                {otherUser?.avatar ? (
                  <Image source={{ uri: otherUser.avatar }} style={styles.waitingAvatar} />
                ) : (
                  <LinearGradient colors={['#1D6FEB', '#00C6FF']} style={styles.waitingAvatarFallback}>
                    <Text style={styles.waitingInitials}>{getInitials(otherUser?.name || 'User')}</Text>
                  </LinearGradient>
                )}
              </View>
              <Text style={styles.waitingName}>{otherUser?.name || 'PriyoChat User'}</Text>
              <View style={styles.videoBadge}>
                <View style={callState === 'active' ? styles.activeDotSmall : styles.connectingDot} />
                <Text style={styles.waitingText}>{statusLabel}</Text>
              </View>

              {/* Informative diagnosis when audio is connected but video is still pending */}
              {callState === 'active' && (
                <View style={styles.videoWaitingSubBadge}>
                  <Ionicons name="videocam-outline" size={14} color="#00C6FF" />
                  <Text style={styles.videoWaitingSubText}>
                    {errorMessage || "Waiting for friend's camera video feed..."}
                  </Text>
                </View>
              )}
            </View>
          </LinearGradient>
        )}

        {/* Tap backdrop to toggle header & footer controls */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={toggleControls}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Local video (Picture-in-Picture) */}
        {localStream && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={toggleCamera}
            style={[
              styles.localVideoWrapper,
              callState === 'active' 
                ? { bottom: 125, right: 16 }
                : { top: 52, right: 16 } // Top-right during calling phase
            ]}
          >
            {videoOn ? (
              <VideoStreamView
                stream={localStream}
                isLocal={true}
                mirror={cameraFront}
                zOrder={1}
                style={styles.localVideo}
              />
            ) : (
              <View style={styles.cameraOffPlaceholder}>
                <Ionicons name="videocam-off-outline" size={26} color="rgba(255,255,255,0.6)" />
                <Text style={styles.cameraOffText}>Camera Off</Text>
              </View>
            )}
            <View style={styles.flipOverlayBtn}>
              <Ionicons name="camera-reverse-outline" size={14} color="#FFF" />
            </View>
          </TouchableOpacity>
        )}

        {/* Top Floating Glass Header */}
        {showControls && callState === 'active' && (
          <LinearGradient
            colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.35)', 'transparent']}
            style={styles.videoTopBar}
            pointerEvents="box-none"
          >
            <View style={styles.topHeaderContent}>
              <View style={styles.userInfoPill}>
                {otherUser?.avatar ? (
                  <Image source={{ uri: otherUser.avatar }} style={styles.headerAvatar} />
                ) : (
                  <View style={styles.headerAvatarFallback}>
                    <Text style={styles.headerInitials}>{getInitials(otherUser?.name || 'User')}</Text>
                  </View>
                )}
                <View>
                  <Text style={styles.videoName}>{otherUser?.name || 'PriyoChat User'}</Text>
                  <View style={styles.statusBadgeRow}>
                    {callState === 'active' && <View style={styles.activeDotSmall} />}
                    <Text style={styles.videoStatus}>{statusLabel}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Error / Diagnostic Notice Pill */}
            {(errorMessage || (callState === 'active' && !hasRemoteVideo)) ? (
              <View style={styles.diagNoticePill}>
                <Ionicons name="information-circle-outline" size={15} color="#FFCC00" />
                <Text style={styles.diagNoticeText} numberOfLines={1}>
                  {errorMessage || "Opposite person's video is connecting..."}
                </Text>
              </View>
            ) : null}
          </LinearGradient>
        )}

        {/* Bottom Floating Glass Action Bar */}
        {showControls && (
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.85)']}
            style={styles.videoControlsBg}
            pointerEvents="box-none"
          >
            <View style={styles.videoControlsLayout}>
              <View style={styles.videoUtilsPill}>
                {/* Mute Button */}
                <TouchableOpacity
                  style={[styles.videoCtrlCircle, muted && styles.videoCtrlCircleActive]}
                  onPress={toggleMute}
                >
                  <Ionicons name={muted ? 'mic-off' : 'mic-outline'} size={24} color={muted ? '#000' : '#FFF'} />
                </TouchableOpacity>

                {/* Camera Toggle Button */}
                <TouchableOpacity
                  style={[styles.videoCtrlCircle, !videoOn && styles.videoCtrlCircleActive]}
                  onPress={toggleVideo}
                >
                  <Ionicons name={videoOn ? 'videocam-outline' : 'videocam-off-outline'} size={24} color={!videoOn ? '#000' : '#FFF'} />
                </TouchableOpacity>

                {/* Speaker Toggle Button */}
                <TouchableOpacity
                  style={[styles.videoCtrlCircle, speakerOn && styles.videoCtrlCircleActive]}
                  onPress={() => { setSpeakerOn((s) => { const next = !s; setSpeaker?.(next); return next; }); }}
                >
                  <Ionicons name={speakerOn ? 'volume-high' : 'volume-medium-outline'} size={24} color={speakerOn ? '#000' : '#FFF'} />
                </TouchableOpacity>

                {/* Flip Camera Button */}
                <TouchableOpacity style={styles.videoCtrlCircle} onPress={toggleCamera}>
                  <Ionicons name="camera-reverse-outline" size={24} color="#FFF" />
                </TouchableOpacity>
              </View>

              {/* End Call Button */}
              <TouchableOpacity onPress={handleEndCall} activeOpacity={0.85} style={styles.endBtnVideoWrapper}>
                <LinearGradient colors={['#FF3B30', '#C0392B']} style={styles.endBtnVideo}>
                  <Ionicons name="call" size={30} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        )}
      </View>
    );
  }

  // ── AUDIO CALL layout ─────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      {/* On Web: dedicated unmuted audio playback for remote stream */}
      {Platform.OS === 'web' && remoteStream ? (
        <WebRemoteAudio stream={remoteStream} />
      ) : null}

      {/* Full blurred background — auth theme */}
      <LinearGradient
        colors={['#070B19', '#0D1A3A', '#060A17']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Ambient glow orbs matching auth theme */}
      <View style={styles.orbTopRight} />
      <View style={styles.orbBottomLeft} />

      {/* ── TOP SECTION: avatar + name + status ── */}
      <View style={styles.topSection}>
        {/* 3 staggered ripple rings expanding from avatar */}
        <RNAnimated.View style={[styles.rippleRing, r1Style]} />
        <RNAnimated.View style={[styles.rippleRing, r2Style]} />
        <RNAnimated.View style={[styles.rippleRing, r3Style]} />

        <View style={styles.avatarContainer}>
          {otherUser?.avatar ? (
            <Image source={{ uri: otherUser.avatar }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={['#1D6FEB', '#00C6FF']} style={styles.avatarFallback}>
              <Text style={styles.initials}>{getInitials(otherUser?.name || 'User')}</Text>
            </LinearGradient>
          )}
        </View>

        <Text style={styles.name}>{otherUser?.name || 'PriyoChat User'}</Text>

        <View style={styles.statusRow}>
          {callState === 'active' && <View style={styles.activeDot} />}
          <Text style={styles.callStatus}>{statusLabel}</Text>
        </View>

        {errorMessage ? (
          <View style={styles.diagNoticePill}>
            <Ionicons name="information-circle-outline" size={15} color="#FFCC00" />
            <Text style={styles.diagNoticeText} numberOfLines={3}>
              {errorMessage}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── BOTTOM SECTION: controls ── */}
      <View style={styles.bottomSection}>
        {/* Row 1: secondary controls */}
        <View style={styles.secondaryRow}>
          <View style={styles.ctrlItem}>
            <TouchableOpacity
              style={[styles.ctrlCircle, muted && styles.ctrlCircleOn]}
              onPress={toggleMute}
            >
              <Ionicons name={muted ? 'mic-off' : 'mic-outline'} size={26} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.ctrlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </View>

          <View style={styles.ctrlItem}>
            <TouchableOpacity
              style={[styles.ctrlCircle, speakerOn && styles.ctrlCircleOn]}
              onPress={() => { setSpeakerOn((s) => { const next = !s; setSpeaker?.(next); return next; }); }}
            >
              <Ionicons name={speakerOn ? 'volume-high' : 'volume-medium-outline'} size={26} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.ctrlLabel}>Speaker</Text>
          </View>
        </View>

        {/* Row 2: end call */}
        <View style={styles.endRow}>
          <TouchableOpacity onPress={handleEndCall} activeOpacity={0.85}>
            <LinearGradient
              colors={['#FF3B30', '#C0392B']}
              style={styles.endBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <Ionicons name="call" size={34} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Audio Call ──────────────────────────────────────────────────────
  orbTopRight: {
    position: 'absolute', top: -80, right: -100,
    width: 350, height: 350, borderRadius: 175,
    backgroundColor: 'rgba(0, 132, 255, 0.16)',
  },
  orbBottomLeft: {
    position: 'absolute', bottom: -100, left: -120,
    width: 400, height: 400, borderRadius: 200,
    backgroundColor: 'rgba(0, 198, 255, 0.10)',
  },
  topSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  rippleRing: {
    position: 'absolute',
    width: 140, height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(29, 111, 235, 0.6)',
    backgroundColor: 'rgba(29, 111, 235, 0.08)',
  },
  avatarContainer: {
    width: 130, height: 130,
    borderRadius: 65,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: 28,
    shadowColor: '#1D6FEB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  avatar: { width: '100%', height: '100%' },
  avatarFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  initials: { fontSize: 44, color: '#FFF', fontWeight: '800' },
  name: {
    fontSize: 28, fontWeight: '700', color: '#FFF',
    marginBottom: 10, letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  activeDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#34C759',
    shadowColor: '#34C759', shadowRadius: 4, shadowOpacity: 0.8,
  },
  callStatus: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15, letterSpacing: 0.5, fontWeight: '400',
  },

  // ── Controls ─────────────────────────────────────────────────────────
  bottomSection: {
    paddingBottom: 60,
    alignItems: 'center',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 56,
    marginBottom: 40,
  },
  ctrlItem: { alignItems: 'center', gap: 8 },
  ctrlCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  ctrlCircleOn: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  ctrlLabel: {
    color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '500',
  },
  endRow: { alignItems: 'center' },
  endBtn: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 14,
  },

  // ── Video Call ───────────────────────────────────────────────────────
  videoContainer: { flex: 1, backgroundColor: '#000' },
  remoteVideo: { flex: 1, backgroundColor: '#000' },
  localVideoWrapper: {
    position: 'absolute',
    width: 110, height: 160, borderRadius: 16,
    overflow: 'hidden', borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    zIndex: 10, elevation: 12, backgroundColor: '#161B22',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 10,
  },
  localVideo: { flex: 1, backgroundColor: '#000' },
  cameraOffPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A2332', gap: 6,
  },
  cameraOffText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '500' },
  flipOverlayBtn: {
    position: 'absolute', bottom: 6, right: 6,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  waitingOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingBottom: 80 },
  waitingAvatarContainer: { width: 110, height: 110, borderRadius: 55, overflow: 'hidden', marginBottom: 16 },
  waitingAvatar: { width: '100%', height: '100%', borderRadius: 55, borderWidth: 3, borderColor: '#00C6FF' },
  waitingAvatarFallback: { width: '100%', height: '100%', borderRadius: 55, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#00C6FF' },
  waitingInitials: { fontSize: 40, color: '#FFF', fontWeight: '800' },
  waitingName: { color: '#FFF', fontSize: 24, fontWeight: '700', marginBottom: 10 },
  videoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 4,
  },
  connectingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFCC00' },
  waitingText: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '400', letterSpacing: 0.5 },
  videoTopBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 52, paddingHorizontal: 20, paddingBottom: 28, zIndex: 8 },
  topHeaderContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  userInfoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1D6FEB', alignItems: 'center', justifyContent: 'center' },
  headerInitials: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  videoName: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  statusBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  activeDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759' },
  videoStatus: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '500' },
  videoControlsBg: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 30, paddingBottom: 44, zIndex: 8 },
  videoControlsLayout: {
    alignItems: 'center', gap: 20,
  },
  videoUtilsPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 36,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  videoCtrlCircle: {
    alignItems: 'center', justifyContent: 'center',
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'transparent',
  },
  videoCtrlCircleActive: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  ctrlLabelText: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '600' },
  endBtnVideoWrapper: { alignItems: 'center' },
  endBtnVideo: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.7, shadowRadius: 12, elevation: 10,
  },
  videoWaitingSubBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: 'rgba(0, 198, 255, 0.12)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(0, 198, 255, 0.25)',
  },
  videoWaitingSubText: {
    color: '#00C6FF', fontSize: 12, fontWeight: '600',
  },
  diagNoticePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, alignSelf: 'center', maxWidth: '88%',
    backgroundColor: 'rgba(0, 0, 0, 0.75)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 204, 0, 0.5)',
  },
  diagNoticeText: {
    color: '#FFCC00', fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'center',
  },
});

