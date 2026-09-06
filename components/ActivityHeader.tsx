import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActivityStore } from '@/store/useActivityStore';

export function ActivityHeader() {
  const { activity, emoji } = useActivityStore();

  const handleChangeActivity = () => {
    router.push('/(tabs)');
  };

  // Show "Activity Selection Needed" if no activity is selected
  if (!activity) {
    return (
      <TouchableOpacity style={styles.selectionNeededContainer} onPress={handleChangeActivity}>
        <Text style={styles.selectionNeededText}>Activity Selection Needed</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerAccent} />
      <View style={styles.content}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.textContainer}>
          <Text style={styles.activityName}>{activity}</Text>
          <Text style={styles.subtitle}>(activity selected)</Text>
        </View>
        <TouchableOpacity style={styles.changeButton} onPress={handleChangeActivity}>
                <Ionicons name="refresh" size={16} color="white" />
          <Text style={styles.changeButtonText}>Change Activity</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFBF00',
    paddingHorizontal: 20,
    paddingVertical: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  headerAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#FF8C42',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 24,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  activityName: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: 'white',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 140, 66, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 66, 1)',
  },
  selectionNeededContainer: {
    backgroundColor: '#FF8C42',
    paddingHorizontal: 20,
    paddingVertical: 16,
    margin: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectionNeededText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
    textAlign: 'center',
  },
  changeButtonText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
    marginLeft: 4,
  },
});