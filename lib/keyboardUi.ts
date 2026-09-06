import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** True in the Expo Go app — custom native modules are unavailable. */
export function isExpoGo(): boolean {
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  );
}

/** Native dev client / store builds where keyboard-controller is linked. */
export function canUseKeyboardController(): boolean {
  return Platform.OS !== 'web' && !isExpoGo();
}
