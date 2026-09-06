import React, { useMemo } from 'react';
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  type KeyboardAvoidingViewProps,
} from 'react-native';
import { canUseKeyboardController } from '@/lib/keyboardUi';

function loadControllerKeyboardAvoidingView():
  | React.ComponentType<KeyboardAvoidingViewProps>
  | null {
  if (!canUseKeyboardController()) return null;
  try {
    return require('react-native-keyboard-controller').KeyboardAvoidingView;
  } catch {
    return null;
  }
}

/**
 * Native builds: react-native-keyboard-controller (Android edge-to-edge).
 * Expo Go: React Native KeyboardAvoidingView fallback.
 */
export function AppKeyboardAvoidingView({
  behavior,
  keyboardVerticalOffset = 0,
  ...rest
}: KeyboardAvoidingViewProps) {
  const ControllerKeyboardAvoidingView = useMemo(
    () => loadControllerKeyboardAvoidingView(),
    []
  );

  if (ControllerKeyboardAvoidingView) {
    return (
      <ControllerKeyboardAvoidingView
        behavior={behavior ?? 'padding'}
        keyboardVerticalOffset={keyboardVerticalOffset}
        {...rest}
      />
    );
  }

  return (
    <RNKeyboardAvoidingView
      behavior={behavior ?? (Platform.OS === 'ios' ? 'padding' : 'height')}
      keyboardVerticalOffset={keyboardVerticalOffset}
      {...rest}
    />
  );
}
