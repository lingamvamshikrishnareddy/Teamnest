import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { toAppError } from '@teamnest/api-client';
import { Button } from '@/components/button';
import { LogoMark } from '@/components/logo';
import { Text } from '@/components/text';
import { isConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useI18n } from '@/providers/i18n';
import { useTheme } from '@/providers/theme';

export default function SignIn() {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(toAppError(e).code === 'invalid_credentials' ? t('auth.invalid') : toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'min-h-tap flex-row items-center gap-3 rounded-sm border border-border-strong bg-surface px-4';

  return (
    <SafeAreaView className="flex-1 bg-header">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow" keyboardShouldPersistTaps="handled">
          <View className="items-center px-6 pb-10 pt-12">
            <LogoMark size={64} />
            <Text weight="bold" className="mt-4 text-3xl text-on-header">TeamNest</Text>
            <Text className="mt-1 text-sm text-on-header opacity-80">{t('app.tagline')}</Text>
          </View>
          <View className="flex-1 rounded-t-2xl bg-background px-6 pb-10 pt-8">
            <Text weight="bold" className="text-2xl">{t('auth.welcome')}</Text>
            <Text className="mt-1 text-sm text-text-muted">{t('auth.subtitle')}</Text>

            {!isConfigured && (
              <View className="mt-4 rounded-sm bg-warning-soft p-3">
                <Text className="text-sm text-warning">Supabase isn’t configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.</Text>
              </View>
            )}

            <View className="mt-6 gap-4">
              <View>
                <Text weight="medium" className="mb-1.5 text-sm">{t('auth.email')}</Text>
                <View className={field}>
                  <Mail size={18} color={colors.textSubtle} />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    textContentType="username"
                    placeholder="name@company.com"
                    placeholderTextColor={colors.textSubtle}
                    className="flex-1 font-inter text-base text-text"
                    accessibilityLabel={t('auth.email')}
                  />
                </View>
              </View>
              <View>
                <Text weight="medium" className="mb-1.5 text-sm">{t('auth.password')}</Text>
                <View className={field}>
                  <Lock size={18} color={colors.textSubtle} />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!show}
                    autoComplete="password"
                    textContentType="password"
                    placeholderTextColor={colors.textSubtle}
                    className="flex-1 font-inter text-base text-text"
                    accessibilityLabel={t('auth.password')}
                    onSubmitEditing={submit}
                  />
                  <Pressable onPress={() => setShow((s) => !s)} hitSlop={12} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
                  </Pressable>
                </View>
              </View>
              {error && (
                <View className="rounded-sm bg-danger-soft p-3" accessibilityLiveRegion="polite">
                  <Text className="text-sm text-danger">{error}</Text>
                </View>
              )}
              <Button label={t('action.signIn')} onPress={submit} loading={busy} disabled={!email || !password} className="mt-2" />
              <Text className="mt-2 text-center text-xs text-text-muted">Demo: priya@teamnest.demo · TeamNest@2026</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
