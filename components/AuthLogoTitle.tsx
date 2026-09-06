import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

const { width } = Dimensions.get('window');
const isSmallDevice = width < 375;
const isMediumDevice = width < 414;

const LOGO_FONT_SIZE = isSmallDevice ? 30 : isMediumDevice ? 36 : 42;

/**
 * Auth header logo — kept on one line via adjustsFontSizeToFit (nested Text
 * alone can wrap mid-word on narrow iPhones).
 */
export function AuthLogoTitle() {
  return (
    <View style={styles.wrap}>
      <Text
        style={styles.logo}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScaleFactor={0.55}
      >
        <Text style={styles.the}>The </Text>
        <Text style={styles.activity}>Activity </Text>
        <Text style={styles.hub}>Hub</Text>
      </Text>
      <View style={styles.underline} />
    </View>
  );
}

const logoBase = {
  fontSize: LOGO_FONT_SIZE,
  fontFamily: 'Inter_800ExtraBold' as const,
  fontStyle: 'italic' as const,
  textShadowColor: 'rgba(255, 140, 66, 0.3)',
  textShadowOffset: { width: 2, height: 2 },
  textShadowRadius: 4,
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: width - 32,
    alignItems: 'center',
    alignSelf: 'center',
  },
  logo: {
    ...logoBase,
    textAlign: 'center',
    width: '100%',
  },
  the: {
    ...logoBase,
    color: '#FFCF56',
  },
  activity: {
    ...logoBase,
    color: '#FF8C42',
  },
  hub: {
    ...logoBase,
    color: '#FFCF56',
  },
  underline: {
    width: 60,
    height: 3,
    backgroundColor: '#FF8C42',
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 4,
  },
});
