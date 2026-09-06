import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  Modal,
  ScrollView,
  Alert,
  Linking,
  ActivityIndicator,
  NativeModules,
  Keyboard,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ImageView from '@/components/ImageView';
import { CachedImage } from '@/components/CachedImage';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useNotificationNavStore } from '@/store/useNotificationNavStore';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useMessageReactions } from '@/hooks/useMessageReactions';
import { useAuth } from '@/hooks/useAuth';
import { getOrCreateChat, findExistingChatId, useChats } from '@/hooks/useChats';
import { clearDmDraft, loadDmDraft, saveDmDraft } from '@/lib/chatDrafts';
import {
  scrollChatListToLatest,
  scrollChatListToLatestWithRetries,
} from '@/lib/chatListScroll';
import { supabase } from '@/lib/supabase';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { AppKeyboardAvoidingView } from '@/components/AppKeyboardAvoidingView';
import { ReactionDisplay } from '@/components/ReactionDisplay';
import { ReactionPicker, type ReactionPickerLayout } from '@/components/ReactionPicker';
import { MessageEditModal } from '@/components/MessageEditModal';
import { ParticipantSelector } from '@/components/ParticipantSelector';
import { useActivities } from '@/hooks/useActivities';
import { ICONS } from '@/lib/helperUtils';
import { useEventParticipants } from '@/hooks/useEventParticipants';
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';

const TIME_ITEM_HEIGHT = 44;
const SCREEN_WIDTH_CHAT = Dimensions.get('window').width;

