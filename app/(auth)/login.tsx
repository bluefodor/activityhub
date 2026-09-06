import { useAuth } from '@/hooks/useAuth';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView } from 'react-native';
import { AuthLogoTitle } from '@/components/AuthLogoTitle';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const signInPromise = signIn(email, password);
      const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
        setTimeout(
          () => resolve({ error: { message: 'Connection timed out. Check your network and try again.' } }),
          15000
        );
      });
      const { error } = await Promise.race([signInPromise, timeoutPromise]);

      if (error) {
        const msg = error.message || 'Login failed.';
        const isNetwork =
          msg.includes('Network request failed') ||
          msg.includes('fetch') ||
          msg.includes('Connection timed out');
        Alert.alert(
          isNetwork ? 'Connection problem' : 'Error',
          isNetwork
            ? 'Could not reach the server. On Android Expo Go, try restarting the emulator, using one Metro server, or testing on iOS / a production build.'
            : msg
        );
      } else {
        router.replace('/(tabs)/forum');
      }
    } catch (error) {
      Alert.alert('Error', 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps={'handled'}
        showsVerticalScrollIndicator={false}
      >
        <StatusBar style="dark" />
        <View style={styles.header}>
        <AuthLogoTitle />
        <Text style={styles.location}>Portland, ME</Text>
        </View>

        <View style={styles.form}>
        {/* App Explanation */}
        <Text style={styles.infoText}>
          Stop scrolling. Go play.
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
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor="#999"
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword((prev) => !prev)}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="rgba(102,102,102,0.3)" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.forgotButton}
          onPress={() => router.push('/(auth)/forgot-password')}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Signing In...' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.accountPromptText}>
          Don't have an account?
        </Text>

        <TouchableOpacity
          style={styles.signUpButton}
          onPress={() => router.push('/(auth)/signup')}
        >
          <Text style={styles.signUpButtonText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.browseButton}
          onPress={() => router.replace('/(tabs)/forum')}
        >
          <Text style={styles.browseText}>Browse without login</Text>
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
    marginBottom: 40,
  },
  location: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    color: '#666',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  form: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 24,
    textAlign: 'center',
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
  forgotButton: {
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 4,
  },
  forgotText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#FF8C42',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    alignSelf: 'center',
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
  accountPromptText: {
    fontFamily: 'Inter_400Regular',
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  signUpButton: {
    backgroundColor: '#FFCF56',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    alignSelf: 'center',
  },
  signUpButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    fontWeight: 'bold',
  },
  browseButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  browseText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
    fontSize: 14,
  },
  infoText: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    fontWeight: 'bold',
    color: '#888',
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 24,
  },
});
