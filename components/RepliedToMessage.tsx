import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CachedImage } from '@/components/CachedImage';
import React from 'react';

interface RepliedToMessageProps {
  replyToId: string;
  replyToMessage: any;
  messageItem: any;
  scrollToMessage: (id: string) => void;
}

const RepliedToMessage = ({
  replyToId,
  replyToMessage,
  messageItem,
  scrollToMessage,
}: RepliedToMessageProps) => {
  // Check if there are images
  const hasImages = replyToMessage?.image_urls && replyToMessage.image_urls.length > 0;
  const firstImage = hasImages ? replyToMessage.image_urls[0] : null;

  return (
    <TouchableOpacity
      style={styles.replyContainer}
      onPress={() => scrollToMessage(replyToId)}
    >
      <View style={styles.replyContent}>
        <View style={styles.textContainer}>
          <Text style={styles.replyToName}>
            {replyToMessage.profiles?.name || 'Unknown'}
          </Text>
          
          <Text style={styles.replyText} numberOfLines={2} ellipsizeMode={'tail'}>
            {replyToMessage.message || (hasImages ? '📷 Photo' : '...')}
          </Text>
        </View>

        {firstImage && (
          <CachedImage 
            source={{ uri: firstImage }} 
            style={styles.replyThumbnail}
            recyclingKey={firstImage}
          />
        )}
      </View>
    </TouchableOpacity>
  );
};

export default RepliedToMessage;

const styles = StyleSheet.create({
  replyContainer: {
    borderLeftWidth: 2,
    borderLeftColor: '#FFCF5650',
    backgroundColor: '#f0f0f0',
    padding: 7,
    borderRadius: 8,
    marginBottom: 6,
  },
  replyContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  textContainer: {
    flex: 1,
  },
  replyToName: {
    fontSize: 9,
    fontFamily: 'Inter_500Medium',
    color: '#101010',
    marginBottom: 1,
  },
  replyText: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  replyThumbnail: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#ddd',
  }
});