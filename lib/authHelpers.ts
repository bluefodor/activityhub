import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

/**
 * Prompts user to login when they try to perform an account-based action
 */
export const requireAuth = (action: string, onLogin?: () => void) => {
  Alert.alert(
    'Login Required',
    `Please sign in to ${action}.`,
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Sign In',
        onPress: () => {
          router.push('/(auth)/login');
          if (onLogin) {
            // Store the callback to execute after login
            // This is a simple implementation - you might want to use a more robust solution
            setTimeout(() => {
              if (onLogin) onLogin();
            }, 1000);
          }
        },
      },
    ]
  );
};

/**
 * Hook to check if user is authenticated and prompt login if not
 */
export const useRequireAuth = () => {
  const { user } = useAuth();
  
  const checkAuth = (action: string, callback: () => void) => {
    if (!user) {
      requireAuth(action, callback);
      return false;
    }
    return true;
  };
  
  return { checkAuth, isAuthenticated: !!user };
};


