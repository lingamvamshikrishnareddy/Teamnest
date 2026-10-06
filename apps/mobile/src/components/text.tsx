import { Text as RNText, type TextProps } from 'react-native';
import { cn } from './cn';

const weights = {
  regular: 'font-inter',
  medium: 'font-inter-medium',
  semibold: 'font-inter-semibold',
  bold: 'font-inter-bold',
} as const;

export interface AppTextProps extends TextProps {
  weight?: keyof typeof weights;
  className?: string;
}

/** Inter text that respects the user's font scaling (capped for layout safety). */
export function Text({ weight = 'regular', className, maxFontSizeMultiplier = 1.6, ...props }: AppTextProps) {
  return <RNText maxFontSizeMultiplier={maxFontSizeMultiplier} className={cn('text-text', weights[weight], className)} {...props} />;
}
