/**
 * Dev / design preview: tutorial "spotlight" (dim everything except a cutout).
 * Open in Expo: navigate to /tutorial-spotlight-sample (or use the link on /debug).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import {
  tutorialSpotlightPath,
  TUTORIAL_SPOTLIGHT_DIM,
  type SpotlightHole,
} from '@/lib/tutorialSpotlight';

type Rect = SpotlightHole;

function SpotlightCutout({
  hole,
  children,
}: {
  hole: Rect | null;
  children?: React.ReactNode;
}) {
  const { width: sw, height: sh } = Dimensions.get('window');
  if (!hole || hole.width <= 0 || hole.height <= 0) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: TUTORIAL_SPOTLIGHT_DIM }]} pointerEvents="box-none">
        {children}
      </View>
    );
  }

  const d = tutorialSpotlightPath(sw, sh, hole);
  if (!d) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: TUTORIAL_SPOTLIGHT_DIM }]} pointerEvents="box-none">
        {children}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Svg width={sw} height={sh} style={StyleSheet.absoluteFill} pointerEvents="auto">
        <Path d={d} fill={TUTORIAL_SPOTLIGHT_DIM} fillRule="evenodd" />
      </Svg>
      {children}
    </View>
  );
}

export default function TutorialSpotlightSampleScreen() {
  const carouselRef = useRef<View>(null);
  const matchesRef = useRef<View>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [hole, setHole] = useState<Rect | null>(null);

  const measureStep = useCallback(() => {
    const ref = step === 1 ? carouselRef : matchesRef;
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        setHole({ x, y, width, height });
      });
    });
  }, [step]);

  useEffect(() => {
    measureStep();
    const t = setTimeout(measureStep, 250);
    const sub = Dimensions.addEventListener('change', measureStep);
    return () => {
      clearTimeout(t);
      sub?.remove();
    };
  }, [measureStep]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.pageTitle}>Fake home (layout only)</Text>
        <Text style={styles.pageSub}>
          Step {step}/2 — dimmed overlay with a cutout; no arrow. Tap Next.
        </Text>

        <View ref={carouselRef} collapsable={false} style={styles.fakeCarousel}>
          <Text style={styles.fakeCarouselLabel}>Ready Today carousel (fake)</Text>
          <View style={styles.fakeEmojiRow}>
            {['💤', '🏃', '🎾', '🥾'].map((e) => (
              <Text key={e} style={styles.fakeEmoji}>
                {e}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.spacer} />

        <View ref={matchesRef} collapsable={false} style={styles.fakeMatches}>
          <Text style={styles.matchesTitle}>Matches:</Text>
          <Text style={styles.fakeRow}>Alex · 0.4 mi · Beginner</Text>
          <Text style={styles.fakeRow}>Jordan · 1.1 mi · Intermediate</Text>
        </View>
      </SafeAreaView>

      <SpotlightCutout hole={hole}>
        <View
          style={[
            styles.bubble,
            { left: 16, right: 16 },
            step === 1 && hole
              ? { top: hole.y + hole.height + 14 }
              : hole
                ? { top: Math.max(72, hole.y - 168) }
                : { top: 120 },
          ]}
          pointerEvents="box-none"
        >
          <Text style={styles.bubbleTitle}>
            {step === 1 ? 'Pick what you want to do today' : 'See who’s active for that activity'}
          </Text>
          <Text style={styles.bubbleBody}>
            {step === 1
              ? 'The cutout highlights only the carousel. Everything else stays subdued.'
              : 'Same idea: only the Matches list stays clear while the rest is dimmed.'}
          </Text>
          <View style={styles.bubbleActions}>
            {step === 2 && (
              <TouchableOpacity onPress={() => setStep(1)} style={styles.secondary}>
                <Text style={styles.secondaryText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => (step === 1 ? setStep(2) : router.back())}
              style={[styles.primary, step === 2 && styles.primaryAfterBack]}
            >
              <Text style={styles.primaryText}>{step === 1 ? 'Next' : 'Done'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SpotlightCutout>

      {/* Toolbar above dim so Back always works */}
      <SafeAreaView style={styles.overlayToolbar} edges={['top']} pointerEvents="box-none">
        <View style={styles.overlayToolbarRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.toolbarTitle}>Spotlight sample</Text>
          <View style={{ width: 72 }} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eaecee' },
  safe: { flex: 1, paddingHorizontal: 20 },
  overlayToolbar: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    pointerEvents: 'box-none',
  },
  overlayToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  back: { fontSize: 16, color: '#FF8C42', fontFamily: 'Inter_600SemiBold' },
  toolbarTitle: { fontSize: 14, color: '#1F2937', fontFamily: 'Inter_600SemiBold' },
  pageTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginTop: 8,
  },
  pageSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 16,
    lineHeight: 18,
  },
  fakeCarousel: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e5e5e5',
  },
  fakeCarouselLabel: {
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 12,
  },
  fakeEmojiRow: { flexDirection: 'row', justifyContent: 'space-around' },
  fakeEmoji: { fontSize: 32 },
  spacer: { flex: 1, minHeight: 24 },
  fakeMatches: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#e5e5e5',
  },
  matchesTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 10,
  },
  fakeRow: {
    fontFamily: 'Inter_400Regular',
    color: '#444',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  bubble: {
    position: 'absolute',
    backgroundColor: '#FFFDF7',
    borderRadius: 18,
    padding: 14,
    borderWidth: 2,
    borderColor: '#FF8C42',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bubbleTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#1F2937',
    marginBottom: 6,
  },
  bubbleBody: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#4B5563',
    lineHeight: 18,
  },
  bubbleActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
    gap: 10,
  },
  primary: {
    backgroundColor: '#FF8C42',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primaryAfterBack: {
    marginLeft: 8,
  },
  primaryText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
  secondary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryText: { color: '#666', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
