import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/providers/theme';
import { Text } from './text';
import { cn } from './cn';

export interface FieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
}

export const Field = forwardRef<TextInput, FieldProps>(({ label, error, hint, required, multiline, className, ...props }, ref) => {
  const { colors } = useTheme();
  return (
    <View>
      <Text weight="medium" className="mb-1.5 text-sm">{label}{required ? <Text className="text-danger"> *</Text> : null}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textSubtle}
        multiline={multiline}
        accessibilityLabel={label}
        className={cn(
          'min-h-tap rounded-sm border bg-surface px-4 font-inter text-base text-text',
          multiline && 'min-h-24 py-3',
          error ? 'border-danger' : 'border-border-strong',
          className,
        )}
        style={multiline ? { textAlignVertical: 'top' } : undefined}
        {...props}
      />
      {error ? <Text className="mt-1 text-xs text-danger">{error}</Text> : hint ? <Text className="mt-1 text-xs text-text-muted">{hint}</Text> : null}
    </View>
  );
});
Field.displayName = 'Field';
