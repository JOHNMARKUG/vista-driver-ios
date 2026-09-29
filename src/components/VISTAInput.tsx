import React, { forwardRef, useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius } from '../lib/theme';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
};

/**
 * Filled system-gray field at rest (no border — Apple's own forms rarely
 * outline a field until it's active), a navy ring on focus, a red one on
 * error. The input box is always a light/white surface regardless of the
 * screen behind it, so its text color is intentionally NOT overridable
 * through the `style` prop — a caller once passed `style={{ color:
 * '#FFFFFF' }}` intending to theme the screen around it, which rendered
 * invisible white text on this surface. Layout tweaks from `style` still
 * apply; `color` always resolves to black (or red for an error).
 */
const VISTAInput = forwardRef<TextInput, Props>(
  ({ label, error, leftIcon, style, onFocus, onBlur, ...rest }, ref) => {
    const [focused, setFocused] = useState(false);
    const active = focused || !!error;

    return (
      <View style={{ gap: 6 }}>
        {label ? (
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
            {label}
          </Text>
        ) : null}
        <View
          style={{
            height: 52,
            borderRadius: radius.input,
            backgroundColor: active ? colors.card : '#F2F2F7',
            borderWidth: active ? 1.5 : 0,
            borderColor: error ? colors.error : colors.navy,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            gap: 8,
          }}
        >
          {leftIcon}
          <TextInput
            ref={ref}
            placeholderTextColor={colors.textSecondary}
            {...rest}
            style={[
              { flex: 1, fontSize: 16, height: '100%' },
              style,
              { color: error ? colors.error : colors.textPrimary },
            ]}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
          />
        </View>
        {error ? (
          <Text style={{ fontSize: 12, color: colors.error }}>{error}</Text>
        ) : null}
      </View>
    );
  }
);

VISTAInput.displayName = 'VISTAInput';
export default VISTAInput;
