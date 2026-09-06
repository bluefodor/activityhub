import { ActivitySelectionModal } from '@/components/ActivitySelectionModal';
import { AuthLogoTitle } from '@/components/AuthLogoTitle';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, KeyboardAvoidingView, Platform } from 'react-native';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [signupStarted, setSignupStarted] = useState(false);
  const { signUp, user } = useAuth();
  const { updateSkillLevel, refetch } = useProfile();

  // Calculate age from date of birth
  const calculateAge = (dob: string): number | null => {
    if (!dob) return null;
    
    // Parse date (expecting MM/DD/YYYY format)
    const parts = dob.split('/');
    if (parts.length !== 3) return null;
    
    const month = parseInt(parts[0], 10) - 1; // Month is 0-indexed
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    
    if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
    
    const birthDate = new Date(year, month, day);
    const today = new Date();
    
    // Check if date is valid
    if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month || birthDate.getDate() !== day) {
      return null;
    }
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  };

  // When user presses the create account button -> open activity modal first
  const handleSignupPress = () => {
    if (!email || !password || !confirmPassword || !name || !dateOfBirth) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    // Verify age (must be 18 or older)
    const age = calculateAge(dateOfBirth);
    if (age === null) {
      Alert.alert('Error', 'Please enter a valid date of birth (MM/DD/YYYY)');
      return;
    }

    if (age < 18) {
      Alert.alert(
        'Age Restriction',
        'You must be 18 years or older to use this app. We apologize for any inconvenience.'
      );
      return;
    }

    if (!acceptedTerms) {
      Alert.alert('Terms Required', 'You must accept the Terms & Safety Policies to create an account.');
      return;
    }

    // Open modal to let user select or skip activities BEFORE creating account
    setShowActivityModal(true);
  };

  const finishSignup = async (selectedActivities: any[]) => {
    setLoading(true);
    setSignupStarted(true);

    try {
      // 1. Create the account
      const { error, data } = await signUp(email, password, name);

      if (error || !data?.user) {
        Alert.alert(
          'Signup Error',
          error?.message || 'Failed to create account'
        );
        setLoading(false);
        setSignupStarted(false);
        return;
      }

      // 2. Save activities using the NEW user ID from 'data.user.id'
      if (selectedActivities && selectedActivities.length > 0) {
        // Capture the ID from the response
        const newUserId = data.user.id;

        for (const item of selectedActivities) {
          try {
            // Pass newUserId as the 4th argument
            await updateSkillLevel(
              item.activityId,
              item.skillLevel,
              newUserId
            );
          } catch (err) {
            console.error('Failed to save activity', item, err);
          }
        }
      }

      // 3. Refresh and Navigate
      await refetch();
      router.replace('/(tabs)/forum');
    } catch (err) {
      console.error('Error during finishSignup:', err);
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
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
        <Text style={styles.title}>Create Account</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter your full name"
          />
        </View>

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
              placeholder="Password (min 6 characters)"
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

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your password"
              placeholderTextColor="#999"
              secureTextEntry={!showConfirmPassword}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowConfirmPassword((prev) => !prev)}
              accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color="rgba(102,102,102,0.3)" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Date of Birth</Text>
          <TextInput
            style={styles.input}
            value={dateOfBirth}
            onChangeText={(text) => {
              // Format as MM/DD/YYYY
              let formatted = text.replace(/\D/g, ''); // Remove non-digits
              if (formatted.length >= 2) {
                formatted = formatted.slice(0, 2) + '/' + formatted.slice(2);
              }
              if (formatted.length >= 5) {
                formatted = formatted.slice(0, 5) + '/' + formatted.slice(5, 9);
              }
              setDateOfBirth(formatted);
            }}
            placeholder="MM/DD/YYYY"
            keyboardType="numeric"
            maxLength={10}
          />
          <Text style={styles.hintText}>
            Used only to confirm you are 18 or older. Your date of birth is not stored on our servers.
          </Text>
        </View>

        <View style={styles.termsContainer}>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setAcceptedTerms(!acceptedTerms)}
          >
            <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
              {acceptedTerms && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              I agree to the{' '}
              <Text 
                style={styles.termsLink}
                onPress={() => {
                  Alert.alert(
                    'Terms & Safety Policies',
                    `TERMS OF USE

By using The Activity Hub, you agree to our community guidelines and terms.

ZERO TOLERANCE POLICY
There is zero tolerance for abusive, harmful, or inappropriate content or behavior. Violations will result in immediate account suspension or termination.

REPORTING & RESPONSE
Reports of inappropriate behavior will be reviewed within 24 hours and offending content or user access may be removed.

SAFETY GUIDELINES
• Be respectful and kind to all members
• Report any inappropriate behavior immediately
• Meet in public places for first-time meetups
• Trust your instincts and prioritize your safety

Full Terms: https://bluefodor88.github.io
Privacy Policy: https://bluefodor88.github.io

For support: activityhubsercive@gmail.com`
                  );
                }}
              >
                Terms & Safety Policies
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            (loading || signupStarted) && styles.buttonDisabled,
          ]}
          onPress={handleSignupPress}
          disabled={loading || signupStarted}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Processing...' : 'Create Account'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.linkText}>
            Already have an account?{' '}
            <Text style={styles.linkTextBold}>Sign In</Text>
          </Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
      <ActivitySelectionModal
        visible={showActivityModal}
        // User closed/skipped the modal
        onClose={() => {
          setShowActivityModal(false);
          // create account immediately with no activities selected
          finishSignup([]);
        }}
        // User selected an activity — modal returns selection
        onComplete={(selectedActivities) => {
          setShowActivityModal(false);
          finishSignup(selectedActivities);
        }}
        isSignup={true}
      />
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
  hintText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  termsContainer: {
    marginBottom: 16,
    marginTop: 8,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#FF8C42',
    borderColor: '#FF8C42',
  },
  checkmark: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  termsText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    flex: 1,
    lineHeight: 20,
  },
  termsLink: {
    color: '#FF8C42',
    fontFamily: 'Inter_600SemiBold',
    textDecorationLine: 'underline',
  },
  button: {
    backgroundColor: '#FFCF56',
    padding: 16,
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
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    fontFamily: 'Inter_400Regular',
    color: '#666',
    fontSize: 14,
  },
  linkTextBold: {
    fontFamily: 'Inter_700Bold',
    color: '#FF8C42',
  },
});
