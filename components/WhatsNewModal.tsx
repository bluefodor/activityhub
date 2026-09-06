import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * One-time "what's new" announcement shown on the first app open after this
 * release. Add a new `key` (and update the body) when there's a new release
 * worth highlighting — past keys stay marked-as-seen so older announcements
 * never re-surface.
 */
const RELEASE = {
  key: 'whats_new_seen_2026_05_23',
  title: 'New update: We simplified!',
  body: 'Everything in one place.\nClick on Plans to see the full list, with pictures!',
  cta: 'Got it',
};

export function WhatsNewModal() {
  // No active announcement — return null until the next release worth highlighting.
  // Update RELEASE above and remove this early return to re-enable.
  return null;

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(RELEASE.key);
        if (!cancelled && seen !== '1') setVisible(true);
      } catch {
        // If AsyncStorage fails, fail closed (don't spam the user).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = async () => {
    setVisible(false);
    try {
      await AsyncStorage.setItem(RELEASE.key, '1');
    } catch {
      // Best-effort: if write fails the modal may show again next launch.
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="sparkles" size={26} color="#FF8C42" />
          </View>
          <Text style={styles.title}>{RELEASE.title}</Text>
          <Text style={styles.body}>{RELEASE.body}</Text>
          <TouchableOpacity style={styles.cta} onPress={dismiss} activeOpacity={0.85}>
            <Text style={styles.ctaText}>{RELEASE.cta}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    fontFamily: 'Inter_700Bold',
    color: '#222',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
  },
  cta: {
    backgroundColor: '#FF8C42',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 40,
    minWidth: 160,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
});
