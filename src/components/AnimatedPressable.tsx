import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, type EntryOrExitLayoutType } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const Base = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  entering?: EntryOrExitLayoutType;
  exiting?: EntryOrExitLayoutType;
  /** How far it shrinks on press. 1 = no shrink. */
  scaleTo?: number;
  /** Light impact haptic on press. Off for destructive/rare actions where a
   * buzz on every tap would feel noisy. */
  haptic?: boolean;
};

/**
 * The one press-feedback primitive for the whole app — a real spring scale
 * instead of a flat opacity dim. This is the single most recognizable
 * "alive" signal in native iOS apps; every tappable surface in this app
 * should go through this rather than a bare Pressable, so it's consistent
 * instead of hand-rolled per screen.
 */
export default function AnimatedPressable({
  scaleTo = 0.96,
  haptic = true,
  onPressIn,
  onPressOut,
  onPress,
  style,
  entering,
  exiting,
  children,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Base
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, { damping: 16, stiffness: 400 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 260 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(e);
      }}
      style={[style, animatedStyle]}
      entering={entering}
      exiting={exiting}
      {...rest}
    >
      {children}
    </Base>
  );
}
