import React from 'react';
import { ActivityIndicator, Text, View, type PressableProps } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { colors, radius } from '../lib/theme';

type Variant = 'primary' | 'accent' | 'outline' | 'outlineLight' | 'ghost';

type Props = Omit<PressableProps, 'style'> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
};

const VARIANT_STYLE: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.navy, text: '#FFFFFF' },
  // Navy text on gold — white-on-gold only hits 2.76:1 contrast, below the
  // 4.5:1 floor. Navy text on gold reaches 4.61:1.
  accent: { bg: colors.gold, text: colors.navy },
  outline: { bg: 'transparent', text: colors.navy, border: colors.navy },
  // For use on a navy/dark surface (e.g. the driver card) — plain `outline`
  // would render a navy border and navy text, invisible against navy.
  outlineLight: { bg: 'transparent', text: '#FFFFFF', border: 'rgba(255,255,255,0.4)' },
  ghost: { bg: 'transparent', text: colors.navy },
};

export default function VISTAButton({
  title,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  onPress,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  const style = VARIANT_STYLE[variant];

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      scaleTo={0.97}
      haptic={!isDisabled}
      {...rest}
      style={{
        height: 52,
        borderRadius: radius.button,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 20,
        width: fullWidth ? '100%' : undefined,
        backgroundColor: isDisabled ? '#E4E4EA' : style.bg,
        borderWidth: style.border ? 1.5 : 0,
        borderColor: style.border,
      }}
    >
      {loading ? (
        <ActivityIndicator color={style.text} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Text
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: isDisabled ? '#B0B0B6' : style.text,
            }}
          >
            {title}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
}
