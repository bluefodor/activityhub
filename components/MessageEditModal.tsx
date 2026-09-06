import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { AppKeyboardAvoidingView } from '@/components/AppKeyboardAvoidingView';

const MAX_LEN = 1000;

type MessageEditModalProps = {
  visible: boolean;
  initialText: string;
  title?: string;
  onClose: () => void;
  onSave: (text: string) => boolean | Promise<boolean>;
};

export function MessageEditModal({
  visible,
  initialText,
  title = 'Edit message',
  onClose,
  onSave,
}: MessageEditModalProps) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setText(initialText);
  }, [visible, initialText]);

  const handleSave = async () => {
    const t = text.trim();
    if (!t) return;
    if (t.length > MAX_LEN) return;
    setSaving(true);
    try {
      const ok = await onSave(t);
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <AppKeyboardAvoidingView style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            multiline
            scrollEnabled
            maxLength={MAX_LEN}
            placeholder="Message"
            placeholderTextColor="#999"
            autoFocus
          />
          <Text style={styles.counter}>
            {text.trim().length}/{MAX_LEN}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (!text.trim() || saving) && styles.saveBtnDisabled]}
              onPress={() => void handleSave()}
              disabled={!text.trim() || saving}
            >
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AppKeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    maxHeight: '80%',
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#222',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    maxHeight: 260,
    textAlignVertical: 'top',
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#333',
  },
  counter: {
    alignSelf: 'flex-end',
    marginTop: 6,
    fontSize: 12,
    color: '#888',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontSize: 16,
    color: '#666',
    fontFamily: 'Inter_500Medium',
  },
  saveBtn: {
    backgroundColor: '#FF8C42',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});
