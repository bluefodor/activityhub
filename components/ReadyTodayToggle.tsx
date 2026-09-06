import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';

type ToggleSize = 'default' | 'compact';

const SIZES: Record<
  ToggleSize,
  { width: number; height: number; thumb: number; padding: number }
> = {
  default: { width: 52, height: 30, thumb: 26, padding: 2 },
  compact: { width: 44, height: 26, thumb: 22, padding: 2 },
};

type ReadyTodayToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  size?: ToggleSize;
  style?: ViewStyle;
};

/** Custom toggle — avoids iOS native Switch ghost-thumb rendering on device/TestFlight. */
export function ReadyTodayToggle({
  value,
  onValueChange,
  size = 'default',
  style,
}: ReadyTodayToggleProps) {
  const dims = SIZES[size];
  const offX = dims.padding;
  const onX = dims.width - dims.thumb - dims.padding;
  const translate = useRef(new Animated.Value(value ? onX : offX)).current;

  useEffect(() => {
    Animated.timing(translate, {
      toValue: value ? onX : offX,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [value, translate, onX, offX]);

  const trackStyle = useMemo(
    () => ({
      width: dims.width,
      height: dims.height,
      borderRadius: dims.height / 2,
      paddingHorizontal: dims.padding,
    }),
    [dims]
  );

  const thumbStyle = useMemo(
    () => ({
      width: dims.thumb,
      height: dims.thumb,
      borderRadius: dims.thumb / 2,
    }),
    [dims]
  );

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onValueChange(!value)}
      style={[styles.track, value ? styles.trackOn : styles.trackOff, trackStyle, style]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <Animated.View
        style={[styles.thumb, thumbStyle, { transform: [{ translateX: translate }] }]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  track: {
    justifyContent: 'center',
  },
  trackOn: {
    backgroundColor: '#4CAF50',
  },
  trackOff: {
    backgroundColor: Platform.OS === 'ios' ? '#E5E5EA' : '#e0e0e0',
  },
  thumb: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
