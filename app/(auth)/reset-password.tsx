import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { changePasswordInApp, validatePasswordPair } from '@/lib/accountSettings';
import { createSessionFromAuthUrl, urlHasAuthParams } from '@/lib/authDeepLink';
import { supabase } from '@/lib/supabase';
import { AuthLogoTitle } from '@/components/AuthLogoTitle';

type ScreenState = 'loading' | 'ready' | 'error';

export default function ResetPasswordScreen() {
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const markReady = useCallback(() => {
    setLinkError(null);
    setScreenState('ready');
  }, []);

  const markError = useCallback((message: string) => {
    setLinkError(message);
    setScreenState('error');
  }, []);

  const verifyRecoverySession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      markError(error.message || 'Could not verify reset link.');
      return false;
    }
    if (data.session) {
      markReady();
      return true;
    }
    return false;
  }, [markError, markReady]);

  const handleAuthUrl = useCallback(
    async (url: string | null) => {
      if (!url || !url.includes('reset-password')) return false;
      if (!urlHasAuthParams(url)) return false;

      const result = await createSessionFromAuthUrl(url);
      if (!result.ok) {
        markError(result.error ?? 'Invalid or expired reset link.');
        return true;
      }

      markReady();
      return true;
    },
    [markError, markReady]
  );

  useEffect(() => {
    let cancelled = false;

    const tryOpenFromLink = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (await handleAuthUrl(initialUrl)) return true;
      if (await verifyRecoverySession()) return true;
      return false;
    };

    const init = async () => {
      if (await tryOpenFromLink()) return;

      // iOS may open the app before query params are attached to getInitialURL().
      for (const delayMs of [400, 800]) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (cancelled) return;
        if (await tryOpenFromLink()) return;
      }

      markError('Open the password reset link from your email on this device.');
    };

    init().catch(() => {
      if (!cancelled) {
        markError('Could not open the reset link.');
      }
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthUrl(url);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        markReady();
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
      authListener.subscription.unsubscribe();
    };
  }, [handleAuthUrl, markError, markReady, verifyRecoverySession]);

  const handleSetNewPassword = async () => {
    const validation = validatePasswordPair(newPassword, confirmPassword);
    if (validation) {
      Alert.alert('Invalid password', validation);
      return;
    }

    setSubmitting(true);
    try {
      const { ok, error } = await changePasswordInApp(newPassword);
      if (!ok) {
        Alert.alert('Could not update password', error ?? 'Please try again.');
        return;
      }

      Alert.alert('Password updated', 'You can now use your new password to sign in.', [
        { text: 'Continue', onPress: () => router.replace('/(tabs)/forum') },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StatusBar style="dark" />

        <View style={styles.header}>
          <AuthLogoTitle />
        </View>

        <View style={styles.form}>
          {screenState === 'loading' ? (
            <>
              <Text style={styles.title}>Verifying link…</Text>
              <Text style={styles.subtitle}>Hang on while we open your password reset link.</Text>
            </>
          ) : null}

          {screenState === 'error' ? (
            <>
              <Text style={styles.title}>Reset link problem</Text>
              <Text style={styles.subtitle}>{linkError ?? 'This reset link is invalid or expired.'}</Text>
              <TouchableOpacity
                style={styles.button}
                onPress={() => router.replace('/(auth)/forgot-password')}
              >
                <Text style={styles.buttonText}>Request a new link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(auth)/login')}>
                <Text style={styles.backText}>Back to sign in</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {screenState === 'ready' ? (
            <>
              <Text style={styles.title}>Choose a new password</Text>
              <Text style={styles.subtitle}>Enter and confirm your new password below.</Text>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>New password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={styles.passwordInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="At least 6 characters"
                    placeholderTextColor="#999"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword((prev) => !prev)}
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color="rgba(102,102,102,0.3)"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={styles.passwordInput}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm your password"
                    placeholderTextColor="#999"
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowConfirmPassword((prev) => !prev)}
                    accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color="rgba(102,102,102,0.3)"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, submitting && styles.buttonDisabled]}
                onPress={handleSetNewPassword}
                disabled={submitting}
              >
                <Text style={styles.buttonText}>
                  {submitting ? 'Updating…' : 'Update password'}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  form: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#333',
    marginBottom: 8,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    backgroundColor: '#f9f9f9',
  },
  passwordInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    padding: 16,
    fontSize: 16,
    color: '#333',
  },
  passwordToggle: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  button: {
    backgroundColor: '#FF8C42',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    fontWeight: 'bold',
  },
  backButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  backText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
    fontSize: 14,
  },
});
