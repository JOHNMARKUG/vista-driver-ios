import React from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { colors } from '../lib/theme';

export default function LoadingScreen({ label = 'VISTA TRANSPORT' }: { label?: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.navy,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}
    >
      <Image
        source={require('../../assets/vista-logo.png')}
        style={{ width: 72, height: 72, resizeMode: 'contain' }}
      />
      <ActivityIndicator size="small" color={colors.gold} />
      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700', letterSpacing: 2 }}>
        {label}
      </Text>
    </View>
  );
}
