import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RootKeyboardWrapper } from '@/components/RootKeyboardWrapper';
import { useAuthStore } from '@/store/useAuthStore';

SplashScreen.preventAutoHideAsync().catch(() => {});

const SPLASH_MAX_MS = 1500;

export default function RootLayout() {
  useFrameworkReady();

  const authLoading = useAuthStore((s) => s.loading);
  const [splashTimedOut, setSplashTimedOut] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    const timeout = setTimeout(() => setSplashTimedOut(true), SPLASH_MAX_MS);
    return () => clearTimeout(timeout);
  }, []);

  const appReady = fontsLoaded || !!fontError || splashTimedOut;

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady]);

  useEffect(() => {
    if (!authLoading) return;
    const timeout = setTimeout(() => {
      console.warn('Auth init took longer than expected; continuing without session.');
      useAuthStore.setState({ loading: false });
    }, 8000);
    return () => clearTimeout(timeout);
  }, [authLoading]);

  if (!appReady) {
    return null;
  }

  return (
    <ErrorBoundary>
      <RootKeyboardWrapper>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </RootKeyboardWrapper>
    </ErrorBoundary>
  );
}
