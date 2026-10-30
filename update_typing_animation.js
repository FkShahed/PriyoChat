const fs = require('fs');

let code = fs.readFileSync('src/screens/chat/ChatScreen.js', 'utf8');

const startTag = 'function TypingIndicator({ theme }) {';
const endTag = 'let PinchGestureHandler, PanGestureHandler, State, Swipeable;';

const startIdx = code.indexOf(startTag);
const endIdx = code.indexOf(endTag);

if (startIdx !== -1 && endIdx !== -1) {
  const newComp = `function TypingIndicator({ theme, recipientUser }) {
  // Eye-soothing wave-bounce animation and opacity transition
  const anims = [
    React.useRef(new RNAnimated.Value(0)).current,
    React.useRef(new RNAnimated.Value(0)).current,
    React.useRef(new RNAnimated.Value(0)).current,
  ];

  React.useEffect(() => {
    const makeWave = (anim, delay) => {
      return RNAnimated.sequence([
        RNAnimated.delay(delay),
        RNAnimated.loop(
          RNAnimated.sequence([
            RNAnimated.timing(anim, {
              toValue: 1,
              duration: 360,
              useNativeDriver: true,
            }),
            RNAnimated.timing(anim, {
              toValue: 0,
              duration: 360,
              useNativeDriver: true,
            }),
            RNAnimated.delay(260),
          ])
        ),
      ]);
    };
    const loops = anims.map((a, i) => makeWave(a, i * 160));
    RNAnimated.parallel(loops).start();
  }, []);

  const dotColor = theme.receivedText || '#8E8E93';

  return (
    <View style={styles.typingContainerRow}>
      {/* Recipient avatar aligned with other received messages */}
      {recipientUser?.avatar ? (
        <Image source={{ uri: recipientUser.avatar }} style={styles.senderAvatar} />
      ) : (
        <LinearGradient
          colors={['#0084FF', '#0040CC']}
          style={[styles.senderAvatar, { alignItems: 'center', justifyContent: 'center' }]}
        >
          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 11 }}>
            {getInitials(recipientUser?.name || 'User')}
          </Text>
        </LinearGradient>
      )}

      <View style={[styles.typingWrapper, { backgroundColor: theme.receivedBubble }]}>
        {anims.map((anim, idx) => {
          const translateY = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -4.5],
          });
          const opacity = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.4, 1.0],
          });
          const scale = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.85, 1.15],
          });
          return (
            <RNAnimated.View
              key={idx}
              style={[
                styles.dot,
                {
                  backgroundColor: dotColor,
                  transform: [{ translateY }, { scale }],
                  opacity,
                  marginHorizontal: 3,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

`;

  code = code.substring(0, startIdx) + newComp + code.substring(endIdx);
  fs.writeFileSync('src/screens/chat/ChatScreen.js', code, 'utf8');
  console.log('Successfully updated TypingIndicator function');
} else {
  console.log('Could not find start/end indices');
}

// Update ListHeaderComponent to pass recipientUser to TypingIndicator
const listHeaderOld = 'ListHeaderComponent={isTyping ? <TypingIndicator theme={theme} /> : null}';
const listHeaderNew = 'ListHeaderComponent={isTyping ? <TypingIndicator theme={theme} recipientUser={recipientUser} /> : null}';

if (code.includes(listHeaderOld)) {
  code = code.replace(listHeaderOld, listHeaderNew);
  fs.writeFileSync('src/screens/chat/ChatScreen.js', code, 'utf8');
  console.log('Successfully updated ListHeaderComponent');
} else {
  console.log('ListHeaderComponent target not found');
}

// Update styles for typingContainerRow & typingWrapper
const oldStyle = `  typingWrapper: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 18, alignSelf: 'flex-start', marginLeft: 12, marginBottom: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },`;

const newStyle = `  typingContainerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    alignSelf: 'flex-start',
    marginLeft: 4,
    marginVertical: 4,
  },
  typingWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 4, // natural message bubble corner matching recipient bubble
    minHeight: 36,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },`;

if (code.includes(oldStyle)) {
  code = code.replace(oldStyle, newStyle);
  fs.writeFileSync('src/screens/chat/ChatScreen.js', code, 'utf8');
  console.log('Successfully updated typing styles');
} else {
  console.log('Old typing style not matched');
}

