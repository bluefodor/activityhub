import AsyncStorage from '@react-native-async-storage/async-storage';

const dmKey = (otherUserId: string) => `chat_draft_dm:${otherUserId}`;
const groupKey = (chatId: string) => `chat_draft_group:${chatId}`;

export async function loadDmDraft(otherUserId: string): Promise<string> {
  try {
    return (await AsyncStorage.getItem(dmKey(otherUserId))) ?? '';
  } catch {
    return '';
  }
}

export async function saveDmDraft(otherUserId: string, text: string): Promise<void> {
  try {
    const key = dmKey(otherUserId);
    const trimmed = text.trim();
    if (!trimmed) {
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, text);
  } catch {
    // ignore
  }
}

export async function clearDmDraft(otherUserId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(dmKey(otherUserId));
  } catch {
    // ignore
  }
}

export async function loadGroupDraft(chatId: string): Promise<string> {
  try {
    return (await AsyncStorage.getItem(groupKey(chatId))) ?? '';
  } catch {
    return '';
  }
}

export async function saveGroupDraft(chatId: string, text: string): Promise<void> {
  try {
    const key = groupKey(chatId);
    const trimmed = text.trim();
    if (!trimmed) {
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, text);
  } catch {
    // ignore
  }
}

export async function clearGroupDraft(chatId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(groupKey(chatId));
  } catch {
    // ignore
  }
}
