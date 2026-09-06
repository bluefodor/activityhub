import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { createForumPoll, createForumOpenTextPoll, type ForumPollStyle } from '@/lib/forumPolls';

const MAX_OPTIONS = 10;
const MIN_OPTIONS = 2;

interface CreateForumPollModalProps {
  visible: boolean;
  activityId: string | undefined;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateForumPollModal({
  visible,
  activityId,
  onClose,
  onCreated,
}: CreateForumPollModalProps) {
  const [pollStyle, setPollStyle] = useState<ForumPollStyle>('choice');
  const [question, setQuestion] = useState('');
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [options, setOptions] = useState<string[]>(['', '']);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setPollStyle('choice');
    setQuestion('');
    setAllowMultiple(false);
    setOptions(['', '']);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const setOptionAt = (index: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!activityId) {
      Alert.alert('Forum', 'Select an activity first.');
      return;
    }
    const q = question.trim();
    if (!q) {
      Alert.alert('Poll', 'Enter a question.');
      return;
    }
    const trimmed = options.map((o) => o.trim()).filter((o) => o.length > 0);

    if (pollStyle === 'open_text') {
      setSubmitting(true);
      const { messageId, error } = await createForumOpenTextPoll({
        activityId,
        question: q,
      });
      setSubmitting(false);
      if (error || !messageId) {
        Alert.alert('Poll', error?.message || 'Could not create poll.');
        return;
      }
      reset();
      onCreated();
      onClose();
      return;
    }

    if (trimmed.length < MIN_OPTIONS) {
      Alert.alert('Poll', `Add at least ${MIN_OPTIONS} answers.`);
      return;
    }
    if (trimmed.length > MAX_OPTIONS) {
      Alert.alert('Poll', `At most ${MAX_OPTIONS} answers.`);
      return;
    }

    setSubmitting(true);
    const { messageId, error } = await createForumPoll({
      activityId,
      question: q,
      allowMultiple: allowMultiple,
      optionTexts: trimmed,
    });
    setSubmitting(false);

    if (error || !messageId) {
      Alert.alert('Poll', error?.message || 'Could not create poll.');
      return;
    }
    reset();
    onCreated();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>New poll</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Poll type</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, pollStyle === 'choice' && styles.typeBtnActive]}
                onPress={() => setPollStyle('choice')}
              >
                <Text style={[styles.typeBtnText, pollStyle === 'choice' && styles.typeBtnTextActive]}>
                  Pick from options
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, pollStyle === 'open_text' && styles.typeBtnActive]}
                onPress={() => setPollStyle('open_text')}
              >
                <Text style={[styles.typeBtnText, pollStyle === 'open_text' && styles.typeBtnTextActive]}>
                  Everyone writes in
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Question</Text>
            <TextInput
              style={styles.input}
              value={question}
              onChangeText={setQuestion}
              placeholder="What do you want to ask?"
              placeholderTextColor="#999"
              maxLength={500}
              multiline
            />

            {pollStyle === 'choice' ? (
              <>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Allow multiple choices</Text>
              <Switch value={allowMultiple} onValueChange={setAllowMultiple} />
            </View>

            <Text style={styles.label}>Answers (2–10)</Text>
            {options.map((opt, i) => (
              <View key={i} style={styles.optionRow}>
                <TextInput
                  style={styles.optionInput}
                  value={opt}
                  onChangeText={(t) => setOptionAt(i, t)}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor="#999"
                  maxLength={200}
                />
                {options.length > MIN_OPTIONS ? (
                  <TouchableOpacity onPress={() => removeOption(i)} hitSlop={8}>
                    <Text style={styles.removeOpt}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}

            {options.length < MAX_OPTIONS ? (
              <TouchableOpacity style={styles.addBtn} onPress={addOption}>
                <Text style={styles.addBtnText}>+ Add answer</Text>
              </TouchableOpacity>
            ) : null}
              </>
            ) : (
              <Text style={styles.openTextHint}>
                Members will each write their own answer. You can read everyone&apos;s responses after they submit.
              </Text>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={submitting}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={() => void submit()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Post poll</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  title: {
    fontSize: 21,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#555',
    marginBottom: 6,
    marginTop: 12,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  typeBtnActive: {
    borderColor: '#FF8C42',
    backgroundColor: '#fff8f0',
  },
  typeBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#666',
    textAlign: 'center',
  },
  typeBtnTextActive: {
    color: '#FF8C42',
    fontFamily: 'Inter_700Bold',
  },
  openTextHint: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginTop: 8,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 17,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    minHeight: 72,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  switchLabel: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    color: '#333',
    flex: 1,
    paddingRight: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  removeOpt: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: '#c62828',
  },
  addBtn: {
    marginTop: 8,
    marginBottom: 16,
  },
  addBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF8C42',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
});
