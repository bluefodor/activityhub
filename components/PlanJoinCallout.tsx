import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PlanJoinCalloutProps {
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
}

export function PlanJoinCallout({ onDismiss, style }: PlanJoinCalloutProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateX.setValue(6);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, friction: 8, tension: 80, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateX]);

  return (
    <Animated.View
      style={[styles.wrapper, style, { opacity, transform: [{ translateX }] }]}
      pointerEvents="box-none"
    >
      <View style={styles.bubble}>
        <Text style={styles.text}>Join a new{'\n'}open plan!</Text>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={14} color="#999" />
        </TouchableOpacity>
        <View style={styles.tailBorder} />
        <View style={styles.tail} />
      </View>
    </Animated.View>
  );
}

/** Used for tail alignment in forum.tsx */
export const PLAN_JOIN_CALLOUT_BUBBLE_WIDTH = 110;

const styles = StyleSheet.create({
  wrapper: {
    width: PLAN_JOIN_CALLOUT_BUBBLE_WIDTH,
  },
  bubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#81C784',
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'visible',
    position: 'relative',
  },
  text: {
    fontSize: 12.5,
    fontFamily: 'Inter_600SemiBold',
    color: '#222',
    lineHeight: 17,
  },
  closeBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tail: {
    position: 'absolute',
    right: -5,
    top: '50%',
    marginTop: -5,
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 6,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#FFFFFF',
  },
  tailBorder: {
    position: 'absolute',
    right: -7,
    top: '50%',
    marginTop: -6,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#81C784',
  },
});

export const PLAN_JOIN_CALLOUT_DAILY_KEY = (userId: string) =>
  `plan_join_callout_daily_${userId}`;
