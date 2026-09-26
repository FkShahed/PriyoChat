module.exports = {
  dependencies: {
    'react-native-callkeep': {
      platforms: {
        android: null, // disable Android autolinking for react-native-callkeep to prevent RN 0.76 TurboModule ParsingException
      },
    },
  },
};
