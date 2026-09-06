import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { Redirect } from 'expo-router';

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/forum" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
});
