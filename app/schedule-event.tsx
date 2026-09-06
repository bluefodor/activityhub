import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { useEventParticipants } from '@/hooks/useEventParticipants';
import { supabase } from '@/lib/supabase';
import { ParticipantSelector } from '@/components/ParticipantSelector';

interface Participant {
  id: string
  name: string
  email: string
  avatar_url?: string
}

export default function ScheduleEventScreen() {
  const { user } = useAuth();
  const { inviteParticipants } = useEventParticipants();
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);

  // Generate available dates (next 3 weeks)
  const generateAvailableDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 21; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push({
        value: date.toISOString().split('T')[0],
        label: date.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        })
      });
    }
    return dates;
  };

  // Generate available times (5am to 10pm)
  const generateAvailableTimes = () => {
    const times = [];
    for (let hour = 5; hour <= 22; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const displayTime = new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        times.push({
          value: timeString,
          label: displayTime
        });
      }
    }
    return times;
  };

  const handleCreateEvent = async () => {
    if (!title.trim() || !location.trim() || !selectedDate || !selectedTime) {
      Alert.alert('Missing Information', 'Please fill in title, location, date, and time');
      return;
    }

    if (!user) return;

    setLoading(true);
    try {
      // Create the event
      const { data: eventData, error: eventError } = await supabase
        .from('scheduled_events')
        .insert({
          organizer_id: user.id,
          title: title.trim(),
          location: location.trim(),
          event_date: selectedDate,
          event_time: selectedTime,
          description: description.trim(),
          max_participants: selectedParticipants.length + 1, // +1 for organizer
        })
        .select('id')
        .single();

      if (eventError || !eventData) {
        console.error('Error creating event:', eventError);
        Alert.alert('Error', 'Failed to create event. Please try again.');
        return;
      }

      // Invite participants if any are selected
      if (selectedParticipants.length > 0) {
        const participantIds = selectedParticipants.map(p => p.id);
        const inviteSuccess = await inviteParticipants(eventData.id, participantIds);
        
        if (!inviteSuccess) {
          Alert.alert('Warning', 'Event created but some invites may have failed to send.');
        }
      }

      Alert.alert(
        'Success!', 
        selectedParticipants.length > 0 
          ? `Event created and invites sent to ${selectedParticipants.length} people!`
          : 'Event created successfully!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert('Error', 'Failed to create event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                  <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Schedule Event</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        
        {/* Event Title */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Event Title</Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g., Morning Tennis Match"
            placeholderTextColor="#999"
            maxLength={100}
          />
        </View>

        {/* Location */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Location</Text>
          <View style={styles.inputWithIcon}>
                <Ionicons name="location" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.textInputWithIcon}
              value={location}
              onChangeText={setLocation}
              placeholder="Enter location"
              placeholderTextColor="#999"
              maxLength={200}
            />
          </View>
        </View>

        {/* Date Selection */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScrollView}>
            {generateAvailableDates().map((date) => (
              <TouchableOpacity
                key={date.value}
                style={[
                  styles.selectorOption,
                  selectedDate === date.value && styles.selectedOption
                ]}
                onPress={() => setSelectedDate(date.value)}
              >
                <Text style={[
                  styles.selectorText,
                  selectedDate === date.value && styles.selectedText
                ]}>
                  {date.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Time Selection */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Time</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScrollView}>
            {generateAvailableTimes().map((time) => (
              <TouchableOpacity
                key={time.value}
                style={[
                  styles.selectorOption,
                  selectedTime === time.value && styles.selectedOption
                ]}
                onPress={() => setSelectedTime(time.value)}
              >
                <Text style={[
                  styles.selectorText,
                  selectedTime === time.value && styles.selectedText
                ]}>
                  {time.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Participant Selector */}
        <ParticipantSelector
          selectedParticipants={selectedParticipants}
          onParticipantsChange={setSelectedParticipants}
          maxParticipants={7}
        />

        {/* Description */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Description (Optional)</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Add any additional details..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
            maxLength={500}
          />
        </View>

        {/* Create Button */}
        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreateEvent}
          disabled={loading}
        >
                <Ionicons name="calendar" size={20} color="white" style={styles.buttonIcon} />
          <Text style={styles.createButtonText}>
            {loading ? 'Creating Event...' : 'Create Event'}
          </Text>
        </TouchableOpacity>

        {selectedParticipants.length > 0 && (
          <Text style={styles.inviteNote}>
            Invites will be sent to {selectedParticipants.length} people via chat
          </Text>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: 'white',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    backgroundColor: 'white',
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  textInputWithIcon: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    paddingVertical: 16,
  },
  selectorScrollView: {
    maxHeight: 50,
  },
  selectorOption: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  selectedOption: {
    backgroundColor: '#FF8C42',
  },
  selectorText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#333',
  },
  selectedText: {
    color: 'white',
  },
  createButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 20,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  inviteNote: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
});
