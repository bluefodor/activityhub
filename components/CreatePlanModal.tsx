import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Keyboard,
  Image,
  TouchableWithoutFeedback,
  Switch,
} from 'react-native';
import { AppKeyboardAvoidingView } from '@/components/AppKeyboardAvoidingView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useActivityStore } from '@/store/useActivityStore';
import { useAuth } from '@/hooks/useAuth';
import { usePlans } from '@/hooks/usePlans';
import { requireAuth } from '@/lib/authHelpers';
import { supabase } from '@/lib/supabase';
import {
  buildLocalPlanDateTime,
  isPlanLocalDateTimePast,
  parseLocalYyyyMmDd,
} from '@/lib/planDateTime';
import { formatNominatimAddressShort } from '@/lib/nominatimAddress';
import {
  PLAN_SKILL_LEVELS,
  type PlanSkillLevel,
} from '@/lib/planSkillLevel';

const HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = ['00', '15', '30', '45'];
const AMPM: Array<'AM' | 'PM'> = ['AM', 'PM'];
const TIME_ITEM_HEIGHT = 44;

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreatePlanModal({ visible, onClose, onCreated }: Props) {
  const insets = useSafeAreaInsets();
  const { activityId, activity } = useActivityStore();
  const { user } = useAuth();
  const { creating, createPlan } = usePlans(activityId);

  // Form state
  const [eventTitle, setEventTitle] = useState('');
  const [planSkillLevel, setPlanSkillLevel] = useState<PlanSkillLevel>('Beginner');
  const [eventLocation, setEventLocation] = useState('');
  const [locationMode, setLocationMode] = useState<'manual' | 'gps'>('gps');
  const [isLocating, setIsLocating] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDateObj, setSelectedDateObj] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState('6');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('PM');
  const [eventNote, setEventNote] = useState('');
  const [limitRsvps, setLimitRsvps] = useState(false);
  const [maxRsvps, setMaxRsvps] = useState('6');
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [planPhotoUri, setPlanPhotoUri] = useState<string | null>(null);
  const [announceInForum, setAnnounceInForum] = useState(false);
  const [forumMessageDraft, setForumMessageDraft] = useState('');
  const [showExtraOptions, setShowExtraOptions] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<{ short: string; full: string }[]>([]);
  const [locationSuggestionsLoading, setLocationSuggestionsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const locationSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNominatimRequestRef = useRef<number>(0);
  const geocodeSeqRef = useRef(0);

  // Keyboard height tracking
  // Auto-regenerate forum draft when key fields change, only if it matches the auto-generated pattern
  useEffect(() => {
    if (announceInForum) {
      setForumMessageDraft(buildForumDraft());
    }
  }, [eventTitle, eventLocation, selectedDate, selectedTime]);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const subHide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [visible]);

  // Location search debounce (GPS mode)
  useEffect(() => {
    if (locationMode !== 'gps') {
      setLocationSuggestions([]);
      setLocationSuggestionsLoading(false);
      return;
    }
    const query = eventLocation.trim();
    if (query.length < 3) {
      setLocationSuggestions([]);
      return;
    }
    if (locationSearchDebounceRef.current) clearTimeout(locationSearchDebounceRef.current);
    locationSearchDebounceRef.current = setTimeout(async () => {
      const now = Date.now();
      const elapsed = now - lastNominatimRequestRef.current;
      if (elapsed < 1100) await new Promise((r) => setTimeout(r, 1100 - elapsed));
      lastNominatimRequestRef.current = Date.now();
      setLocationSuggestionsLoading(true);
      try {
        const q = encodeURIComponent(query);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&limit=5`,
          { headers: { 'User-Agent': 'TheActivityHub/1.0 (https://github.com/activeportland)' } }
        );
        const data = await res.json();
        setLocationSuggestions(
          Array.isArray(data)
            ? data.map((r: { display_name?: string; address?: Record<string, string> }) => {
                const full = r.display_name ?? '';
                const short = formatNominatimAddressShort(r) || full;
                return { short, full };
              })
            : []
        );
      } catch {
        setLocationSuggestions([]);
      } finally {
        setLocationSuggestionsLoading(false);
      }
    }, 500);
    return () => {
      if (locationSearchDebounceRef.current) clearTimeout(locationSearchDebounceRef.current);
    };
  }, [eventLocation, locationMode]);

  const toLocalDateString = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const to24Hour = (hour12: number, ampm: 'AM' | 'PM') => {
    if (ampm === 'AM') return hour12 === 12 ? 0 : hour12;
    return hour12 === 12 ? 12 : hour12 + 12;
  };

  const getSelectedDateLabel = () => {
    if (!selectedDate) return 'Select a date';
    const date = selectedDateObj || parseLocalYyyyMmDd(selectedDate);
    if (!date) return 'Select a date';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getSelectedTimeLabel = () => {
    if (!selectedTime) return 'Select a time';
    const [h, m] = selectedTime.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const buildForumDraft = useCallback(() => {
    const dateLabel = getSelectedDateLabel();
    const timeLabel = getSelectedTimeLabel();
    const title = eventTitle.trim() || `${activity || 'Activity'} meetup`;
    let msg = `Hey everyone! I just posted a ${title} plan`;
    if (eventLocation.trim()) msg += ` at ${eventLocation.trim()}`;
    if (selectedDate && selectedTime) msg += ` on ${dateLabel} at ${timeLabel}`;
    msg += `.`;
    if (eventNote.trim()) msg += ` ${eventNote.trim()}`;
    msg += ` Feel free to join in 👉`;
    return msg;
  }, [activity, eventTitle, eventLocation, selectedDate, selectedTime, eventNote, getSelectedDateLabel, getSelectedTimeLabel]);

  const resetForm = useCallback(() => {
    setEventTitle('');
    setPlanSkillLevel('Beginner');
    setEventLocation('');
    setEventNote('');
    setLimitRsvps(false);
    setMaxRsvps('6');
    setApprovalRequired(false);
    setPlanPhotoUri(null);
    setAnnounceInForum(false);
    setForumMessageDraft('');
    setShowExtraOptions(false);
    setSelectedDate('');
    setSelectedDateObj(null);
    setSelectedTime('');
    setShowDatePicker(false);
    setShowTimePicker(false);
    setLocationMode('gps');
    setLocationSuggestions([]);
    setLocationSuggestionsLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  // Set defaults when opened
  useEffect(() => {
    if (visible) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setSelectedDate(toLocalDateString(today));
      setSelectedDateObj(today);
      setSelectedTime('18:00');
      setSelectedHour('6');
      setSelectedMinute('00');
      setSelectedAmPm('PM');
    }
  }, [visible]);

  const handleDateChange = (_e: any, date?: Date) => {
    if (date) {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
      const nextDate = toLocalDateString(d);
      setSelectedDateObj(d);
      setSelectedDate(nextDate);
      if (selectedTime && isPlanLocalDateTimePast(nextDate, selectedTime)) setSelectedTime('');
      setShowDatePicker(false);
    }
  };

  const openTimePicker = () => {
    Keyboard.dismiss();
    if (selectedTime) {
      const [h, m] = selectedTime.split(':').map(Number);
      setSelectedHour((h % 12 === 0 ? 12 : h % 12).toString());
      setSelectedMinute(m.toString().padStart(2, '0'));
      setSelectedAmPm(h >= 12 ? 'PM' : 'AM');
    }
    setShowTimePicker(true);
  };

  const confirmTimeSelection = () => {
    if (!selectedDate) {
      Alert.alert('Select a date', 'Please choose a date first.');
      return;
    }
    const hour24 = to24Hour(parseInt(selectedHour, 10), selectedAmPm);
    const minute = parseInt(selectedMinute, 10);
    const dt = buildLocalPlanDateTime(selectedDate, hour24, minute);
    if (!dt) { Alert.alert('Invalid date', 'Please select a valid date.'); return; }
    if (dt.getTime() <= Date.now()) { Alert.alert('Choose a Future Time', 'Please select a time in the future.'); return; }
    setSelectedTime(`${hour24.toString().padStart(2, '0')}:${selectedMinute}`);
    setShowTimePicker(false);
  };

  const handleUseCurrentLocation = async () => {
    const runId = ++geocodeSeqRef.current;
    setIsLocating(true);
    setLocationSuggestions([]);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (runId !== geocodeSeqRef.current) return;
      if (status !== 'granted') {
        const { status: req } = await Location.requestForegroundPermissionsAsync();
        if (req !== 'granted') { Alert.alert('Location access', 'Allow location to use your current spot.'); return; }
      }
      if (runId !== geocodeSeqRef.current) return;
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 10000 });
      if (!location) location = await Location.getLastKnownPositionAsync({});
      if (runId !== geocodeSeqRef.current) return;
      if (location) {
        const { latitude: lat, longitude: lon } = location.coords;
        const elapsed = Date.now() - lastNominatimRequestRef.current;
        if (elapsed < 1100) await new Promise((r) => setTimeout(r, 1100 - elapsed));
        if (runId !== geocodeSeqRef.current) return;
        lastNominatimRequestRef.current = Date.now();
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
          { headers: { 'User-Agent': 'TheActivityHub/1.0 (https://github.com/activeportland)' } }
        );
        const data = await res.json();
        if (runId !== geocodeSeqRef.current) return;
        const short = formatNominatimAddressShort(data);
        setEventLocation(short || data?.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
      }
    } catch {
      if (runId === geocodeSeqRef.current) Alert.alert('Error', 'Could not get your location.');
    } finally {
      if (runId === geocodeSeqRef.current) setIsLocating(false);
    }
  };

  const selectLocationSuggestion = (short: string, full: string) => {
    setEventLocation(short.trim() || full.trim());
    setLocationSuggestions([]);
  };

  const pickPlanPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Photos', 'Allow photo library access to add a plan image.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) setPlanPhotoUri(result.assets[0].uri);
  };

  const handleSubmit = async () => {
    if (!user) { requireAuth('create a plan'); return; }
    if (eventTitle.trim().length > 120) { Alert.alert('Title too long', 'Title must be 120 characters or less.'); return; }
    if (!eventLocation.trim()) { Alert.alert('Location required', 'Please enter or select a location.'); return; }
    if (!selectedDate || !selectedTime) { Alert.alert('Date & time required', 'Please select a date and time.'); return; }
    const [h, m] = selectedTime.split(':').map(Number);
    const dt = buildLocalPlanDateTime(selectedDate, h, m);
    if (!dt) { Alert.alert('Invalid date', 'Please select a valid date and time.'); return; }
    if (isPlanLocalDateTimePast(selectedDate, selectedTime)) {
      Alert.alert('Plan must be in the future', 'Please select a date and time after now.');
      return;
    }
    const noteVal = eventNote.trim() || null;
    if (noteVal && noteVal.length > 160) { Alert.alert('Note too long', 'Note must be 160 characters or less.'); return; }
    Keyboard.dismiss();
    const maxSeats = limitRsvps ? Math.max(1, Math.min(10, Number(maxRsvps) || 1)) : null;
    const result = await createPlan({
      title: eventTitle.trim() || `${activity || 'Activity'} meetup`,
      location: eventLocation.trim(),
      event_date: selectedDate,
      event_time: selectedTime,
      skill_level: planSkillLevel,
      note: noteVal || undefined,
      imageUri: planPhotoUri?.trim() || undefined,
      max_rsvps: maxSeats,
      join_approval_required: approvalRequired,
    });
    if (result.ok) {
      if (announceInForum && activityId && user?.id && forumMessageDraft.trim()) {
        const { error: forumError } = await supabase.from('forum_messages').insert({
          activity_id: activityId,
          user_id: user.id,
          message: forumMessageDraft.trim(),
        });
        if (forumError) {
          console.error('Forum post failed:', forumError);
        }
      }
      resetForm();
      onCreated?.();
      onClose();
    } else {
      Alert.alert('Could not create plan', result.error ?? 'Please try again.');
    }
  };

  const sheetMaxHeight =
    keyboardHeight > 0
      ? Math.min(window.innerHeight * 0.88, (Platform.OS === 'ios' ? 812 : 800) - keyboardHeight - Math.max(insets.bottom, 12) - 8)
      : 600;

  const canSubmit = !!selectedDate && !!selectedTime && !!eventLocation.trim();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <AppKeyboardAvoidingView
        style={styles.kav}
        keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 12) : 0}
      >
        <View style={styles.overlay}>
          <TouchableWithoutFeedback
            onPress={() => {
              Keyboard.dismiss();
              handleClose();
            }}
            accessible={false}
          >
            <View style={styles.dimTap} />
          </TouchableWithoutFeedback>

          <View style={[styles.sheet, { maxHeight: sheetMaxHeight }]}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                {
                  paddingBottom:
                    28 + Math.max(insets.bottom, 12) + (keyboardHeight > 0 ? Math.min(keyboardHeight, 120) : 0),
                },
              ]}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
              <Text style={styles.title}>Create a plan</Text>
              <View style={{ height: 8 }} />
              <LinearGradient
                colors={['#FFE8B5', '#FFCF56', '#FFE8B5']}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.divider}
              />

              {/* Location */}
              <View style={styles.field}>
                <Text style={styles.label}>Where</Text>
                <View style={styles.locationRow}>
                  <TextInput
                    style={[styles.input, styles.locationInput]}
                    value={eventLocation}
                    onChangeText={setEventLocation}
                    placeholder="Search for a place or address"
                    placeholderTextColor="#999"
                  />
                  <TouchableOpacity
                    style={[styles.gpsBtn, isLocating && { opacity: 0.6 }]}
                    onPress={handleUseCurrentLocation}
                    disabled={isLocating}
                  >
                    {isLocating
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="location" size={18} color="#fff" />}
                  </TouchableOpacity>
                </View>
                {locationMode === 'gps' && locationSuggestionsLoading && (
                  <View style={styles.suggestionsRow}>
                    <ActivityIndicator size="small" color="#FF8C42" />
                    <Text style={styles.hint}>Searching…</Text>
                  </View>
                )}
                {locationMode === 'gps' && !locationSuggestionsLoading && locationSuggestions.length > 0 && (
                  <View style={styles.suggestionsList}>
                    {locationSuggestions.map((item, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.suggestionItem}
                        onPress={() => selectLocationSuggestion(item.short, item.full)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="location-outline" size={16} color="#666" />
                        <Text style={styles.suggestionText} numberOfLines={2}>
                          {item.short || item.full}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <Text style={styles.hint}>Type a place, or tap the location button to use your current spot.</Text>
              </View>

              {/* When */}
              <View style={styles.field}>
                <Text style={styles.label}>When</Text>
                <View style={styles.whenRow}>
                  <TouchableOpacity style={[styles.pickerBtn, styles.whenPicker]} onPress={() => setShowDatePicker(true)}>
                    <Ionicons name="calendar-outline" size={18} color={selectedDate ? '#333' : '#999'} />
                    <Text
                      numberOfLines={1}
                      style={[styles.pickerText, styles.whenPickerText, !selectedDate && styles.pickerPlaceholder]}
                    >
                      {getSelectedDateLabel()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.pickerBtn, styles.whenPicker]} onPress={openTimePicker}>
                    <Ionicons name="time-outline" size={18} color={selectedTime ? '#333' : '#999'} />
                    <Text
                      numberOfLines={1}
                      style={[styles.pickerText, styles.whenPickerText, !selectedTime && styles.pickerPlaceholder]}
                    >
                      {getSelectedTimeLabel()}
                    </Text>
                  </TouchableOpacity>
                </View>
                {showDatePicker && (
                  <Modal visible transparent animationType="fade">
                    <TouchableOpacity
                      style={styles.dateOverlay}
                      activeOpacity={1}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <TouchableOpacity activeOpacity={1} style={styles.dateModal} onPress={() => {}}>
                        <DateTimePicker
                          value={selectedDateObj || new Date()}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                          minimumDate={(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })()}
                          onChange={handleDateChange}
                          style={{ height: 200 }}
                        />
                        {Platform.OS === 'ios' && (
                          <TouchableOpacity
                            style={styles.dateDoneBtn}
                            onPress={() => {
                              if (!selectedDateObj) {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                setSelectedDateObj(today);
                                setSelectedDate(toLocalDateString(today));
                              }
                              setShowDatePicker(false);
                            }}
                          >
                            <Text style={styles.dateDoneText}>Done</Text>
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </Modal>
                )}
              </View>

              {/* Skill level */}
              <View style={styles.field}>
                <Text style={styles.label}>Skill level</Text>
                <View style={[styles.pillRow, styles.skillPillRow]}>
                  {PLAN_SKILL_LEVELS.map((lvl) => (
                    <TouchableOpacity
                      key={lvl}
                      style={[
                        styles.pill,
                        styles.pillSkill,
                        planSkillLevel === lvl && styles.pillActive,
                      ]}
                      onPress={() => setPlanSkillLevel(lvl)}
                    >
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.82}
                        style={[
                          styles.pillText,
                          styles.pillSkillText,
                          planSkillLevel === lvl && styles.pillTextActive,
                        ]}
                      >
                        {lvl}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={styles.extraOptionsButton}
                onPress={() => setShowExtraOptions((current) => !current)}
                activeOpacity={0.7}
              >
                <Text style={styles.extraOptionsText}>Extra options</Text>
                <Ionicons
                  name={showExtraOptions ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#FF8C42"
                />
              </TouchableOpacity>

              {showExtraOptions && (
                <View style={styles.extraOptionsContent}>
                  {/* Title */}
                  <View style={styles.field}>
                    <Text style={styles.label}>Plan title (optional)</Text>
                    <TextInput
                      style={styles.input}
                      value={eventTitle}
                      onChangeText={(t) => setEventTitle(t.slice(0, 120))}
                      placeholder={`${activity || 'Activity'} meetup`}
                      placeholderTextColor="#999"
                      maxLength={120}
                    />
                  </View>

                  {/* Note */}
                  <View style={styles.field}>
                <Text style={styles.label}>Note (optional)</Text>
                <TextInput
                  style={[styles.input, styles.noteInput]}
                  value={eventNote}
                  onChangeText={(t) => setEventNote(t.slice(0, 160))}
                  placeholder="Add details (e.g. what to bring, meet at entrance)"
                  placeholderTextColor="#999"
                  multiline
                  maxLength={160}
                />
                <Text style={styles.charCount}>{eventNote.length}/160</Text>
                  </View>

                  {/* Limited RSVPs */}
                  <View style={styles.field}>
                <Text style={styles.label}>Limited RSVPs (optional)</Text>
                <View style={styles.pillRow}>
                  <TouchableOpacity
                    style={[styles.pill, !limitRsvps && styles.pillActive]}
                    onPress={() => setLimitRsvps(false)}
                  >
                    <Text style={[styles.pillText, !limitRsvps && styles.pillTextActive]}>Unlimited</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pill, limitRsvps && styles.pillActive]}
                    onPress={() => setLimitRsvps(true)}
                  >
                    <Text style={[styles.pillText, limitRsvps && styles.pillTextActive]}>Limit spots</Text>
                  </TouchableOpacity>
                </View>
                {limitRsvps && (
                  <View style={styles.slotRow}>
                    <TouchableOpacity
                      style={styles.slotBtn}
                      onPress={() => setMaxRsvps(String(Math.max(1, (Number(maxRsvps) || 6) - 1)))}
                    >
                      <Text style={styles.slotBtnText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.slotValue}>{Math.max(1, Math.min(10, Number(maxRsvps) || 6))} spots</Text>
                    <TouchableOpacity
                      style={styles.slotBtn}
                      onPress={() => setMaxRsvps(String(Math.min(10, (Number(maxRsvps) || 6) + 1)))}
                    >
                      <Text style={styles.slotBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                )}
                  </View>

                  {/* Join approval */}
                  <View style={styles.field}>
                <Text style={styles.label}>Join approval</Text>
                <View style={styles.pillRow}>
                  <TouchableOpacity
                    style={[styles.pill, !approvalRequired && styles.pillActive]}
                    onPress={() => setApprovalRequired(false)}
                  >
                    <Text style={[styles.pillText, !approvalRequired && styles.pillTextActive]}>Instant join</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pill, approvalRequired && styles.pillActive]}
                    onPress={() => setApprovalRequired(true)}
                  >
                    <Text style={[styles.pillText, approvalRequired && styles.pillTextActive]}>Host approval</Text>
                  </TouchableOpacity>
                </View>
                  </View>

                  {/* Photo */}
                  <View style={styles.field}>
                <Text style={styles.label}>Photo (optional)</Text>
                {planPhotoUri ? (
                  <Image source={{ uri: planPhotoUri }} style={styles.photoPreview} resizeMode="cover" />
                ) : (
                  <Text style={styles.hint}>No image — tap below to add one.</Text>
                )}
                <View style={styles.photoActions}>
                  <TouchableOpacity style={styles.photoPickBtn} onPress={() => void pickPlanPhoto()}>
                    <Ionicons name="image-outline" size={18} color="#FF8C42" />
                    <Text style={styles.photoPickText}>{planPhotoUri ? 'Change photo' : 'Add photo'}</Text>
                  </TouchableOpacity>
                  {planPhotoUri && (
                    <TouchableOpacity onPress={() => setPlanPhotoUri(null)}>
                      <Text style={styles.photoRemoveText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
                  </View>

                  {/* Announce in forum */}
                  <View style={styles.announceRow}>
                <View style={styles.announceText}>
                  <Text style={styles.announceLabel}>Post in forum</Text>
                  <Text style={styles.announceSubtitle}>Let your community know about this plan</Text>
                </View>
                <Switch
                  value={announceInForum}
                  onValueChange={(val) => {
                    setAnnounceInForum(val);
                    if (val) setForumMessageDraft(buildForumDraft());
                    else setForumMessageDraft('');
                  }}
                  trackColor={{ false: '#E0E0E0', true: '#FFCF56' }}
                  thumbColor={announceInForum ? '#FF8C42' : '#F4F4F4'}
                />
                  </View>
                  {announceInForum && (
                    <TextInput
                      style={styles.forumDraftInput}
                      value={forumMessageDraft}
                      onChangeText={setForumMessageDraft}
                      multiline
                      placeholder="Add a message to the forum..."
                      placeholderTextColor="#bbb"
                      onFocus={() => {
                        if (!forumMessageDraft) setForumMessageDraft(buildForumDraft());
                      }}
                    />
                  )}
                </View>
              )}

              {/* Buttons */}
              <View style={styles.buttons}>
                <TouchableOpacity
                  style={[styles.submitBtn, (!canSubmit || creating) && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={!canSubmit || creating}
                >
                  {creating
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.submitText}>Create plan</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </AppKeyboardAvoidingView>

      {/* Time picker overlay */}
      {showTimePicker && (
        <View style={styles.timeOverlay} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.timeOverlayTap}
            activeOpacity={1}
            onPress={() => setShowTimePicker(false)}
          />
          <View style={[styles.timePicker, { top: Math.max(insets.top, 12) + 8 }]}>
            <Text style={styles.timeTitle}>Select time</Text>
            <View style={styles.timeColumns}>
              {[
                { values: HOURS, selected: selectedHour, onSelect: setSelectedHour },
                { values: MINUTES, selected: selectedMinute, onSelect: setSelectedMinute },
                { values: AMPM as string[], selected: selectedAmPm, onSelect: (v: string) => setSelectedAmPm(v as 'AM' | 'PM') },
              ].map((col, ci) => (
                <View key={ci} style={styles.timeColumn}>
                  <ScrollView style={styles.timeWheel} showsVerticalScrollIndicator={false}>
                    {col.values.map((val) => (
                      <TouchableOpacity
                        key={val}
                        style={[styles.timeItem, col.selected === val && styles.timeItemSelected]}
                        onPress={() => col.onSelect(val)}
                      >
                        <Text style={styles.timeItemText}>{val}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ))}
            </View>
            <View style={styles.timeActions}>
              <TouchableOpacity style={styles.timeCancelBtn} onPress={() => setShowTimePicker(false)}>
                <Text style={styles.timeCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.timeConfirmBtn} onPress={confirmTimeSelection}>
                <Text style={styles.timeConfirmText}>Set time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1 },
  overlay: { flex: 1, flexDirection: 'column', justifyContent: 'flex-end' },
  dimTap: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    overflow: 'hidden',
  },
  scroll: { flexGrow: 1, flexShrink: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 0 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#333', paddingHorizontal: 0, paddingTop: 20 },
  divider: { height: 4, borderRadius: 2, marginBottom: 16 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#333', marginBottom: 8 },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  skillPillRow: { flexWrap: 'nowrap', gap: 6 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#f0f0f0' },
  pillFlex: { flex: 1, alignItems: 'center' },
  pillSkill: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  pillActive: { backgroundColor: '#FFE8D6' },
  pillText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#666' },
  pillSkillText: { fontSize: 12, textAlign: 'center' },
  pillTextActive: { color: '#FF8C42' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  locationInput: { minHeight: 48 },
  gpsBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FF8C42',
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 4 },
  suggestionsList: { marginTop: 4, borderWidth: 1, borderColor: '#eee', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fafafa' },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  suggestionText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: '#333' },
  hint: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#999', marginTop: 8 },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerText: { fontSize: 16, fontFamily: 'Inter_400Regular', color: '#333' },
  whenRow: { flexDirection: 'row', gap: 10 },
  whenPicker: { flex: 1, minWidth: 0 },
  whenPickerText: { flexShrink: 1, fontSize: 14 },
  pickerPlaceholder: { color: '#999' },
  extraOptionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 2,
    marginBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E8E8',
  },
  extraOptionsText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FF8C42' },
  extraOptionsContent: { paddingTop: 8 },
  dateOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  dateModal: { backgroundColor: 'white', borderRadius: 16, overflow: 'hidden' },
  dateDoneBtn: { padding: 16, alignItems: 'center', backgroundColor: '#f5f5f5' },
  dateDoneText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FF8C42' },
  noteInput: { minHeight: 64 },
  charCount: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#999', marginTop: 4, textAlign: 'right' },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slotBtn: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1, borderColor: '#FFCF56',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFBF0',
  },
  slotBtnText: { fontSize: 20, lineHeight: 22, fontFamily: 'Inter_700Bold', color: '#FF8C42' },
  slotValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#333' },
  photoPreview: { width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f0f0f0', marginBottom: 10 },
  photoActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  photoPickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1, borderColor: '#FFCF56',
    backgroundColor: '#FFFBF0',
  },
  photoPickText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FF8C42' },
  photoRemoveText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#999', paddingVertical: 10, paddingHorizontal: 8 },
  announceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  announceText: { flex: 1, marginRight: 12 },
  announceLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#333' },
  announceSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#999', marginTop: 2 },
  forumDraftInput: {
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 12,
    lineHeight: 20,
  },
  buttons: { paddingTop: 8, gap: 12 },
  submitBtn: { backgroundColor: '#FF8C42', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 16, fontFamily: 'Inter_500Medium', color: '#666' },
  // Time picker
  timeOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 20 },
  timeOverlayTap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  timePicker: {
    position: 'absolute', left: 24, right: 24,
    backgroundColor: 'white', borderRadius: 16, padding: 16, maxHeight: 320, zIndex: 21,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
    }),
  },
  timeTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#333', marginBottom: 12 },
  timeColumns: { flexDirection: 'row', gap: 8 },
  timeColumn: { flex: 1 },
  timeWheel: { maxHeight: 180 },
  timeItem: { height: TIME_ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  timeItemSelected: { backgroundColor: '#FFE8D6' },
  timeItemText: { fontSize: 16, fontFamily: 'Inter_400Regular', color: '#333' },
  timeActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 },
  timeCancelBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  timeCancelText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: '#666' },
  timeConfirmBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  timeConfirmText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FF8C42' },
});
