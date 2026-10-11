import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { colors } from '../lib/theme';

export const TERMS_URL = 'https://vista-driver.vercel.app/terms-of-service';
export const PRIVACY_URL = 'https://vista-driver.vercel.app/privacy-policy';

export default function LegalLinks({ prefix }: { prefix?: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
      {prefix ? <Text style={{ fontSize: 12, color: colors.textSecondary }}>{prefix} </Text> : null}
      <Pressable accessibilityRole="link" hitSlop={8} onPress={() => Linking.openURL(TERMS_URL)}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy, textDecorationLine: 'underline' }}>Terms of Service</Text>
      </Pressable>
      <Text style={{ fontSize: 12, color: colors.textSecondary }}> and </Text>
      <Pressable accessibilityRole="link" hitSlop={8} onPress={() => Linking.openURL(PRIVACY_URL)}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy, textDecorationLine: 'underline' }}>Privacy Policy</Text>
      </Pressable>
    </View>
  );
}
