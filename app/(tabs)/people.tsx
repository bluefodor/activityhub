import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  SectionList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { CachedImage } from '@/components/CachedImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { usePeople } from '@/hooks/usePeople';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useAuth } from '@/hooks/useAuth';
import { requireAuth } from '@/lib/authHelpers';
import { ActivityCarousel } from '@/components/ActivityCarousel';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ICONS } from '@/lib/helperUtils';


export default function PeopleScreen() {
  const { user } = useAuth();
  const { requestLocationPermission } = useLocationTracking();
  const insets = useSafeAreaInsets();

  const [refreshing, setRefreshing] = useState(false);

  const { people, loading, refetch } = usePeople();

  const sections = useMemo(() => {
    if (people.length === 0) return [];
    return [{ title: 'Members', data: people }];
  }, [people]);

  const onRefresh = async () => {
    setRefreshing(true);
    // 1. Check permissions and update location in DB (no error if unavailable)
    await requestLocationPermission();
    // 2. Reload the list; try to get location so distances update after granting permission
    await refetch({ tryLocation: true });
    setRefreshing(false);
  };

  const openChat = (userId: string, userName: string) => {
    if (!user) {
      requireAuth('message users');
      return;
    }

    router.push({
      pathname: '/(tabs)/chats/[id]',
      params: { id: userId, name: userName },
    });
  };

  const getSkillColor = (rawLevel: string) => {
    const s = (rawLevel || '').trim();
    const normalized = s
      ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
      : 'Beginner';
    switch (normalized) {
      case 'Beginner':
        return '#4CAF50';
      case 'Intermediate':
        return '#FFCF56';
      case 'Advanced':
        return '#FF8C42';
      default:
        return '#999';
    }
  };

  const renderUser = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.userCard}
      activeOpacity={0.9}
      onPress={() =>
        router.push({
          pathname: '/(tabs)/people/[id]',
          params: { id: item.id, name: item.name, from: 'people' },
        })
      }
    >
      <CachedImage source={ item?.avatar_url ? { uri: item.avatar_url } : ICONS.profileIcon } style={styles.avatar} recyclingKey={item.id} displayPreset="avatar" />
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName} numberOfLines={1} ellipsizeMode="clip">
            {item.name}
          </Text>
          {item.distance ? (
            <Text style={styles.distanceText}>{item.distance}</Text>
          ) : null}
          <View style={[styles.skillDot, { backgroundColor: getSkillColor(item.skill_level) }]} />
        </View>
      </View>
      <TouchableOpacity
        style={styles.chatButton}
        onPress={() => {
          openChat(item.id, item.name);
        }}
      >
        <Ionicons name="chatbubble" size={20} color="white" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <ActivityCarousel />
        <View style={styles.loadingContainer}>
          <LoadingSpinner size={32} />
          <Text style={[styles.loadingText, { marginTop: 16 }]}>Loading people...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ActivityCarousel />

      <View style={styles.header}>
        <View style={styles.headerGradient} />
        <View style={styles.headerTop}>
          <Text style={styles.title}>
            People Nearby
          </Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        renderItem={renderUser}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          </View>
        )}
        renderSectionFooter={() => null}
        stickySectionHeadersEnabled={true}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContainer, { paddingBottom: Math.max(insets.bottom, 20) + 90 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            colors={['#FF8C42']} // Android spinner color
            tintColor="#FF8C42"  // iOS spinner color
          />
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No people found</Text>
            <Text style={styles.emptySubtitle}>
              Be the first to join this activity community!
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  header: {
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    position: 'relative',
    overflow: 'hidden',
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#FF8C42',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    textShadowColor: 'rgba(255, 140, 66, 0.1)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    textAlign: 'left',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginTop: 4,
  },
  listContainer: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: '#FAF9F6',
    zIndex: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flex: 0,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    textAlign: 'left',
  },
  readyTodayBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  readyTodayBadgeInline: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  readyTodayEmpty: {
    backgroundColor: '#FFF7EE',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  readyTodayEmptyText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
    textAlign: 'center',
  },
  readyTodayBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  userCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFCF56',
    marginBottom: 12,
    marginHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2,
    transform: [{ scale: 1 }],
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: '100%',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  userName: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    flex: 1,
    minWidth: 0,
  },
  skillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  skillText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  distanceText: {
    fontSize: 6,
    lineHeight: 8,
    fontFamily: 'Inter_500Medium',
    color: '#888',
    flexShrink: 0,
    minWidth: 26,
    textAlign: 'right',
  },
  chatButton: {
    backgroundColor: '#FF8C42',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
  },
  locationButton: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  locationButtonText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#1565C0',
    textAlign: 'center',
  },
});
