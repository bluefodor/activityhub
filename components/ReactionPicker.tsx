import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🙌', '🎉'];
const PICKER_HEIGHT = 52;
const PICKER_PADDING = 8;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface ReactionPickerLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ReactionPickerProps {
  visible: boolean;
  anchorLayout: ReactionPickerLayout | null;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionPicker({
  visible,
  anchorLayout,
  onSelect,
  onClose,
}: ReactionPickerProps) {
  if (!visible) return null;

  const placeAbove = anchorLayout
    ? anchorLayout.y - PICKER_HEIGHT - PICKER_PADDING > 60
    : true;
  const left = anchorLayout
    ? Math.max(12, Math.min(anchorLayout.x + anchorLayout.width / 2 - (EMOJIS.length * 36) / 2, SCREEN_WIDTH - 12 - EMOJIS.length * 36))
    : (SCREEN_WIDTH - EMOJIS.length * 36) / 2 - 24;
  const top = anchorLayout
    ? placeAbove
      ? anchorLayout.y - PICKER_HEIGHT - PICKER_PADDING
      : anchorLayout.y + anchorLayout.height + PICKER_PADDING
    : 200;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.picker, { left, top }]}>
              {EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiButton}
                  onPress={() => {
                    onSelect(emoji);
                    onClose();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  picker: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: PICKER_HEIGHT,
    paddingHorizontal: 12,
    backgroundColor: 'white',
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  emojiButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 24,
  },
});
