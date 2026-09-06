import React, { useMemo } from 'react';
import { canUseKeyboardController } from '@/lib/keyboardUi';

type KeyboardProviderProps = {
  children: React.ReactNode;
  statusBarTranslucent?: boolean;
  navigationBarTranslucent?: boolean;
};

function loadKeyboardProvider(): React.ComponentType<KeyboardProviderProps> | null {
  if (!canUseKeyboardController()) return null;
  try {
    return require('react-native-keyboard-controller').KeyboardProvider;
  } catch {
    return null;
  }
}

export function RootKeyboardWrapper({ children }: { children: React.ReactNode }) {
  const KeyboardProvider = useMemo(() => loadKeyboardProvider(), []);

  if (!KeyboardProvider) {
    return <>{children}</>;
  }

  return (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      {children}
    </KeyboardProvider>
  );
}
