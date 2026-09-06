import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { createPlanGroupChatPoll } from '@/lib/planGroupChatPolls';

const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

interface CreatePlanGroupChatPollModalProps {
  visible: boolean;
  chatId: string | undefined;
  onClose: () => void;
  onCreated: () => void;
}

export function CreatePlanGroupChatPollModal({
  visible,
  chatId,
  onClose,
  onCreated,
}: CreatePlanGroupChatPollModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setQuestion('');
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
    if (!chatId) {
      Alert.alert('Poll', 'Chat not ready.');
      return;
    }
    const q = question.trim();
    if (!q) {
      Alert.alert('Poll', 'Enter a question.');
      return;
    }
    const trimmed = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (trimmed.length < MIN_OPTIONS) {
      Alert.alert('Poll', `Add at least ${MIN_OPTIONS} answers.`);
      return;
    }

    setSubmitting(true);
    const { messageId, error } = await createPlanGroupChatPoll({
      chatId,
      question: q,
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
          <Text style={styles.subtitle}>Single choice · up to {MAX_OPTIONS} answers</Text>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Question</Text>
            <TextInput
              style={styles.input}
              value={question}
              onChangeText={setQuestion}
              placeholder="What should the group decide?"
              placeholderTextColor="#999"
              maxLength={300}
              multiline
            />

            <Text style={styles.label}>Answers</Text>
            {options.map((opt, i) => (
              <View key={i} style={styles.optionRow}>
                <TextInput
                  style={styles.optionInput}
                  value={opt}
                  onChangeText={(t) => setOptionAt(i, t)}
                  placeholder={`Option ${i + 1}`}
                  placeholderTextColor="#999"
                  maxLength={120}
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
    maxHeight: '88%',
  },
  title: {
    fontSize: 21,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#777',
    marginTop: 4,
    marginBottom: 12,
  },
  label: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#555',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#333',
    minHeight: 64,
    textAlignVertical: 'top',
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
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#c62828',
  },
  addBtn: { marginTop: 4, marginBottom: 12 },
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
  },
  cancelBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#666',
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF8C42',
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
});
