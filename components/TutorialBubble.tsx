import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  GestureResponderEvent,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import {
  tutorialSpotlightPath,
  tutorialSpotlightHoleBounds,
  TUTORIAL_SPOTLIGHT_DIM,
  type SpotlightHole,
} from '@/lib/tutorialSpotlight';

function SpotlightOverlay({
  screenW,
  screenH,
  hole,
}: {
  screenW: number;
  screenH: number;
  hole: SpotlightHole;
}) {
  const fullPath = tutorialSpotlightPath(screenW, screenH, hole);
  if (!fullPath) {
    return (
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: TUTORIAL_SPOTLIGHT_DIM }]}
        pointerEvents="auto"
      />
    );
  }

  return (
    <Svg width={screenW} height={screenH} pointerEvents="auto">
      <Path
        key={`${hole.x}-${hole.y}-${hole.width}-${hole.height}`}
        d={fullPath}
        fill={TUTORIAL_SPOTLIGHT_DIM}
        fillRule="evenodd"
      />
    </Svg>
  );
}

interface TutorialBubbleProps {
  title?: string;
  /** Optional body text below the title. Omit for title-only bubbles. */
  message?: string | React.ReactNode;
  step: number;
  totalSteps: number;
  onNext: (e: GestureResponderEvent) => void;
  onBack?: (e: GestureResponderEvent) => void;
  /** Absolute positioning for the bubble container (e.g., { top, left, right, bottom }). Use marginLeft/marginTop to shift the centered bubble. */
  position: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    marginLeft?: number;
    marginTop?: number;
  };
  /** 'top' = arrow above bubble (points up). 'bottom' = arrow below (points down). 'right' = arrow on right edge (points right). Omit for no arrow. */
  tailAt?: 'top' | 'bottom' | 'right';
  /** Optional: directly control the arrow's horizontal position inside the bubble (in px from the left edge). */
  tailLeftOverride?: number;
  /** Optional: for tailAt='right', vertical offset in px from the top of the bubble. */
  tailTopOverride?: number;
  /** Screen X (from measureInWindow) of the point the arrow should point at. Used for top/bottom tails. */
  targetCenterX?: number;
  /** Nudge the arrow horizontally (e.g. +20 = 20px right). Use if arrow is "too far left" (-) or "too far right" (+). */
  targetOffsetX?: number;
  /** Extra px added to top/bottom tail `left` after layout (negative = move arrow left on the bubble). */
  tailLeftNudge?: number;
  /** For tailAt='bottom' only: push the arrow tip down (px) so it reaches closer to the target below. */
  tailExtendDown?: number;
  /** Screen Y for tailAt='right' — arrow points at this row (e.g. center of People column). */
  targetCenterY?: number;
  /** Vertical nudge for right tail (px). */
  targetOffsetY?: number;
  /** Bump when bubble position on screen changes so tail re-measures (e.g. `${y}-${x}` from measureInWindow). */
  layoutAnchorKey?: string;
  /** When set, dim the rest of the screen with a rounded cutout around this rect; tails are hidden (spotlight is the cue). */
  spotlightHole?: SpotlightHole | null;
  /** On repeat views: show opt-out on the last step. */
  showDontShowAgain?: boolean;
  dontShowAgain?: boolean;
  onDontShowAgainChange?: (value: boolean) => void;
}

const TAIL_WIDTH = 16;
const DEFAULT_TAIL_LEFT = 24;

