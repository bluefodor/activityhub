import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useEffect } from 'react';

interface LoadingSpinnerProps {
  size?: number;
  color?: string;
}

export function LoadingSpinner({ size = 24, color = '#FF8C42' }: LoadingSpinnerProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1000 }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          rotate: `${rotation.value}deg`,
        },
      ],
    };
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.spinner,
          {
            width: size,
            height: size,
            borderColor: `${color}20`,
            borderTopColor: color,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinner: {
    borderWidth: 2,
    borderRadius: 50,
  },
});