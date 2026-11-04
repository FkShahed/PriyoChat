import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import LogoSVG from '../../components/common/LogoSVG';
import useThemeStore, { useColors } from '../../store/useThemeStore';

const UPDATED = 'November 2026';

const CONTENT = {
  about: {
    title: 'About',
    icon: 'information-circle',
    sections: [
      {
        heading: 'PriyoChat',
        body: 'PriyoChat is a fast, simple messaging app with high-quality voice and video calling. Stay close to the people who matter, with reliable calls, instant messages and a clean, distraction-free experience.',
      },
      {
        heading: 'What you can do',
        bullets: [
          'Send messages, photos and files to friends',
          'Make crystal-clear voice and video calls',
          'Answer or decline calls right from the notification',
          'Choose your own ringtone and light or dark theme',
        ],
      },
      {
        heading: 'Built by',
        body: 'PriyoChat is designed and developed by Fazlul Karim Shahed.',
      },
      {
        heading: 'Feedback',
        body: 'Found a problem or have an idea? Use "Report a Bug" in Settings and tell us. We read every report.',
      },
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    icon: 'document-text',
    sections: [
      {
        heading: '1. Acceptance of terms',
        body: 'By creating an account or using PriyoChat you agree to these Terms & Conditions. If you do not agree, please do not use the app.',
      },
      {
        heading: '2. Your account',
        body: 'You are responsible for keeping your login details safe and for everything that happens under your account. Provide accurate information and do not share your account with others.',
      },
      {
        heading: '3. Acceptable use',
        body: 'You agree not to use PriyoChat to:',
        bullets: [
          'Harass, threaten, abuse or impersonate anyone',
          'Send spam, scams, malware or illegal content',
          'Share content that is hateful, violent or sexually explicit involving minors',
          'Try to break, overload or gain unauthorised access to the service',
        ],
      },
      {
        heading: '4. Your content',
        body: 'You own the messages and media you send. You are responsible for what you share, and you must have the right to share it. We may remove content that breaks these terms.',
      },
      {
        heading: '5. Calls',
        body: 'Voice and video calls require microphone and camera access. Call quality depends on your network connection. Do not record or share a call without the consent of everyone on it, where required by law.',
      },
      {
        heading: '6. Account suspension',
        body: 'We may warn, suspend or permanently ban accounts that violate these terms or harm other users, with or without prior notice.',
      },
      {
        heading: '7. Availability',
        body: 'We work hard to keep PriyoChat running, but the service is provided "as is" without guarantees. It may be interrupted for maintenance or updates, and features may change over time.',
      },
      {
        heading: '8. Limitation of liability',
        body: 'To the extent permitted by law, PriyoChat and its developer are not liable for indirect losses or for any loss of data or messages arising from use of the app.',
      },
      {
        heading: '9. Changes to these terms',
        body: 'We may update these terms from time to time. Continuing to use the app after a change means you accept the updated terms.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    icon: 'shield-checkmark',
    sections: [
      {
        heading: 'Your privacy matters',
        body: 'This policy explains what information PriyoChat collects, why, and the choices you have.',
      },
      {
        heading: 'Information we collect',
        bullets: [
          'Account details: your name, email, profile photo and status message',
          'Content: the messages, photos and files you send',
          'Call data: call history and basic connection details needed to set up calls',
          'Device data: a push-notification token so we can alert you about messages and calls',
        ],
      },
      {
        heading: 'How we use it',
        bullets: [
          'To deliver your messages and connect your calls',
          'To send you notifications about new messages and incoming calls',
          'To keep the service safe, prevent abuse and fix bugs',
        ],
      },
      {
        heading: 'Device permissions',
        body: 'PriyoChat asks for permissions only for features you use:',
        bullets: [
          'Microphone and camera: for voice and video calls',
          'Notifications: for messages and incoming calls',
          'Photos and files: to send media and set a profile picture or ringtone',
        ],
        footer: 'You can change any permission at any time in Settings or your device settings.',
      },
      {
        heading: 'Calls',
        body: 'Calls are connected directly between devices whenever possible. When a direct connection is not possible, call traffic may pass through our relay server to connect you. We do not record your calls.',
      },
      {
        heading: 'Sharing',
        body: 'We do not sell your personal information. Data is shared only with the people you communicate with and with service providers needed to run the app, such as push-notification delivery.',
      },
      {
        heading: 'Security',
        body: 'We use industry-standard measures such as encrypted connections to protect your information. No system is perfectly secure, so please keep your password private.',
      },
      {
        heading: 'Your choices',
        body: 'You can edit your profile at any time and log out whenever you like. To request deletion of your account and data, contact us through "Report a Bug" in Settings.',
      },
      {
        heading: 'Changes to this policy',
        body: 'We may update this policy from time to time. The latest version will always be available in the app.',
      },
    ],
  },
};

export default function InfoScreen({ navigation, route }) {
  const baseC = useColors();
  const isDark = useThemeStore((s) => s.resolvedTheme === 'dark');
  const C = isDark
    ? { ...baseC, bg: '#0C0D10', surface: '#16181D', text: '#F2F2F5', textSecondary: '#8E9099', border: 'rgba(255,255,255,0.08)' }
    : baseC;

  const type = route?.params?.type || 'about';
  const page = CONTENT[type] || CONTENT.about;
  const version = Constants.expoConfig?.version || '';

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />

      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.text }]}>{page.title}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          {type === 'about' ? (
            <View style={styles.logoWrap}>
              <LogoSVG size={96} />
            </View>
          ) : (
            <LinearGradient colors={['#0084FF', '#00C6FF']} style={styles.heroIcon}>
              <Ionicons name={page.icon} size={34} color="#FFF" />
            </LinearGradient>
          )}
          <Text style={[styles.heroTitle, { color: C.text }]}>
            {type === 'about' ? 'PriyoChat' : page.title}
          </Text>
          <Text style={[styles.heroSub, { color: C.textSecondary }]}>
            {type === 'about' ? (version ? `Version ${version}` : '') : `Last updated: ${UPDATED}`}
          </Text>
        </View>

        {page.sections.map((s, i) => {
          const tappable = type === 'about' && s.heading === 'Feedback';
          const Wrapper = tappable ? TouchableOpacity : View;
          return (
          <Wrapper
            key={i}
            style={[styles.card, { backgroundColor: C.surface, borderColor: tappable ? '#0084FF' : C.border }]}
            {...(tappable ? { activeOpacity: 0.7, onPress: () => navigation.navigate('ReportBug') } : {})}
          >
            <View style={styles.headingRow}>
              <Text style={[styles.heading, { color: C.text, marginBottom: 0 }]}>{s.heading}</Text>
              {tappable && <Ionicons name="chevron-forward" size={18} color="#0084FF" />}
            </View>
            <View style={{ height: 6 }} />
            {s.body ? <Text style={[styles.body, { color: C.textSecondary }]}>{s.body}</Text> : null}
            {s.bullets?.map((b, j) => (
              <View key={j} style={styles.bulletRow}>
                <View style={styles.dot} />
                <Text style={[styles.body, { color: C.textSecondary, flex: 1, marginTop: 0 }]}>{b}</Text>
              </View>
            ))}
            {s.footer ? <Text style={[styles.body, { color: C.textSecondary }]}>{s.footer}</Text> : null}
          </Wrapper>
          );
        })}

        <Text style={[styles.footer, { color: C.textSecondary }]}>© {new Date().getFullYear()} PriyoChat. All rights reserved.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4, width: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 48 },
  hero: { alignItems: 'center', paddingVertical: 18 },
  logoWrap: { width: 96, height: 96, marginBottom: 12 },
  heroIcon: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTitle: { fontSize: 22, fontWeight: '800' },
  heroSub: { fontSize: 13, marginTop: 4 },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginTop: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  reportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0084FF', borderRadius: 12, paddingVertical: 11, marginTop: 12,
  },
  reportBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 21, marginTop: 2 },
  bulletRow: { flexDirection: 'row', gap: 10, marginTop: 6, alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#0084FF', marginTop: 8 },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 24, opacity: 0.7 },
});
