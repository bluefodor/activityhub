import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export default function DatabaseDebugScreen() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [userActivitySkills, setUserActivitySkills] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      // Fetch all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('name');

      // Fetch all activities
      const { data: activitiesData, error: activitiesError } = await supabase
        .from('activities')
        .select('*')
        .order('name');

      // Fetch all user activity skills with joined data
      const { data: skillsData, error: skillsError } = await supabase
        .from('user_activity_skills')
        .select(`
          *,
          profiles!user_activity_skills_user_id_fkey (
            id,
            name,
            email
          ),
          activities!user_activity_skills_activity_id_fkey (
            id,
            name,
            emoji
          )
        `)
        .order('created_at');

      // Fetch all chats
      const { data: chatsData, error: chatsError } = await supabase
        .from('chats')
        .select('*')
        .order('created_at');

      // Fetch all chat messages
      const { data: messagesData, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at');

      console.log('=== DATABASE DEBUG RESULTS ===');
      console.log('Profiles:', profilesData, 'Error:', profilesError);
      console.log('Activities:', activitiesData, 'Error:', activitiesError);
      console.log('User Activity Skills:', skillsData, 'Error:', skillsError);
      console.log('Chats:', chatsData, 'Error:', chatsError);
      console.log('Chat Messages:', messagesData, 'Error:', messagesError);

      setProfiles(profilesData || []);
      setActivities(activitiesData || []);
      setUserActivitySkills(skillsData || []);
      setChats(chatsData || []);
      setChatMessages(messagesData || []);
    } catch (error) {
      console.error('Error fetching debug data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading database data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Database Debug</Text>
        <Ionicons name="server" size={24} color="#333" />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContainer}>
        <TouchableOpacity
          style={styles.devLinkButton}
          onPress={() => router.push('/tutorial-spotlight-sample')}
        >
          <Text style={styles.devLinkText}>Tutorial spotlight sample (dim + cutout)</Text>
        </TouchableOpacity>

        {/* Current User Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current User (from Auth)</Text>
          <View style={styles.dataContainer}>
            <Text style={styles.dataText}>ID: {user?.id || 'Not logged in'}</Text>
            <Text style={styles.dataText}>Email: {user?.email || 'N/A'}</Text>
          </View>
        </View>

        {/* Profiles Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profiles Table ({profiles.length} records)</Text>
          {profiles.map((profile, index) => (
            <View key={profile.id} style={styles.dataContainer}>
              <Text style={styles.dataText}>#{index + 1}</Text>
              <Text style={styles.dataText}>ID: {profile.id}</Text>
              <Text style={styles.dataText}>Name: {profile.name}</Text>
              <Text style={styles.dataText}>Email: {profile.email}</Text>
              <Text style={[styles.dataText, user?.id === profile.id && styles.currentUser]}>
                {user?.id === profile.id ? '← THIS IS YOU' : ''}
              </Text>
            </View>
          ))}
        </View>

        {/* Activities Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activities Table ({activities.length} records)</Text>
          {activities.map((activity, index) => (
            <View key={activity.id} style={styles.dataContainer}>
              <Text style={styles.dataText}>#{index + 1}</Text>
              <Text style={styles.dataText}>ID: {activity.id}</Text>
              <Text style={styles.dataText}>Name: {activity.name} {activity.emoji}</Text>
            </View>
          ))}
        </View>

        {/* User Activity Skills Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Activity Skills Table ({userActivitySkills.length} records)</Text>
          {userActivitySkills.map((skill, index) => (
            <View key={skill.id} style={styles.dataContainer}>
              <Text style={styles.dataText}>#{index + 1}</Text>
              <Text style={styles.dataText}>Skill ID: {skill.id}</Text>
              <Text style={styles.dataText}>User ID: {skill.user_id}</Text>
              <Text style={styles.dataText}>Activity ID: {skill.activity_id}</Text>
              <Text style={styles.dataText}>Skill Level: {skill.skill_level}</Text>
              <Text style={styles.dataText}>
                Profile: {skill.profiles ? `${skill.profiles.name} (${skill.profiles.id})` : 'NULL - ORPHANED RECORD!'}
              </Text>
              <Text style={styles.dataText}>
                Activity: {skill.activities ? `${skill.activities.name} ${skill.activities.emoji}` : 'NULL - ORPHANED RECORD!'}
              </Text>
              {!skill.profiles && <Text style={styles.errorText}>⚠️ ORPHANED: No matching profile!</Text>}
              {!skill.activities && <Text style={styles.errorText}>⚠️ ORPHANED: No matching activity!</Text>}
            </View>
          ))}
        </View>

        {/* Chats Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chats Table ({chats.length} records)</Text>
          {chats.length === 0 ? (
            <Text style={styles.emptyText}>No chats found</Text>
          ) : (
            chats.map((chat, index) => (
              <View key={chat.id} style={styles.dataContainer}>
                <Text style={styles.dataText}>#{index + 1}</Text>
                <Text style={styles.dataText}>Chat ID: {chat.id}</Text>
                <Text style={styles.dataText}>Participant 1: {chat.participant_1}</Text>
                <Text style={styles.dataText}>Participant 2: {chat.participant_2}</Text>
                <Text style={styles.dataText}>Created: {new Date(chat.created_at).toLocaleString()}</Text>
              </View>
            ))
          )}
        </View>

        {/* Chat Messages Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chat Messages Table ({chatMessages.length} records)</Text>
          {chatMessages.length === 0 ? (
            <Text style={styles.emptyText}>No chat messages found</Text>
          ) : (
            chatMessages.map((message, index) => (
              <View key={message.id} style={styles.dataContainer}>
                <Text style={styles.dataText}>#{index + 1}</Text>
                <Text style={styles.dataText}>Message ID: {message.id}</Text>
                <Text style={styles.dataText}>Chat ID: {message.chat_id}</Text>
                <Text style={styles.dataText}>Sender ID: {message.sender_id}</Text>
                <Text style={styles.dataText}>Message: {message.message}</Text>
                <Text style={styles.dataText}>Created: {new Date(message.created_at).toLocaleString()}</Text>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity style={styles.refreshButton} onPress={fetchAllData}>
          <Text style={styles.refreshText}>Refresh Data</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eaecee',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  scrollView: {
    flex: 1,
  },
  scrollContainer: {
    padding: 16,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 8,
  },
  dataContainer: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  dataText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    marginBottom: 2,
  },
  currentUser: {
    color: '#FFBF00',
    fontFamily: 'Inter_700Bold',
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#F44336',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
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
  devLinkButton: {
    backgroundColor: '#1F2937',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  devLinkText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  refreshButton: {
    backgroundColor: '#FF8C42',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  refreshText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
});