interface Participant {
  id: string
  name: string
  email: string
  avatar_url?: string
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const inputBarBottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 12);
  const { id, name, inviteId } = useLocalSearchParams<{ id: string; name: string; inviteId?: string }>();
  const [newMessage, setNewMessage] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [eventLocation, setEventLocation] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [acceptedMeetings, setAcceptedMeetings] = useState<any[]>([]);
  const [chatInvites, setChatInvites] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedParticipants, setSelectedParticipants] = useState<Participant[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState('5');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM');
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');
  const [selectedActivityName, setSelectedActivityName] = useState<string>('');
  const [activitySearch, setActivitySearch] = useState('');
  const [showCustomActivityInput, setShowCustomActivityInput] = useState(false);
  const [customActivityName, setCustomActivityName] = useState('');
  const [reactionDetailsVisible, setReactionDetailsVisible] = useState(false);
  const [reactionDetailsLoading, setReactionDetailsLoading] = useState(false);
  const [reactionDetails, setReactionDetails] = useState<{ id: string; name: string; emojis: string[] }[]>([]);
  const [otherUserAvatar, setOtherUserAvatar] = useState<string | null>(null);
  const [locationMode, setLocationMode] = useState<'manual' | 'gps'>('manual');

  const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  const MINUTES = ['00','15','30','45'];
  const AMPM: Array<'AM' | 'PM'> = ['AM','PM'];
  const [isLocating, setIsLocating] = useState(false);

  const [isGalleryVisible, setIsGalleryVisible] = useState(false);
  const [galleryImages, setGalleryImages] = useState<{ uri: string }[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [chatMeta, setChatMeta] = useState<{
    participant_1: string;
    participant_2: string;
    last_read_p1: string | null;
    last_read_p2: string | null;
  } | null>(null);
  const [showPinnedMeeting, setShowPinnedMeeting] = useState(true);
  const [invitePreview, setInvitePreview] = useState<any | null>(null);
  const [showInvitePreview, setShowInvitePreview] = useState(false);
  
  const { user } = useAuth();
  const { markAsRead, setActiveChat } = useChats();
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    sendMessage,
    updateMessage,
    deleteMessage,
    refetch: refetchMessages,
  } = useChatMessages(chatId);
  const notificationNavNonce = useNotificationNavStore((s) => s.nonce);
  const notificationNavTarget = useNotificationNavStore((s) => s.target);
  const lastNotificationNavNonceRef = useRef(0);
  const chatMessageIds = (messages || []).map((m) => m.id);
  const { getReactions, getCurrentUserEmoji, toggleReaction } = useMessageReactions(
    chatMessageIds,
    'chat'
  );
  const [reactionPickerState, setReactionPickerState] = useState<{
    messageId: string;
    layout: ReactionPickerLayout;
  } | null>(null);
  const [chatMessageActionMenu, setChatMessageActionMenu] = useState<{
    message: any;
    layout: ReactionPickerLayout;
  } | null>(null);
  const [editChatMessage, setEditChatMessage] = useState<{ id: string; text: string } | null>(null);
  const messageLayoutRefs = useRef<Record<string, View | null>>({});
  const { activities } = useActivities();
  const { inviteParticipants } = useEventParticipants();
  const flatListRef = useRef<FlatList>(null);
  const didInitialScrollRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const pendingInitialScrollRef = useRef(true);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });

    if (!result.canceled) {
      // result.assets contains the array of selected images
      const uris = result.assets.map(asset => asset.uri);
      setSelectedImages(prev => [...prev, ...uris]);
    }
  };

  const openGallery = (imageUrls: string[], index: number) => {
    const formattedImages = imageUrls.map(url => ({ uri: url }));
    setGalleryImages(formattedImages);
    setGalleryIndex(index);
    setIsGalleryVisible(true);
  };

  const handleDateChange = (_event: any, date?: Date) => {
    if (date) {
      setSelectedDateObj(date);
      setSelectedDate(date.toISOString().split('T')[0]);
      setShowDatePicker(false);
    }
  };

  const getSelectedDateLabel = () => {
    if (!selectedDate) return 'Select a date';
    const date = selectedDateObj ? selectedDateObj : new Date(selectedDate);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const to24Hour = (hour12: number, ampm: 'AM' | 'PM') => {
    if (ampm === 'AM') {
      return hour12 === 12 ? 0 : hour12;
    }
    return hour12 === 12 ? 12 : hour12 + 12;
  };

  const getNearestTimeSelection = () => {
    const now = new Date();
    const minutes = now.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 15) * 15;
    const rounded = new Date(now);
    rounded.setSeconds(0);
    rounded.setMilliseconds(0);
    if (roundedMinutes === 60) {
      rounded.setHours(rounded.getHours() + 1);
      rounded.setMinutes(0);
    } else {
      rounded.setMinutes(roundedMinutes);
    }

    // Clamp to 5:00 AM - 10:45 PM
    const min = new Date(now);
    min.setHours(5, 0, 0, 0);
    const max = new Date(now);
    max.setHours(22, 45, 0, 0);

    let target = rounded;
    if (target < min) target = min;
    if (target > max) target = max;

    const hour24 = target.getHours();
    const minute = target.getMinutes();
    const ampm: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

    return {
      hour: hour12.toString(),
      minute: minute.toString().padStart(2, '0'),
      ampm,
    };
  };

  const getSelectedTimeLabel = () => {
    if (!selectedTime) return 'Select a time';
    const [h, m] = selectedTime.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const openTimePicker = () => {
    if (selectedTime) {
      const [h, m] = selectedTime.split(':').map(Number);
      const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      setSelectedHour(hour12.toString());
      setSelectedMinute(m.toString().padStart(2, '0'));
      setSelectedAmPm(ampm);
    } else {
      const nearest = getNearestTimeSelection();
      setSelectedHour(nearest.hour);
      setSelectedMinute(nearest.minute);
      setSelectedAmPm(nearest.ampm);
    }
    setShowTimePicker(true);
  };

  const confirmTimeSelection = () => {
    if (!selectedDate) {
      Alert.alert('Select a Date', 'Please choose a date first.');
      return;
    }
    const hour24 = to24Hour(parseInt(selectedHour, 10), selectedAmPm);
    const timeValue = `${hour24.toString().padStart(2, '0')}:${selectedMinute}`;
    const dateObj = selectedDateObj || new Date(selectedDate);
    const selectedDateTime = new Date(dateObj);
    selectedDateTime.setHours(hour24, parseInt(selectedMinute, 10), 0, 0);

    const now = new Date();
    const selectedDateKey = dateObj.toISOString().split('T')[0];
    const todayKey = now.toISOString().split('T')[0];
    if (selectedDateKey === todayKey && selectedDateTime <= now) {
      Alert.alert('Choose a Future Time', 'Please select a time in the future.');
      return;
    }

    setSelectedTime(timeValue);
    setShowTimePicker(false);
  };

  const filteredActivities = activities
    .filter(a => a?.name)
    .filter(a => a.name.toLowerCase().includes(activitySearch.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectActivity = (activity: { id: string; name: string }) => {
    setSelectedActivityId(activity.id);
    setSelectedActivityName(activity.name);
    setShowCustomActivityInput(false);
    setCustomActivityName('');
    setShowActivityPicker(false);
  };


  // Combine messages and invites for FlatList (chronological)
  const combinedData = useMemo(() => {
    const data: any[] = [];
    messages.forEach((message) => {
      data.push({
        id: `message-${message.id}`,
        type: 'message',
        data: message,
        timestamp: new Date(message.created_at).getTime(),
      });
    });
    chatInvites.forEach((invite) => {
      data.push({
        id: `invite-${invite.id}`,
        type: 'invite',
        data: invite,
        timestamp: new Date(invite.created_at).getTime(),
      });
    });
    return data.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, chatInvites]);

  const nextAcceptedMeeting = useMemo(() => {
    if (!acceptedMeetings.length) return null;
    const sorted = [...acceptedMeetings].sort((a, b) => {
      const aTime = new Date(`${a.event_date}T${a.event_time}`).getTime();
      const bTime = new Date(`${b.event_date}T${b.event_time}`).getTime();
      return aTime - bTime;
    });
    return sorted[0];
  }, [acceptedMeetings]);

  const renderInviteInChat = (invite: any) => {
    const isFromMe = invite.sender_id === user?.id;
    const status = (invite.status || 'pending').toLowerCase();
    const isRecipient = invite.recipient_id === user?.id;
    const dateLabel = invite.event_date
      ? new Date(invite.event_date).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      : 'Date TBD';
    const timeLabel = invite.event_time
      ? new Date(`2000-01-01T${invite.event_time}`).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : 'Time TBD';
    const activityLabel = invite.activity_name || 'Activity';
    const statusLabel = status === 'pending' ? 'Pending' : status === 'accepted' ? 'Accepted' : 'Declined';
    const statusBg = status === 'pending' ? '#FFF3E0' : status === 'accepted' ? '#E8F5E9' : '#FFEBEE';
    const statusColor = status === 'pending' ? '#E65100' : status === 'accepted' ? '#2E7D32' : '#C62828';

    return (
      <View style={[styles.messageWrapper, isFromMe ? styles.myMessageWrapper : styles.otherMessageWrapper]}>
        <View style={[styles.inviteBubble, isFromMe ? styles.inviteBubbleMine : styles.inviteBubbleTheirs]}>
          <Text style={styles.inviteBubbleLabel}>
            {isFromMe ? 'You sent an invite' : `${invite.sender?.name || 'Someone'} invited you`}
          </Text>
          <Text style={styles.inviteBubbleActivity}>{activityLabel}</Text>
          {invite.location ? (
            <Text style={styles.inviteBubbleLocation} numberOfLines={2}>📍 {invite.location}</Text>
          ) : null}
          <Text style={styles.inviteBubbleDateTime}>
            📅 {dateLabel} · {timeLabel}
          </Text>
          <View style={[styles.inviteBubbleStatusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.inviteBubbleStatusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          {status === 'pending' && isRecipient && (
            <View style={styles.inviteBubbleActions}>
              <TouchableOpacity
                style={styles.inviteBubbleAcceptBtn}
                onPress={() => handleInviteResponse(invite.id, 'accepted')}
              >
                <Text style={styles.inviteBubbleAcceptBtnText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inviteBubbleDeclineBtn}
                onPress={() => handleInviteResponse(invite.id, 'declined')}
              >
                <Text style={styles.inviteBubbleDeclineBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  // Render item for FlatList
  const renderItem = ({ item }: { item: any }) => {
    let content: React.ReactNode = null;
    switch (item.type) {
      case 'acceptedMeeting':
        content = renderAcceptedMeeting({ item: item.data });
        break;
      case 'invite':
        content = renderInviteInChat(item.data);
        break;
      case 'message':
        content = renderMessage({ item: item.data });
        break;
      default:
        return null;
    }
    return <View style={styles.messageRow}>{content}</View>;
  };

  const fetchChatInvites = async () => {
    if (!chatId || !user) return;

    try {
      const { data, error } = await supabase
        .from('meetup_invites')
        .select(`
          *,
          sender:profiles!meetup_invites_sender_id_fkey(name),
          recipient:profiles!meetup_invites_recipient_id_fkey(name)
        `)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setChatInvites(data);
        const now = new Date();
        const upcomingAccepted = data.filter(
          (inv) => inv.status === 'accepted' && new Date(`${inv.event_date}T${inv.event_time}`) > now
        );
        setAcceptedMeetings(upcomingAccepted);
      }
    } catch (err) {
      console.error('Error fetching chat invites:', err);
    }
  };

  const initializeChat = async () => {
    if (!id || !user) {
      setError('Missing user information');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const existingChatId = await findExistingChatId(user.id, id);
      setChatId(existingChatId);
    } catch (error) {
      console.error('Error initializing chat:', error);
      setError('Error loading chat');
    } finally {
      setLoading(false);
    }
  };

  const ensureChatId = async (): Promise<string | null> => {
    if (chatId) return chatId;
    if (!user || !id) return null;
    const newChatId = await getOrCreateChat(user.id, id);
    if (newChatId) setChatId(newChatId);
    return newChatId;
  };

  const fetchChatMeta = async () => {
    if (!chatId) return;
    try {
      const { data, error } = await supabase
        .from('chats')
        .select('participant_1, participant_2, last_read_p1, last_read_p2')
        .eq('id', chatId)
        .maybeSingle();
      if (!error && data) {
        setChatMeta(data);
      }
    } catch (error) {
      console.error('Error fetching chat metadata:', error);
    }
  };

  const handleSendMessage = async () => {
    // Check if BOTH text and images are empty
    if ((!newMessage.trim() && selectedImages.length === 0) || !user) {
      return;
    }

    if (isSending) return;

    if (newMessage.trim().length > 1000) {
      Alert.alert('Message Too Long', 'Please keep messages under 1000 characters');
      return;
    }

    try {
      setIsSending(true);
      const activeChatId = await ensureChatId();
      if (!activeChatId) {
        Alert.alert('Error', 'Could not start this conversation. Please try again.');
        return;
      }

      const success = await sendMessage(newMessage, selectedImages, activeChatId);
      if (success) {
        setNewMessage('');
        setSelectedImages([]);
        void clearDmDraft(id);
        // Scroll to bottom after sending message
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        Alert.alert('Error', 'Failed to send message. Please try again.');
      }
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleInviteResponse = async (inviteIdValue: string, status: 'accepted' | 'declined') => {
    if (!inviteIdValue?.trim()) return;
    try {
      const { error } = await supabase
        .from('meetup_invites')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', inviteIdValue);

      if (error) {
        Alert.alert('Error', 'Failed to respond to invite');
        return;
      }

      if (status === 'accepted') {
        fetchChatInvites();
      }
      setShowInvitePreview(false);
    } catch (error) {
      console.error('Error responding to invite:', error);
      Alert.alert('Error', 'Failed to respond to invite');
    }
  };

  const handleScheduleEvent = async () => {
    if (!user || !id) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
      return;
    }
    if (!selectedDate || !selectedTime) {
      Alert.alert('Date & time required', 'Please select a date and time before sending the invite.');
      return;
    }
    if (!eventLocation?.trim()) {
      Alert.alert('Location required', 'Please enter or select a location.');
      return;
    }

    try {
      setIsInviting(true);
      const activeChatId = await ensureChatId();
      if (!activeChatId) {
        Alert.alert('Error', 'Could not start this conversation. Please try again.');
        return;
      }
      // Create the meetup invite
      const { data: inviteData, error } = await supabase
        .from('meetup_invites')
        .insert({
          sender_id: user.id,
          recipient_id: id,
          chat_id: activeChatId,
          location: eventLocation.trim(),
          event_date: selectedDate,
          event_time: selectedTime,
          activity_name: selectedActivityName || null,
          event_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          status: 'pending',
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating event:', error);
        Alert.alert('Error', 'Failed to send invite. Please try again.');
        return;
      }

      // If additional participants are selected, create a scheduled event and invite them
      if (selectedParticipants.length > 0 && inviteData) {
        // Create a scheduled event for the group
        const { data: eventData, error: eventError } = await supabase
          .from('scheduled_events')
          .insert({
            organizer_id: user.id,
            activity_id: selectedActivityId || null,
            title: `Meetup at ${eventLocation.trim()}`,
            location: eventLocation.trim(),
            event_date: selectedDate,
            event_time: selectedTime,
            description: selectedActivityName
              ? `Group meetup for ${selectedActivityName}`
              : `Group meetup organized from chat with ${name}`,
            max_participants: selectedParticipants.length + 2, // +2 for organizer and original chat partner
          })
          .select('id')
          .single();

        if (!eventError && eventData) {
          // Invite the additional participants
          const participantIds = selectedParticipants.map(p => p.id);
          await inviteParticipants(eventData.id, participantIds);
        }
      }
      
      Alert.alert('Success!', 'Invite sent successfully');
      fetchChatInvites();
      setEventLocation('');
      setSelectedDate('');
      setSelectedTime('');
      setSelectedActivityId('');
      setSelectedActivityName('');
      setSelectedParticipants([]);
      setShowScheduleModal(false);
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert('Error', 'Failed to send invite. Please try again.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    if (isLocating) return;

    try {
      setLocationMode('gps');
      setIsLocating(true);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow location access to use your current location.'
        );
        return;
      }

      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
        timeout: 10000,
        maximumAge: 5000,
      });

      if (!location) {
        location = await Location.getLastKnownPositionAsync({});
      }

      if (!location) {
        throw new Error('Location unavailable');
      }

      const [place] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (place) {
        const street = place.street || place.name;
        const city = place.city;
        const parts = [street, city].filter(Boolean);
        const formatted = parts.length > 0
          ? parts.join(', ')
          : `${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`;
        setEventLocation(formatted);
      } else {
        setEventLocation(
          `${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`
        );
      }
    } catch (error) {
      console.error('Error getting current location:', error);
      Alert.alert('Error', 'Unable to get your current location.');
    } finally {
      setIsLocating(false);
    }
  };

  const selectLocationMode = async (mode: 'manual' | 'gps') => {
    setLocationMode(mode);
    if (mode === 'gps') {
      await handleUseCurrentLocation();
    } else {
      setEventLocation('');
    }
  };

  const renderHeaderTitle = () => (
    <TouchableOpacity
      style={styles.headerTitleRow}
      onPress={() => {
        if (!id) return;
        router.push({
          pathname: '/(tabs)/people/[id]',
          params: { id, name: name || '', from: 'chat', fromChatUserId: id, fromChatName: name || '' },
        });
      }}
      activeOpacity={0.8}
    >
      <CachedImage
        source={otherUserAvatar ? { uri: otherUserAvatar } : ICONS.profileIcon}
        style={styles.headerAvatar}
      />
      <Text style={styles.headerTitle}>{name || 'Chat'}</Text>
    </TouchableOpacity>
  );

  const formatTime = (dateString: string) => {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const renderMessageText = (text: string, isMe: boolean) => {
    // Split text by URLs (starts with http:// or https://)
    const parts = text.split(/(https?:\/\/[^\s]+)/g);

    return parts.map((part, index) => {
      // If this part is a URL
      if (/(https?:\/\/[^\s]+)/g.test(part)) {
        return (
          <Text
            key={index}
            style={{
              textDecorationLine: 'underline',
              color: isMe ? 'white' : '#0000EE',
              fontWeight: 'bold'
            }}
            onPress={() => Linking.openURL(part)}
          >
            {part}
          </Text>
        );
      }
      // Normal text
      return <Text key={index}>{part}</Text>;
    });
  };

  const renderMessage = ({ item }: { item: any }) => {
    if (item.deleted_at) return null;

    const isMe = item.sender_id === user?.id;
    const hasImages = item.image_urls && item.image_urls.length > 0;
    const otherLastRead =
      chatMeta && user?.id
        ? (chatMeta.participant_1 === user.id ? chatMeta.last_read_p2 : chatMeta.last_read_p1)
        : null;
    const isRead =
      !!otherLastRead && new Date(otherLastRead).getTime() >= new Date(item.created_at).getTime();
    const isDelivered = !!otherLastRead && !isRead;

    const handleLongPress = () => {
      const view = messageLayoutRefs.current[item.id];
      view?.measureInWindow((x, y, width, height) => {
        setChatMessageActionMenu({
          message: item,
          layout: { x, y, width, height },
        });
      });
    };

    return (
      <TouchableOpacity
        activeOpacity={1}
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
      <View
        ref={(r) => {
          if (r) messageLayoutRefs.current[item.id] = r;
        }}
        style={[styles.messageWrapper, isMe ? styles.myMessageWrapper : styles.otherMessageWrapper]}
      >
        <View style={[styles.messageContainer, isMe ? styles.myMessage : styles.otherMessage]}>
          {/* Render Image Gallery */}
          {hasImages && (
            <View style={styles.imageGrid}>
              {item.image_urls.map((url: string, index: number) => (
                <TouchableOpacity 
                  key={index}
                  onPress={() => openGallery(item.image_urls, index)}
                  activeOpacity={0.9}
                >
                  <CachedImage 
                    source={{ uri: url }} 
                    style={[
                      styles.messageImage, 
                      item.image_urls.length > 1 ? styles.gridImage : styles.singleImage
                  ]} 
                  recyclingKey={url}
                />
              </TouchableOpacity>
            ))}
          </View>
          )}
          
          {(item.message ? (
            <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>
              {renderMessageText(item.message, isMe)}
            </Text>
          ) : null)}
          
          <View style={[styles.timestampRow, isMe ? styles.myTimestampRow : styles.otherTimestampRow]}>
            <Text style={[styles.timestamp, isMe ? styles.myTimestamp : styles.otherTimestamp]}>
              {formatTime(item.created_at)}
              {item.edited_at ? ' · Edited' : ''}
            </Text>
            {isMe && (
              <Ionicons
                name={isRead || isDelivered ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={isRead ? '#FFE2B5' : '#A0A0A0'}
                style={styles.tickIcon}
              />
            )}
          </View>
        </View>

        {getReactions(item.id).length > 0 && (
          <View style={styles.reactionAnchor}>
            <ReactionDisplay
              reactions={getReactions(item.id)}
              currentUserEmoji={getCurrentUserEmoji(item.id)}
              compact
              onPressReactions={() => openReactionDetails(item.id)}
            />
          </View>
        )}
      </View>
      </TouchableOpacity>
    );
  };

  const handleReactionSelect = (emoji: string) => {
    if (!reactionPickerState) return;
    toggleReaction(reactionPickerState.messageId, emoji);
    setReactionPickerState(null);
  };

  const openReactionPickerFromChatMenu = () => {
    if (!chatMessageActionMenu) return;
    setReactionPickerState({
      messageId: chatMessageActionMenu.message.id,
      layout: chatMessageActionMenu.layout,
    });
    setChatMessageActionMenu(null);
  };

  const openEditChatFromMenu = () => {
    if (!chatMessageActionMenu) return;
    const m = chatMessageActionMenu.message;
    if (m.deleted_at) {
      setChatMessageActionMenu(null);
      return;
    }
    setEditChatMessage({ id: m.id, text: m.message || '' });
    setChatMessageActionMenu(null);
  };

  const confirmDeleteChatFromMenu = () => {
    if (!chatMessageActionMenu) return;
    const id = chatMessageActionMenu.message.id;
    setChatMessageActionMenu(null);
    Alert.alert('Delete message?', 'This removes the message for both of you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const ok = await deleteMessage(id);
            if (!ok) Alert.alert('Could not delete', 'Please try again.');
          })();
        },
      },
    ]);
  };

  const openReactionDetails = async (messageId: string) => {
    const summaries = getReactions(messageId);
    if (!summaries || summaries.length === 0) return;
    const userIds = Array.from(
      new Set(
        summaries.flatMap((s) => s.userIds)
      )
    ).filter(Boolean);
    if (userIds.length === 0) return;

    setReactionDetailsVisible(true);
    setReactionDetailsLoading(true);
    setReactionDetails([]);
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      if (error) {
        console.error('Error loading reaction users:', error);
        return;
      }
      const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
      const items = userIds
        .map((id) => {
          const p = byId.get(id);
          if (!p) return null;
          const emojis = summaries
            .filter((s) => s.userIds.includes(id))
            .map((s) => s.emoji);
          return {
            id,
            name: p.name || 'Member',
            emojis,
          };
        })
        .filter((x): x is { id: string; name: string; avatar_url: string | null; emojis: string[] } => !!x);
      setReactionDetails(items);
    } finally {
      setReactionDetailsLoading(false);
    }
  };

  const renderAcceptedMeeting = ({ item }: { item: any }) => {
    const isMyMeeting = item.sender_id === user?.id;
    const senderName = item.sender?.name || 'Unknown';
    const recipientName = item.recipient?.name || 'Unknown';
    
    // Calculate time until meeting
    const meetingDateTime = new Date(`${item.event_date}T${item.event_time}`);
    const timeDiff = meetingDateTime.getTime() - currentTime.getTime();
    const hoursUntil = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutesUntil = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    
    // Determine reminder status
    let reminderText = '';
    let reminderStyle = {};
    
    if (timeDiff <= 0) {
      // Meeting has passed - this shouldn't show due to filtering, but just in case
      return null;
    } else if (hoursUntil === 0 && minutesUntil <= 60) {
      // Meeting is within the next hour
      reminderText = `🚨 Starting in ${minutesUntil} minutes!`;
      reminderStyle = { backgroundColor: '#FFEBEE', borderLeftColor: '#F44336' };
    } else if (hoursUntil === 1 && minutesUntil <= 60) {
      // Meeting is in about 1 hour
      reminderText = `⏰ Starting in 1 hour!`;
      reminderStyle = { backgroundColor: '#FFF3E0', borderLeftColor: '#FF9800' };
    } else if (hoursUntil < 24) {
      // Meeting is today
      reminderText = `📅 Today in ${hoursUntil} hours`;
      reminderStyle = { backgroundColor: '#E8F5E8', borderLeftColor: '#4CAF50' };
    } else {
      // Meeting is more than a day away
      const daysUntil = Math.floor(hoursUntil / 24);
      reminderText = `📅 In ${daysUntil} day${daysUntil > 1 ? 's' : ''}`;
      reminderStyle = { backgroundColor: '#E8F5E8', borderLeftColor: '#4CAF50' };
    }
    
    return (
      <View style={[styles.acceptedMeetingContainer, reminderStyle]}>
        <View style={styles.meetingHeader}>
          <Text style={styles.meetingTitle}>
            ✅ Meeting Confirmed
          </Text>
          <Text style={styles.reminderText}>{reminderText}</Text>
          <Text style={styles.meetingParticipants}>
            {senderName} & {recipientName}
          </Text>
        </View>
        
        <View style={styles.meetingDetails}>
          <Text style={styles.meetingLocation}>📍 {item.location}</Text>
          {item.activity_name ? (
            <Text style={styles.inviteActivity}>🏷️ Activity: {item.activity_name}</Text>
          ) : null}
          <Text style={styles.meetingDateTime}>
            📅 {new Date(item.event_date).toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            })} at {new Date(`2000-01-01T${item.event_time}`).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })}
          </Text>
        </View>
      </View>
    );
  };

  useEffect(() => {
    initializeChat();
  }, [id, user]);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching profile avatar:', error);
          return;
        }
        if (isMounted) {
          setOtherUserAvatar(data?.avatar_url ?? null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      setShowDatePicker(false);
    }
  }, []);

  const hasNativeDatePicker = !!NativeModules.RNDateTimePicker;

  useEffect(() => {
    if (chatId) {
      fetchChatInvites();
      markAsRead(chatId);
      fetchChatMeta();
    }
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;
    const sub = supabase
      .channel(`meetup_invites_${chatId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetup_invites', filter: `chat_id=eq.${chatId}` },
        () => fetchChatInvites()
      )
      .subscribe();
    return () => {
      sub.unsubscribe();
    };
  }, [chatId]);

  useEffect(() => {
    const loadInvitePreview = async () => {
      if (!inviteId || !user) return;
      try {
        const { data, error } = await supabase
          .from('meetup_invites')
          .select(`
            id,
            sender_id,
            recipient_id,
            location,
            event_date,
            event_time,
            status,
            activity_name,
            sender:profiles!meetup_invites_sender_id_fkey(name),
            recipient:profiles!meetup_invites_recipient_id_fkey(name)
          `)
          .eq('id', inviteId)
          .maybeSingle();

        if (error || !data) return;
        if (data.recipient_id !== user.id) return;
        if (data.status !== 'pending') return;

        setInvitePreview(data);
        setShowInvitePreview(true);
      } catch (error) {
        console.error('Error loading invite preview:', error);
      }
    };

    loadInvitePreview();
  }, [inviteId, user?.id]);

  // Update current time every minute for countdown timers
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!id) return;
    void loadDmDraft(id).then((text) => setNewMessage(text));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => {
      void saveDmDraft(id, newMessage);
    }, 400);
    return () => clearTimeout(timer);
  }, [id, newMessage]);

  const scrollMessagesToLatest = useCallback((animated = false) => {
    scrollChatListToLatest(flatListRef, animated);
  }, []);

  const finishInitialScroll = useCallback(() => {
    if (!pendingInitialScrollRef.current) return;
    pendingInitialScrollRef.current = false;
    didInitialScrollRef.current = true;
  }, []);

  const refetchMessagesRef = useRef(refetchMessages);
  refetchMessagesRef.current = refetchMessages;

  // Reset scroll state when switching chats
  useEffect(() => {
    pendingInitialScrollRef.current = true;
    didInitialScrollRef.current = false;
    stickToBottomRef.current = true;
  }, [id, chatId]);

  useFocusEffect(
    useCallback(() => {
      if (chatId) void refetchMessagesRef.current();
    }, [chatId])
  );

  useEffect(() => {
    if (notificationNavTarget !== 'dm') return;
    if (notificationNavNonce === lastNotificationNavNonceRef.current) return;
    lastNotificationNavNonceRef.current = notificationNavNonce;
    useNotificationNavStore.setState({ target: null });
    if (chatId) void refetchMessagesRef.current();
  }, [notificationNavNonce, notificationNavTarget, chatId]);

  const handleMessagesContentSizeChange = useCallback(() => {
    if (!combinedData?.length) return;
    if (pendingInitialScrollRef.current) {
      scrollChatListToLatest(flatListRef, false);
      return;
    }
    if (stickToBottomRef.current) {
      scrollChatListToLatest(flatListRef, true);
    }
  }, [combinedData?.length]);

  // Snap to the latest message once data is loaded (content may still be measuring).
  useEffect(() => {
    if (messagesLoading || !combinedData?.length || !pendingInitialScrollRef.current) return;
    const cancel = scrollChatListToLatestWithRetries(flatListRef, finishInitialScroll);
    return cancel;
  }, [messagesLoading, combinedData.length, finishInitialScroll]);

  // Auto-scroll when new messages arrive (only if user is already at the bottom)
  useEffect(() => {
    if (messagesLoading || !combinedData?.length || !didInitialScrollRef.current) return;
    if (stickToBottomRef.current) {
      requestAnimationFrame(() => scrollMessagesToLatest(true));
    }
  }, [messagesLoading, combinedData?.length, scrollMessagesToLatest]);

  const handleMessagesScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - layoutMeasurement.height - contentOffset.y;
    stickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  // 1. Set this chat as "Active" so badges stay hidden while we are here
  useEffect(() => {
    if (chatId) {
      setActiveChat(chatId);
    }
    // Cleanup: When leaving the screen, clear the active chat
    return () => {
      setActiveChat(null);
    };
  }, [chatId]);

  useEffect(() => {
    setShowPinnedMeeting(true);
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;
    const channel = supabase
      .channel(`chat_meta_${chatId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chats', filter: `id=eq.${chatId}` },
        (payload) => {
          const next = payload.new as {
            participant_1: string;
            participant_2: string;
            last_read_p1: string | null;
            last_read_p2: string | null;
          };
          setChatMeta(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  // 2. Whenever a NEW message arrives (messages array changes), mark it as read immediately
  useEffect(() => {
    if (chatId && messages.length > 0) {
      markAsRead(chatId);
    }
  }, [messages.length, chatId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/chats')}>
                <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          {renderHeaderTitle()}
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContainer}>
          <LoadingSpinner size={32} />
          <Text style={[styles.loadingText, { marginTop: 16 }]}>Loading chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/chats')}>
                <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          {renderHeaderTitle()}
          <View style={styles.placeholder} />
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializeChat}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ReactionPicker
        visible={!!reactionPickerState}
        anchorLayout={reactionPickerState?.layout ?? null}
        onSelect={handleReactionSelect}
        onClose={() => setReactionPickerState(null)}
      />
      <MessageEditModal
        visible={!!editChatMessage}
        initialText={editChatMessage?.text ?? ''}
        title="Edit message"
        onClose={() => setEditChatMessage(null)}
        onSave={async (text) => {
          if (!editChatMessage) return false;
          const ok = await updateMessage(editChatMessage.id, text);
          if (!ok) Alert.alert('Could not save', 'Please try again.');
          return ok;
        }}
      />
      <Modal
        visible={!!chatMessageActionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setChatMessageActionMenu(null)}
      >
        <TouchableWithoutFeedback onPress={() => setChatMessageActionMenu(null)}>
          <View style={styles.messageActionOverlay}>
            {chatMessageActionMenu && (
              <TouchableWithoutFeedback>
                <View
                  style={[
                    styles.messageActionMenu,
                    (() => {
                      const msg = chatMessageActionMenu.message;
                      const own = msg.sender_id === user?.id;
                      const deleted = !!msg.deleted_at;
                      let rows = 1;
                      if (!deleted) {
                        rows += 1;
                        if (own) rows += 1;
                        if (own) rows += 1;
                      }
                      const menuWidth = 176;
                      const menuHeight = rows * 44 + 16;
                      const placeAbove = chatMessageActionMenu.layout.y - menuHeight - 8 > 56;
                      const left = Math.max(
                        12,
                        Math.min(
                          chatMessageActionMenu.layout.x + chatMessageActionMenu.layout.width / 2 - menuWidth / 2,
                          SCREEN_WIDTH_CHAT - menuWidth - 12
                        )
                      );
                      const top = placeAbove
                        ? chatMessageActionMenu.layout.y - menuHeight - 8
                        : chatMessageActionMenu.layout.y + chatMessageActionMenu.layout.height + 8;
                      return { left, top };
                    })(),
                  ]}
                >
                  {!chatMessageActionMenu.message.deleted_at && (
                    <TouchableOpacity style={styles.messageActionRow} onPress={openReactionPickerFromChatMenu}>
                      <Ionicons name="happy-outline" size={16} color="#333" />
                      <Text style={styles.messageActionText}>React</Text>
                    </TouchableOpacity>
                  )}
                  {chatMessageActionMenu.message.sender_id === user?.id &&
                    !chatMessageActionMenu.message.deleted_at && (
                      <TouchableOpacity style={styles.messageActionRow} onPress={openEditChatFromMenu}>
                        <Ionicons name="pencil-outline" size={16} color="#333" />
                        <Text style={styles.messageActionText}>Edit</Text>
                      </TouchableOpacity>
                    )}
                  {chatMessageActionMenu.message.sender_id === user?.id &&
                    !chatMessageActionMenu.message.deleted_at && (
                      <TouchableOpacity style={styles.messageActionRow} onPress={confirmDeleteChatFromMenu}>
                        <Ionicons name="trash-outline" size={16} color="#C62828" />
                        <Text style={[styles.messageActionText, { color: '#C62828' }]}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  <TouchableOpacity style={styles.messageActionRow} onPress={() => setChatMessageActionMenu(null)}>
                    <Ionicons name="close-outline" size={16} color="#666" />
                    <Text style={[styles.messageActionText, { color: '#666' }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            )}
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      <Modal
        visible={reactionDetailsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionDetailsVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setReactionDetailsVisible(false)}>
          <View style={styles.messageActionOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.reactionDetailsModal}>
                {reactionDetailsLoading ? (
                  <View style={styles.reactionDetailsLoading}>
                    <LoadingSpinner size={20} />
                  </View>
                ) : reactionDetails.length === 0 ? (
                  <Text style={styles.reactionDetailsEmpty}>No reactions yet.</Text>
                ) : (
                  reactionDetails.map((u) => (
                    <View key={u.id} style={styles.reactionDetailsRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reactionDetailsName}>{u.name}</Text>
                      </View>
                      <View style={styles.reactionDetailsEmojis}>
                        {u.emojis.map((e) => (
                          <Text key={e} style={styles.reactionDetailsEmoji}>
                            {e}
                          </Text>
                        ))}
                      </View>
                    </View>
                  ))
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/chats')}>
                <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        {renderHeaderTitle()}
        <View style={styles.headerActions}>
        <TouchableOpacity 
          style={styles.scheduleButton} 
          onPress={() => setShowScheduleModal(true)}
        >
                <Ionicons name="calendar" size={24} color="#FF8C42" />
            <Text style={styles.scheduleButtonText}>Private invite</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AppKeyboardAvoidingView style={styles.keyboardContainer}>
        {messagesLoading && messages.length === 0 ? (
          <View style={styles.centerContainer}>
            <LoadingSpinner size={32} />
            <Text style={[styles.loadingText, { marginTop: 16 }]}>Loading messages...</Text>
          </View>
        ) : messagesError ? (
          <View style={styles.centerContainer}>
            <Text style={styles.errorText}>{messagesError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => initializeChat()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : combinedData.length > 0 ? (
          <>
            {showInvitePreview && invitePreview && (
              <View style={styles.invitePreviewCard}>
                <View style={styles.invitePreviewHeader}>
                  <Text style={styles.invitePreviewTitle}>
                    Invite from {invitePreview.sender?.name || 'Member'}
                  </Text>
                  <TouchableOpacity
                    style={styles.invitePreviewClose}
                    onPress={() => setShowInvitePreview(false)}
                  >
                    <Ionicons name="close" size={14} color="#999" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.invitePreviewBody}>
                  {invitePreview.activity_name || 'Activity'} •{' '}
                  {new Date(invitePreview.event_date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  at{' '}
                  {new Date(`2000-01-01T${invitePreview.event_time}`).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </Text>
                <Text style={styles.invitePreviewMeta}>
                  {invitePreview.location || 'Location TBD'}
                </Text>
                <View style={styles.invitePreviewActions}>
                  <TouchableOpacity
                    style={styles.invitePreviewAccept}
                    onPress={() => handleInviteResponse(invitePreview.id, 'accepted')}
                  >
                    <Text style={styles.invitePreviewAcceptText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.invitePreviewDecline}
                    onPress={() => handleInviteResponse(invitePreview.id, 'declined')}
                  >
                    <Text style={styles.invitePreviewDeclineText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {nextAcceptedMeeting && showPinnedMeeting && (
              <View style={styles.pinnedMeeting}>
                <View style={styles.pinnedHeader}>
                  <View style={styles.pinnedHeaderLeft}>
                    <Ionicons name="pin" size={14} color="#FF8C42" />
                    <Text style={styles.pinnedTitle}>Upcoming Meetup</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.pinnedDismiss}
                    onPress={() => setShowPinnedMeeting(false)}
                    accessibilityLabel="Dismiss upcoming meetup"
                  >
                    <Ionicons name="close" size={14} color="#B0B0B0" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.pinnedBody}>
                  {nextAcceptedMeeting.activity_name || 'Activity'} •{' '}
                  {new Date(nextAcceptedMeeting.event_date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  at{' '}
                  {new Date(`2000-01-01T${nextAcceptedMeeting.event_time}`).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </Text>
                <Text style={styles.pinnedMeta}>
                  {nextAcceptedMeeting.location || 'Location TBD'}
                </Text>
              </View>
            )}
          <View style={styles.messagesListWrap}>
            <FlatList
              key={chatId ?? id}
              ref={flatListRef}
              style={styles.messagesList}
              contentContainerStyle={styles.messagesContainer}
              data={combinedData || []}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              initialNumToRender={Math.min(combinedData.length, 30)}
              onContentSizeChange={handleMessagesContentSizeChange}
              onScroll={handleMessagesScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
            />
          </View>
          </>
        ) : (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyTitle}>Start the conversation</Text>
            <Text style={styles.emptySubtitle}>
              Send a message to {name} to begin chatting
            </Text>
          </View>
        )}

        
          <View style={[styles.inputWrapper, { paddingBottom: inputBarBottomPad }]}>
            {selectedImages?.length > 0 && (
              <ScrollView horizontal contentContainerStyle={styles.previewContainer} showsHorizontalScrollIndicator={false}>
                {selectedImages?.map((uri, index) => (
                  <View key={index} style={styles.previewItem}>
                    <CachedImage source={{ uri }} style={styles.previewImage} />
                    <TouchableOpacity 
                      style={styles.removeImageButton} 
                      onPress={() => setSelectedImages(imgs => imgs.filter((_, i) => i !== index))}
                    >
                      <Ionicons name="close-circle" size={20} color="white" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
        <View style={styles.inputContainer}>
              <TouchableOpacity style={[styles.sendButton, {marginRight: 10}]} onPress={pickImage}>
                <Ionicons name="add-circle" size={28} color="white" />
              </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            maxLength={1000}
            multiline
          />
          <TouchableOpacity 
              style={[
                styles.sendButton,
                ((!newMessage.trim() && selectedImages.length === 0) ||
                  isSending) &&
                  styles.sendButtonDisabled,
              ]}
            onPress={handleSendMessage}
              disabled={
                (!newMessage.trim() && selectedImages.length === 0) || isSending
              }
          >
              {isSending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="send" size={20} color="white" />
              )}
          </TouchableOpacity>
            </View>
        </View>
      </AppKeyboardAvoidingView>

      <Modal
        visible={showScheduleModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowScheduleModal(false)}
      >
        <AppKeyboardAvoidingView
          style={styles.modalKeyboardContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Let's make a plan!</Text>
            <View style={styles.modalTitleSpacer} />
            <LinearGradient
              colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.scheduleDivider}
            />
            
            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Activity</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowActivityPicker(true)}
                >
                  <Ionicons
                    name="flash-outline"
                    size={18}
                    color={selectedActivityName ? '#333' : '#999'}
                  />
                  <Text style={[styles.datePickerText, !selectedActivityName && styles.datePickerPlaceholder]}>
                    {selectedActivityName || 'Select an activity'}
                  </Text>
                </TouchableOpacity>
                {showActivityPicker && (
                  <View style={styles.activityPicker}>
                    <View style={styles.searchContainerPill}>
                      <TextInput
                        style={styles.searchInputPill}
                        value={activitySearch}
                        onChangeText={setActivitySearch}
                        placeholder="Search activities"
                        placeholderTextColor="#999"
                      />
                    </View>
                    <ScrollView style={styles.activityList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {filteredActivities.map((activity) => (
                        <TouchableOpacity
                          key={activity.id}
                          style={styles.activityOption}
                          onPress={() => selectActivity(activity)}
                        >
                          <Text style={styles.activityOptionText}>{activity.name}</Text>
                        </TouchableOpacity>
                      ))}
                      {filteredActivities.length === 0 && (
                        <View style={styles.noResultsContainer}>
                          <Text style={styles.noResultsText}>No activities found</Text>
                        </View>
                      )}
                    </ScrollView>
                    <View style={styles.customActivityContainer}>
                      {!showCustomActivityInput ? (
                        <View style={styles.customActivityRow}>
                          <View style={styles.customActivityHintRow}>
                            <Text style={styles.customActivityHint} numberOfLines={1}>
                              Can't find your activity? Add your custom activity!
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.customActivityButton}
                            onPress={() => setShowCustomActivityInput(true)}
                          >
                            <Ionicons name="sparkles-outline" size={16} color="white" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.customActivityInputRow}>
                          <TextInput
                            style={styles.customActivityInput}
                            value={customActivityName}
                            onChangeText={setCustomActivityName}
                            placeholder="Enter activity name"
                            placeholderTextColor="#999"
                          />
                          <TouchableOpacity
                            style={styles.customActivityButton}
                            onPress={() => {
                              const trimmed = customActivityName.trim();
                              if (!trimmed) {
                                Alert.alert('Missing Activity', 'Please enter an activity name.');
                                return;
                              }
                              setSelectedActivityId('');
                              setSelectedActivityName(trimmed);
                              setShowActivityPicker(false);
                              setShowCustomActivityInput(false);
                              setCustomActivityName('');
                            }}
                          >
                            <Text style={styles.customActivityButtonText}>Use</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Location</Text>
                <View style={styles.locationModeRow}>
                  <TouchableOpacity
                    style={[
                      styles.locationModePill,
                      locationMode === 'manual' && styles.locationModePillActive
                    ]}
                    onPress={() => selectLocationMode('manual')}
                  >
                    <Text
                      style={[
                        styles.locationModeText,
                        locationMode === 'manual' && styles.locationModeTextActive
                      ]}
                    >
                      Enter manually
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.locationModePill,
                      locationMode === 'gps' && styles.locationModePillActive
                    ]}
                    onPress={() => selectLocationMode('gps')}
                  >
                    <Text
                      style={[
                        styles.locationModeText,
                        locationMode === 'gps' && styles.locationModeTextActive
                      ]}
                    >
                      Use GPS
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.locationRow}>
                  <TextInput
                    style={[styles.modalTextInput, styles.locationInput]}
                    value={eventLocation}
                    onChangeText={setEventLocation}
                    placeholder={locationMode === 'gps' ? 'Fetching location...' : 'Enter location'}
                    placeholderTextColor="#999"
                    editable={locationMode === 'manual'}
                  />
                  <TouchableOpacity
                    style={[styles.gpsButton, isLocating && styles.gpsButtonDisabled]}
                    onPress={() => {
                      if (locationMode === 'manual') {
                        Keyboard.dismiss();
                        return;
                      }
                      handleUseCurrentLocation();
                    }}
                    disabled={isLocating}
                  >
                    {isLocating ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Ionicons
                        name={locationMode === 'manual' ? 'arrow-forward' : 'location'}
                        size={18}
                        color="white"
                      />
                    )}
                  </TouchableOpacity>
                </View>
                <Text style={styles.locationHint}>
                  * Use GPS to auto-fill your current location.
                </Text>
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Add people (optional)</Text>
                <Text style={styles.inputSubLabel}>
                  Invite up to 7 more people to this meetup
                </Text>
                <View style={styles.alreadyInvitedRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                  <Text style={styles.alreadyInvitedText}>
                    Already invited: {name || 'Chat partner'}
                  </Text>
                </View>
                <ParticipantSelector
                  selectedParticipants={selectedParticipants}
                  onParticipantsChange={setSelectedParticipants}
                  maxParticipants={7}
                  excludedUserIds={[user?.id || '', id]}
                />
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Date</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      Alert.alert('Not supported on web', 'Please use the iOS or Android app to pick a date.');
                      return;
                    }
                    setShowDatePicker(true);
                  }}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={selectedDate ? '#333' : '#999'}
                  />
                  <Text style={[styles.datePickerText, !selectedDate && styles.datePickerPlaceholder]}>
                    {getSelectedDateLabel()}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && Platform.OS !== 'web' && (
                  <Modal
                    visible={showDatePicker}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowDatePicker(false)}
                  >
                    <TouchableOpacity
                      style={styles.datePickerOverlay}
                      activeOpacity={1}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <TouchableOpacity
                        activeOpacity={1}
                        style={styles.datePickerModal}
                        onPress={() => {}}
                      >
                        <DateTimePicker
                          value={selectedDateObj || new Date()}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                          minimumDate={new Date(new Date().setHours(0, 0, 0, 0))}
                          onChange={handleDateChange}
                          style={styles.datePickerNative}
                        />
                        {Platform.OS === 'ios' && (
                          <TouchableOpacity
                            style={styles.datePickerDoneButton}
                            onPress={() => {
                              if (!selectedDateObj) {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                setSelectedDateObj(today);
                                setSelectedDate(today.toISOString().split('T')[0]);
                              }
                              setShowDatePicker(false);
                            }}
                          >
                            <Text style={styles.datePickerDoneText}>Done</Text>
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </Modal>
                )}
              </View>

              <View style={styles.formInputContainer}>
                <Text style={styles.inputLabel}>Time</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={openTimePicker}
                >
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={selectedTime ? '#333' : '#999'}
                  />
                  <Text style={[styles.datePickerText, !selectedTime && styles.datePickerPlaceholder]}>
                    {getSelectedTimeLabel()}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[
                  styles.scheduleConfirmButton,
                  isInviting && { opacity: 0.7 },
                  (!selectedDate || !selectedTime) && styles.scheduleConfirmButtonDisabled,
                ]}
                onPress={handleScheduleEvent}
                disabled={isInviting || !selectedDate || !selectedTime}
              >
                {
                  isInviting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                <Text style={styles.scheduleConfirmText}>Send Invite</Text>
                  )
                }
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowScheduleModal(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
            {showTimePicker && (
              <View style={styles.timePickerOverlayInline} pointerEvents="box-none">
                <TouchableOpacity
                  style={styles.timePickerOverlayTap}
                  activeOpacity={1}
                  onPress={() => setShowTimePicker(false)}
                />
                <View style={styles.timePickerModal}>
                  <Text style={styles.timePickerTitle}>Select time</Text>
                  <View style={styles.timePickerColumns}>
                    <View style={styles.timePickerColumn}>
                      <View style={styles.timePickerWheel}>
                        <FlatList
                          data={HOURS}
                          keyExtractor={(item) => item}
                          showsVerticalScrollIndicator={false}
                          snapToInterval={TIME_ITEM_HEIGHT}
                          decelerationRate="fast"
                          getItemLayout={(_, index) => ({
                            length: TIME_ITEM_HEIGHT,
                            offset: TIME_ITEM_HEIGHT * index,
                            index,
                          })}
                          contentContainerStyle={styles.timePickerList}
                          initialScrollIndex={HOURS.indexOf(selectedHour)}
                          onMomentumScrollEnd={(event) => {
                            const index = Math.round(event.nativeEvent.contentOffset.y / TIME_ITEM_HEIGHT);
                            const value = HOURS[Math.max(0, Math.min(index, HOURS.length - 1))];
                            setSelectedHour(value);
                          }}
                          renderItem={({ item, index }) => {
                            const selectedIndex = HOURS.indexOf(selectedHour);
                            const distance = Math.abs(index - selectedIndex);
                            const opacity = distance === 0 ? 1 : distance === 1 ? 0.6 : distance === 2 ? 0.35 : 0.2;
                            const isSelected = item === selectedHour;
                            return (
                              <TouchableOpacity
                                style={[styles.timePickerItem, isSelected && styles.timePickerItemSelected]}
                                onPress={() => setSelectedHour(item)}
                              >
                                <Text style={[
                                  styles.timePickerItemText,
                                  isSelected && styles.timePickerItemTextSelected,
                                  { opacity },
                                ]}>
                                  {item}
                                </Text>
                              </TouchableOpacity>
                            );
                          }}
                        />
                        <View style={styles.timePickerCenterHighlight} />
                      </View>
                    </View>

                    <View style={styles.timePickerColumn}>
                      <View style={styles.timePickerWheel}>
                        <FlatList
                          data={MINUTES}
                          keyExtractor={(item) => item}
                          showsVerticalScrollIndicator={false}
                          snapToInterval={TIME_ITEM_HEIGHT}
                          decelerationRate="fast"
                          getItemLayout={(_, index) => ({
                            length: TIME_ITEM_HEIGHT,
                            offset: TIME_ITEM_HEIGHT * index,
                            index,
                          })}
                          contentContainerStyle={styles.timePickerList}
                          initialScrollIndex={MINUTES.indexOf(selectedMinute)}
                          onMomentumScrollEnd={(event) => {
                            const index = Math.round(event.nativeEvent.contentOffset.y / TIME_ITEM_HEIGHT);
                            const value = MINUTES[Math.max(0, Math.min(index, MINUTES.length - 1))];
                            setSelectedMinute(value);
                          }}
                          renderItem={({ item, index }) => {
                            const selectedIndex = MINUTES.indexOf(selectedMinute);
                            const distance = Math.abs(index - selectedIndex);
                            const opacity = distance === 0 ? 1 : distance === 1 ? 0.6 : distance === 2 ? 0.35 : 0.2;
                            const isSelected = item === selectedMinute;
                            return (
                              <TouchableOpacity
                                style={[styles.timePickerItem, isSelected && styles.timePickerItemSelected]}
                                onPress={() => setSelectedMinute(item)}
                              >
                                <Text style={[
                                  styles.timePickerItemText,
                                  isSelected && styles.timePickerItemTextSelected,
                                  { opacity },
                                ]}>
                                  {item}
                                </Text>
                              </TouchableOpacity>
                            );
                          }}
                        />
                        <View style={styles.timePickerCenterHighlight} />
                      </View>
                    </View>

                    <View style={styles.timePickerColumn}>
                      <View style={styles.timePickerWheel}>
                        <FlatList
                          data={AMPM}
                          keyExtractor={(item) => item}
                          showsVerticalScrollIndicator={false}
                          snapToInterval={TIME_ITEM_HEIGHT}
                          decelerationRate="fast"
                          getItemLayout={(_, index) => ({
                            length: TIME_ITEM_HEIGHT,
                            offset: TIME_ITEM_HEIGHT * index,
                            index,
                          })}
                          contentContainerStyle={styles.timePickerList}
                          initialScrollIndex={AMPM.indexOf(selectedAmPm)}
                          onMomentumScrollEnd={(event) => {
                            const index = Math.round(event.nativeEvent.contentOffset.y / TIME_ITEM_HEIGHT);
                            const value = AMPM[Math.max(0, Math.min(index, AMPM.length - 1))];
                            setSelectedAmPm(value);
                          }}
                          renderItem={({ item, index }) => {
                            const selectedIndex = AMPM.indexOf(selectedAmPm);
                            const distance = Math.abs(index - selectedIndex);
                            const opacity = distance === 0 ? 1 : distance === 1 ? 0.6 : distance === 2 ? 0.35 : 0.2;
                            const isSelected = item === selectedAmPm;
                            return (
                              <TouchableOpacity
                                style={[styles.timePickerItem, isSelected && styles.timePickerItemSelected]}
                                onPress={() => setSelectedAmPm(item)}
                              >
                                <Text style={[
                                  styles.timePickerItemText,
                                  isSelected && styles.timePickerItemTextSelected,
                                  { opacity },
                                ]}>
                                  {item}
                                </Text>
                              </TouchableOpacity>
                            );
                          }}
                        />
                        <View style={styles.timePickerCenterHighlight} />
                      </View>
                    </View>
                  </View>

                  <View style={styles.timePickerActions}>
                    <TouchableOpacity
                      style={styles.timePickerCancel}
                      onPress={() => setShowTimePicker(false)}
                    >
                      <Text style={styles.timePickerCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.timePickerConfirm}
                      onPress={confirmTimeSelection}
                    >
                      <Text style={styles.timePickerConfirmText}>Set Time</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
        </AppKeyboardAvoidingView>
      </Modal>
      <ImageView
        images={galleryImages}
        imageIndex={galleryIndex}
        visible={isGalleryVisible}
        onRequestClose={() => setIsGalleryVisible(false)}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
      />

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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 4,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  scheduleButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  keyboardContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  messagesList: {
    flex: 1,
  },
  messagesListWrap: {
    flex: 1,
    position: 'relative',
  },
  messagesContainer: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    padding: 16,
  },
  messageRow: {
    width: '100%',
  },
  messageWrapper: {
    position: 'relative',
    marginBottom: 12,
    maxWidth: '80%',
    flexShrink: 1,
  },
  myMessageWrapper: {
    alignSelf: 'flex-end',
  },
  otherMessageWrapper: {
    alignSelf: 'flex-start',
  },
  messageContainer: {
    padding: 12,
    borderRadius: 16,
  },
  myMessage: {
    backgroundColor: '#FF8C42',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    backgroundColor: 'white',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  messageText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    marginBottom: 4,
  },
  myMessageText: {
    color: 'white',
  },
  otherMessageText: {
    color: '#333',
  },
  timestamp: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  myTimestampRow: {
    justifyContent: 'flex-end',
  },
  otherTimestampRow: {
    justifyContent: 'flex-start',
  },
  reactionAnchor: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  messageActionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageActionMenu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 176,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  messageActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  messageActionText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: '#333',
  },
  chatDeletedBubble: {
    opacity: 0.92,
  },
  chatDeletedText: {
    fontStyle: 'italic',
    opacity: 0.85,
  },
  reactionDetailsModal: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    minWidth: '70%',
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  reactionDetailsLoading: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  reactionDetailsEmpty: {
    fontSize: 13,
    color: '#666',
    paddingVertical: 8,
  },
  reactionDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  reactionDetailsName: {
    fontSize: 14,
    color: '#111',
  },
  reactionDetailsEmojis: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  reactionDetailsEmoji: {
    fontSize: 18,
    marginLeft: 4,
  },
  myTimestamp: {
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
  },
  otherTimestamp: {
    color: '#999',
  },
  tickIcon: {
    marginTop: 1,
  },
  pinnedMeeting: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFF7EE',
    borderWidth: 1,
    borderColor: '#FFE2CC',
  },
  pinnedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  pinnedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pinnedDismiss: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#FF8C42',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  pinnedBody: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 2,
  },
  pinnedMeta: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#777',
  },
  invitePreviewCard: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFF7EE',
    borderWidth: 1,
    borderColor: '#FFE2CC',
  },
  invitePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  invitePreviewTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#FF8C42',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  invitePreviewClose: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invitePreviewBody: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 2,
  },
  invitePreviewMeta: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#777',
  },
  invitePreviewActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  invitePreviewAccept: {
    flex: 1,
    backgroundColor: '#FF8C42',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  invitePreviewAcceptText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  invitePreviewDecline: {
    flex: 1,
    backgroundColor: '#F2F2F2',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  invitePreviewDeclineText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    alignItems: 'flex-end',
  },
  textInput: {
    fontFamily: 'Inter_400Regular',
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    maxHeight: 100,
    backgroundColor: '#f9f9f9',
  },
  sendButton: {
    backgroundColor: '#FF8C42',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#f44336',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#77A6F7',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: 'white',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  modalKeyboardContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    margin: 20,
    width: '90%',
    maxWidth: 400,
    height: Dimensions.get('window').height * 0.85,
    maxHeight: 600,
    flexDirection: 'column',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalTitleSpacer: {
    height: 12,
  },
  scheduleDivider: {
    height: 3,
    borderRadius: 2,
    marginBottom: 16,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalScrollView: {
    flex: 1,
    minHeight: 200,
  },
  modalScrollContent: {
    paddingBottom: 16,
  },
  formInputContainer: {
    marginBottom: 20,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  locationModePill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f7f7f7',
  },
  locationModePillActive: {
    borderColor: '#FF8C42',
    backgroundColor: '#FFF3E0',
  },
  locationModeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  locationModeTextActive: {
    color: '#FF8C42',
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 8,
  },
  inputSubLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginBottom: 12,
  },
  alreadyInvitedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3FFF5',
    borderWidth: 1,
    borderColor: '#CDEFD5',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  alreadyInvitedText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#2E7D32',
  },
  modalTextInput: {
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9f9f9',
    fontSize: 16,
    flex: 1,
  },
  locationInput: {
    marginRight: 10,
  },
  gpsButton: {
    backgroundColor: '#FF8C42',
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsButtonDisabled: {
    opacity: 0.7,
  },
  locationHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#999',
    marginTop: 6,
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
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  datePickerText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  datePickerPlaceholder: {
    color: '#999',
  },
  activityPicker: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 12,
  },
  searchContainerPill: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchInputPill: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  activityList: {
    maxHeight: 180,
  },
  activityOption: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f3f3',
  },
  activityOptionText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
  },
  customActivityContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
  },
  customActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  customActivityHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  customActivityHint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    flex: 1,
  },
  customActivityInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customActivityInput: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  customActivityButton: {
    backgroundColor: '#FF8C42',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  customActivityButtonText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
  },
  datePickerContainer: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 8,
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  datePickerModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
  },
  datePickerNative: {
    height: 320,
  },
  datePickerDoneButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  datePickerDoneText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  timePickerModal: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    zIndex: 2,
  },
  timePickerOverlayInline: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePickerOverlayTap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  timePickerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  timePickerColumns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  timePickerColumn: {
    flex: 1,
  },
  timePickerWheel: {
    height: 220,
    borderRadius: 14,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#EEE',
    overflow: 'hidden',
  },
  timePickerLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  timePickerList: {
    paddingVertical: 88,
  },
  timePickerCenterHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 88,
    height: TIME_ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#FFE0C2',
    backgroundColor: 'rgba(255, 140, 66, 0.08)',
  },
  timePickerItem: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  timePickerItemSelected: {
    backgroundColor: '#FFF3E0',
  },
  timePickerItemText: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
  },
  timePickerItemTextSelected: {
    color: '#FF8C42',
  },
  timePickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  timePickerCancel: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  timePickerCancelText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  timePickerConfirm: {
    backgroundColor: '#FF8C42',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  timePickerConfirmText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  modalButtons: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  scheduleConfirmButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  scheduleConfirmButtonDisabled: {
    backgroundColor: '#9E9E9E',
    opacity: 0.9,
  },
  scheduleConfirmText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  placeholder: {
    width: 40,
  },
  inviteBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  inviteBubbleMine: {
    backgroundColor: '#E3F2FD',
    borderLeftColor: '#2196F3',
  },
  inviteBubbleTheirs: {
    backgroundColor: '#FFF8E1',
    borderLeftColor: '#FF8F00',
  },
  inviteBubbleLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 6,
  },
  inviteBubbleActivity: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#1565C0',
    marginBottom: 4,
  },
  inviteBubbleLocation: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#555',
    marginBottom: 4,
  },
  inviteBubbleDateTime: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#555',
    marginBottom: 8,
  },
  inviteBubbleStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  inviteBubbleStatusText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  inviteBubbleActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  inviteBubbleAcceptBtn: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  inviteBubbleAcceptBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  inviteBubbleDeclineBtn: {
    flex: 1,
    backgroundColor: '#F44336',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  inviteBubbleDeclineBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  inviteContainer: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  inviteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inviteTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#1565C0',
    flex: 1,
  },
  inviteStatus: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#FF9800',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  inviteDetails: {
    marginBottom: 12,
  },
  inviteLocation: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    marginBottom: 4,
  },
  inviteActivity: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    marginBottom: 4,
  },
  inviteDateTime: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  acceptText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  declineButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  declineText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  acceptedMeetingContainer: {
    backgroundColor: '#E8F5E8',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  meetingHeader: {
    marginBottom: 8,
  },
  meetingTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#2E7D32',
    marginBottom: 4,
  },
  meetingParticipants: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#388E3C',
  },
  reminderText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 4,
  },
  meetingDetails: {
    marginTop: 8,
  },
  meetingLocation: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    marginBottom: 4,
  },
  meetingDateTime: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  inputWrapper: {
    backgroundColor: 'white',
    paddingBottom: 0,
  },
  previewContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachButton: {
    marginRight: 10,
    justifyContent: 'center',
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  messageImage: {
    borderRadius: 8,
    backgroundColor: '#e1e4e8',
    marginBottom: 4,
  },
  singleImage: {
    width: 200,
    height: 200,
    resizeMode: 'cover',
  },
  gridImage: {
    width: 100, 
    height: 100,
    resizeMode: 'cover',
  },
  previewItem: {
    marginRight: 10,
    position: 'relative',
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
  },
});
