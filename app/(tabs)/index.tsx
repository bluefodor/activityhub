import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
export default function ActivitiesScreen() {
  // Default landing tab; notification click-through is handled in useNotifications
  useFocusEffect(
    useCallback(() => {
      router.replace('/(tabs)/forum');
    }, [])
  );

  // Show loading state while redirecting
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.text}>Redirecting...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
});
