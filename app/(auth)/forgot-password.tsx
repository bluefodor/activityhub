import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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
import { sendPasswordResetEmail } from '@/lib/accountSettings';
import { AuthLogoTitle } from '@/components/AuthLogoTitle';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendResetLink = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert('Email required', 'Enter the email address for your account.');
      return;
    }
    if (!isValidEmail(trimmed)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const { ok, error } = await sendPasswordResetEmail(trimmed);
      if (!ok) {
        Alert.alert('Could not send email', error ?? 'Please try again.');
        return;
      }

      Alert.alert(
        'Check your email',
        `If an account exists for ${trimmed}, we sent a password reset link. Open the email on your phone and tap the link — you'll set your new password in your browser, then sign in to the app.`,
        [{ text: 'Back to sign in', onPress: () => router.replace('/(auth)/login') }]
      );
    } finally {
      setLoading(false);
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
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>
            Enter your account email and we&apos;ll send a link to set a new password.
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSendResetLink}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Sending…' : 'Send reset link'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>Back to sign in</Text>
          </TouchableOpacity>
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
  input: {
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    color: '#333',
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
