import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default class CallErrorBoundary extends React.Component {
  state = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[CallScreen Crash Caught]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleDismiss = () => {
    this.setState({ hasError: false, error: null });
    try {
      const useCallStore = require('../store/useCallStore').default;
      useCallStore.getState().resetCall();
    } catch (e) {}
    if (this.props.navigation?.canGoBack?.()) {
      this.props.navigation.goBack();
    } else {
      this.props.navigation?.reset?.({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="alert-circle" size={54} color="#FF3B30" />
          <Text style={styles.title}>Call Screen Error</Text>
          <Text style={styles.message}>
            {this.state.error?.message || 'An unexpected rendering error occurred during call.'}
          </Text>
          <Text style={styles.stack} numberOfLines={8}>
            {this.state.error?.stack || String(this.state.error)}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={this.handleDismiss}>
            <Text style={styles.btnText}>Return to Chats</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070B19',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  message: {
    color: '#FF6B6B',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  stack: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  btn: {
    backgroundColor: '#1D6FEB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  btnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 15,
  },
});