export function TutorialBubble({
  title,
  message,
  step,
  totalSteps,
  onNext,
  onBack,
  position,
  tailAt,
  tailLeftOverride,
  tailTopOverride,
  targetCenterX,
  targetOffsetX = 0,
  tailLeftNudge = 0,
  tailExtendDown = 0,
  targetCenterY,
  targetOffsetY = 0,
  layoutAnchorKey,
  spotlightHole,
  showDontShowAgain = false,
  dontShowAgain = false,
  onDontShowAgainChange,
}: TutorialBubbleProps) {
  const isLast = step >= totalSteps;
  const bubbleRef = useRef<View>(null);
  const rootRef = useRef<View>(null);
  /** Window (measureInWindow) origin of this overlay — path uses window coords; SVG must align to window. */
  const [overlayWindowOrigin, setOverlayWindowOrigin] = useState({ x: 0, y: 0 });
  const [windowDims, setWindowDims] = useState(() => Dimensions.get('window'));
  const syncOverlayWindowOrigin = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      setOverlayWindowOrigin({ x, y });
    });
  }, []);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window: w }) => setWindowDims(w));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    syncOverlayWindowOrigin();
  }, [syncOverlayWindowOrigin, spotlightHole, windowDims.width, windowDims.height]);
  const screenW = windowDims.width;
  const screenH = windowDims.height;
  const hasSpotlight =
    !!spotlightHole &&
    spotlightHole.width > 0 &&
    spotlightHole.height > 0 &&
    tutorialSpotlightPath(screenW, screenH, spotlightHole) != null;
  const effectiveTailAt = hasSpotlight ? undefined : tailAt;
  const [tailLeft, setTailLeft] = useState<number>(DEFAULT_TAIL_LEFT);
  const [tailTopRight, setTailTopRight] = useState<number>(12);

  // Horizontal tail position for tailAt top / bottom
  useEffect(() => {
    if (effectiveTailAt !== 'top' && effectiveTailAt !== 'bottom') return;
    if (tailLeftOverride != null || targetCenterX == null || !bubbleRef.current) return;
    const run = () => {
      bubbleRef.current?.measureInWindow((x, _y, width) => {
        const targetX = targetCenterX + targetOffsetX;
        const tipCenter = targetX - x;
        const left = Math.max(12, Math.min(width - 12 - TAIL_WIDTH, tipCenter - TAIL_WIDTH / 2));
        setTailLeft(left);
      });
    };
    run();
    const t = setTimeout(run, 150);
    return () => clearTimeout(t);
  }, [effectiveTailAt, tailLeftOverride, targetCenterX, targetOffsetX, layoutAnchorKey]);

  const topOrBottomTailLeft = Math.max(
    4,
    (tailLeftOverride ?? tailLeft) + tailLeftNudge
  );

  // Vertical tail position for tailAt right (arrow points at targetCenterY on screen)
  useEffect(() => {
    if (effectiveTailAt !== 'right' || tailTopOverride != null || targetCenterY == null || !bubbleRef.current) return;
    const TAIL_HALF = 10;
    const run = () => {
      bubbleRef.current?.measureInWindow((_bx, by, _bw, bh) => {
        const targetY = targetCenterY + targetOffsetY;
        const desiredTop = targetY - by - TAIL_HALF;
        const clamped = Math.max(12, Math.min(bh - 28, desiredTop));
        setTailTopRight(clamped);
      });
    };
    run();
    const t = setTimeout(run, 150);
    return () => clearTimeout(t);
  }, [effectiveTailAt, tailTopOverride, targetCenterY, targetOffsetY, layoutAnchorKey]);

  const overlay = (
    <View
      ref={rootRef}
      onLayout={syncOverlayWindowOrigin}
      style={[styles.tutorialRoot, Platform.OS === 'android' && styles.tutorialRootAndroid]}
      pointerEvents="box-none"
      collapsable={false}
    >
      {hasSpotlight && spotlightHole ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: -overlayWindowOrigin.y,
            left: -overlayWindowOrigin.x,
            width: screenW,
            height: screenH,
          }}
          collapsable={false}
        >
          <SpotlightOverlay screenW={screenW} screenH={screenH} hole={spotlightHole} />
        </View>
      ) : (
        <View style={styles.overlay} pointerEvents="auto" />
      )}
      <View style={[styles.bubbleContainer, position]} pointerEvents="box-none">
        <View ref={bubbleRef} style={styles.bubble} onLayout={() => {}}>
          {effectiveTailAt === 'top' && (
            <View
              style={[styles.tail, styles.tailTop, { left: topOrBottomTailLeft }]}
              pointerEvents="none"
            />
          )}
          {effectiveTailAt === 'bottom' && (
            <View
              style={[
                styles.tail,
                styles.tailBottom,
                { left: topOrBottomTailLeft },
                tailExtendDown ? { transform: [{ translateY: tailExtendDown }] } : null,
              ]}
              pointerEvents="none"
            />
          )}
          {effectiveTailAt === 'right' && (
            <View
              style={[styles.tail, styles.tailRight, { top: tailTopOverride ?? tailTopRight }]}
              pointerEvents="none"
            />
          )}
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {message ? (
            typeof message === 'string' ? (
              <Text style={styles.message}>{message}</Text>
            ) : (
              <Text style={styles.message}>{message}</Text>
            )
          ) : null}
          {isLast && showDontShowAgain ? (
            <TouchableOpacity
              style={styles.dismissRow}
              onPress={() => onDontShowAgainChange?.(!dontShowAgain)}
              activeOpacity={0.8}
            >
              <View style={[styles.dismissCheckbox, dontShowAgain && styles.dismissCheckboxChecked]}>
                {dontShowAgain ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <Text style={styles.dismissLabel}>Don't show tutorial again</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.footerRow}>
            <Text style={styles.tutorialLabel}>Tutorial</Text>
            <View style={styles.buttonRow}>
              {onBack && step > 1 && (
                <TouchableOpacity onPress={onBack} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onNext} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{isLast ? 'Done' : 'Next'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  return overlay;
}

const styles = StyleSheet.create({
  tutorialRoot: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'visible',
  },
  tutorialRootAndroid: {
    elevation: 24,
    zIndex: 9999,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    // Keep this transparent so the underlying screen colors don't change
    backgroundColor: 'transparent',
  },
  bubbleContainer: {
    position: 'absolute',
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  bubble: {
    backgroundColor: '#FFFDF7',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: 260,
    borderWidth: 2,
    borderColor: '#FF8C42',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    /** Avoid clipping tails; helps tails meet border on iOS/Android */
    overflow: 'visible',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
    color: '#1F2937',
  },
  message: {
    fontSize: 13,
    color: '#4B5563',
  },
  dismissRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  dismissCheckbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#ccc',
    borderRadius: 5,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissCheckboxChecked: {
    backgroundColor: '#FF8C42',
    borderColor: '#FF8C42',
  },
  dismissLabel: {
    fontSize: 13,
    color: '#4B5563',
    fontFamily: 'Inter_500Medium',
  },
  footerRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tutorialLabel: {
    fontSize: 12,
    color: '#B0B0B0',
  },
  tail: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
  /** Flush with outer border (-12). -11 pulled tails ~1px inside the card; keep overflow visible on bubble. */
  tailTop: {
    top: -12,
    borderBottomWidth: 12,
    borderBottomColor: '#FF8C42',
    borderLeftWidth: 10,
    borderLeftColor: 'transparent',
    borderRightWidth: 10,
    borderRightColor: 'transparent',
  },
  tailBottom: {
    bottom: -12,
    borderTopWidth: 12,
    borderTopColor: '#FF8C42',
    borderLeftWidth: 10,
    borderLeftColor: 'transparent',
    borderRightWidth: 10,
    borderRightColor: 'transparent',
  },
  tailRight: {
    right: -12,
    borderLeftWidth: 12,
    borderLeftColor: '#FF8C42',
    borderTopWidth: 10,
    borderTopColor: 'transparent',
    borderBottomWidth: 10,
    borderBottomColor: 'transparent',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secondaryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 6,
  },
  secondaryButtonText: {
    fontSize: 13,
    color: '#4B5563',
  },
  primaryButton: {
    backgroundColor: '#FF8C42',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  primaryButtonText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

