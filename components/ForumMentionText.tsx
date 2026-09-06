import React from 'react';
import { Linking, StyleSheet, Text } from 'react-native';
import {
  splitMessageWithMentions,
  type MentionLookupEntry,
  buildMentionLookup,
} from '@/lib/forumMentions';

type Props = {
  text: string;
  mentionEntries: MentionLookupEntry[];
  onMentionPress: (userId: string, displayName: string) => void;
  onMentionPressUnknown?: (displayName: string) => void;
  style?: object;
};

export function ForumMentionText({
  text,
  mentionEntries,
  onMentionPress,
  onMentionPressUnknown,
  style,
}: Props) {
  if (!text) return null;

  const lookup = buildMentionLookup(mentionEntries);
  const urlParts = text.split(/(https?:\/\/[^\s]+)/g);

  return (
    <Text style={style}>
      {urlParts.map((segment, segIndex) => {
        if (/(https?:\/\/[^\s]+)/g.test(segment)) {
          return (
            <Text
              key={`url-${segIndex}`}
              style={styles.link}
              onPress={() => Linking.openURL(segment)}
            >
              {segment}
            </Text>
          );
        }

        const parts = splitMessageWithMentions(segment, lookup);
        return parts.map((part, partIndex) => {
          const key = `${segIndex}-${partIndex}`;
          if (part.kind === 'text') {
            return <Text key={key}>{part.value}</Text>;
          }
          if (part.userId) {
            return (
              <Text
                key={key}
                style={styles.mention}
                onPress={() => onMentionPress(part.userId!, part.display.replace(/^@/, ''))}
              >
                {part.display}
              </Text>
            );
          }
          return (
            <Text
              key={key}
              style={styles.mentionUnresolved}
              onPress={
                onMentionPressUnknown
                  ? () => onMentionPressUnknown(part.display.replace(/^@/, ''))
                  : undefined
              }
            >
              {part.display}
            </Text>
          );
        });
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    textDecorationLine: 'underline',
    color: '#0000EE',
  },
  mention: {
    color: '#FF8C42',
    fontFamily: 'Inter_600SemiBold',
  },
  mentionUnresolved: {
    color: '#FF8C42',
    fontFamily: 'Inter_500Medium',
  },
});
