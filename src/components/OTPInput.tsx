import React, { useEffect, useRef } from 'react';
import { TextInput, View, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors } from '../lib/theme';

type Props = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
};

const AnimatedView = Animated.createAnimatedComponent(View);

export default function OTPInput({ value, onChange, length = 6, autoFocus = true }: Props) {
  const inputRef = useRef<TextInput>(null);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
        {digits.map((digit, i) => {
          const isCursor = i === value.length;
          return (
            <Box key={i} digit={digit} active={isCursor} />
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        style={{
          position: 'absolute',
          opacity: 0,
          height: 56,
          width: '100%',
        }}
      />
    </View>
  );
}

function Box({ digit, active }: { digit: string; active: boolean }) {
  const scale = useSharedValue(1);
  const prevDigit = useRef(digit);

  useEffect(() => {
    if (digit && !prevDigit.current) {
      scale.value = withSequence(
        withSpring(1.2, { damping: 8, stiffness: 450 }),
        withSpring(1, { damping: 10, stiffness: 300 })
      );
      Haptics.selectionAsync().catch(() => {});
    }
    prevDigit.current = digit;
  }, [digit, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: withTiming(digit ? colors.navy : active ? colors.navy : colors.border, { duration: 150 }),
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedView
      style={[
        {
          width: 44,
          height: 52,
          borderRadius: 8,
          borderWidth: 1.5,
          backgroundColor: colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        },
        animatedStyle,
      ]}
    >
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.textPrimary }}>{digit}</Text>
    </AnimatedView>
  );
}
