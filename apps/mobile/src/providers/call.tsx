import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Mic, PhoneCall, PhoneOff } from 'lucide-react-native';
import { getConsents, recordConsent, toAppError } from '@teamnest/api-client';
import { formatDuration } from '@teamnest/ui';
import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { onCallEnded, startCall, type PendingCall } from '@/lib/call-tracker';
import { sendOrQueue } from '@/lib/outbox';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth';
import { useI18n } from './i18n';
import { useTheme } from './theme';

interface CallTarget {
  id: string;
  business_name: string;
  phone: string;
  is_dnc?: boolean;
}

const CallContext = createContext<{ call: (lead: CallTarget) => void } | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const { context } = useAuth();
  const { t } = useI18n();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const userId = context?.user.id;

  const [consentFor, setConsentFor] = useState<CallTarget | null>(null);
  const recordingConsent = useRef<boolean | undefined>(undefined);
  const [ended, setEnded] = useState<{ call: PendingCall; seconds: number } | null>(null);
  const [connected, setConnected] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!userId) return;
    getConsents(supabase, userId).then((c) => (recordingConsent.current = c.call_recording)).catch(() => undefined);
  }, [userId]);

  useEffect(
    () =>
      onCallEnded((call, away) => {
        // a few seconds go to dialing/ringing; anything under ~15 s is almost certainly not connected
        const talk = Math.max(0, away - 5);
        setSeconds(talk);
        setConnected(talk >= 15);
        setError(undefined);
        setEnded({ call, seconds: talk });
      }),
    [],
  );

  const dial = useCallback(async (lead: CallTarget, consent: boolean) => {
    await startCall({ leadId: lead.id, businessName: lead.business_name, phone: lead.phone, recordingConsent: consent });
  }, []);

  const call = useCallback(
    (lead: CallTarget) => {
      if (lead.is_dnc) return;
      if (recordingConsent.current === undefined) setConsentFor(lead);
      else void dial(lead, recordingConsent.current);
    },
    [dial],
  );

  const answerConsent = async (allow: boolean) => {
    const lead = consentFor!;
    setConsentFor(null);
    recordingConsent.current = allow;
    if (userId) recordConsent(supabase, userId, 'call_recording', allow).catch(() => undefined);
    await dial(lead, allow);
  };

  const save = async () => {
    if (!ended || !userId) return;
    setSaving(true);
    try {
      const res = await sendOrQueue({
        kind: 'call',
        userId,
        payload: {
          leadId: ended.call.leadId,
          phone: ended.call.phone,
          startedAt: ended.call.startedAt.toISOString(),
          durationSec: connected ? seconds : 0,
          connected,
          recordingConsent: ended.call.recordingConsent,
        },
      });
      const leadId = ended.call.leadId;
      setEnded(null);
      qc.invalidateQueries({ queryKey: ['kpis'] });
      qc.invalidateQueries({ queryKey: ['lead-timeline', leadId] });
      router.push({ pathname: '/lead/[id]/outcome', params: { id: leadId, callId: res.id ?? '', connected: connected ? '1' : '0' } });
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setSaving(false);
    }
  };

  const adjust = (delta: number) => setSeconds((s) => Math.max(0, s + delta));

  return (
    <CallContext.Provider value={{ call }}>
      {children}

      <Sheet visible={!!consentFor} title="Call recording" onClose={() => setConsentFor(null)}>
        <View className="flex-row gap-3 rounded-card bg-info-soft p-4">
          <Mic size={22} color={colors.info} />
          <Text className="flex-1 text-sm text-info">{t('privacy.recording')}</Text>
        </View>
        <Text className="text-sm text-text-muted">
          Recording is optional. If you allow it, always tell the customer before you start. Recordings are deleted after 90 days. You can change this anytime in Profile → Privacy.
        </Text>
        <Button label="Allow recording" onPress={() => answerConsent(true)} />
        <Button label="Call without recording" variant="outline" onPress={() => answerConsent(false)} />
      </Sheet>

      <Sheet visible={!!ended} title={ended ? `Call with ${ended.call.businessName}` : ''} onClose={() => setEnded(null)}>
        <View className="flex-row gap-3">
          {[
            { v: true, label: 'Connected', Icon: PhoneCall },
            { v: false, label: 'Not connected', Icon: PhoneOff },
          ].map(({ v, label, Icon }) => (
            <Pressable
              key={label}
              onPress={() => setConnected(v)}
              accessibilityRole="radio"
              accessibilityState={{ checked: connected === v }}
              className={`min-h-tap flex-1 items-center gap-1 rounded-card border p-3 ${connected === v ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}
            >
              <Icon size={20} color={connected === v ? colors.primaryText : colors.textMuted} />
              <Text weight="semibold" className={connected === v ? 'text-primary-text' : 'text-text-muted'}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {connected && (
          <View className="items-center rounded-card bg-surface p-4">
            <Text className="text-sm text-text-muted">Talk time</Text>
            <Text weight="bold" className="my-1 text-3xl">{formatDuration(seconds)}</Text>
            <View className="flex-row gap-2">
              {[-60, -10, 10, 60].map((d) => (
                <Pressable key={d} onPress={() => adjust(d)} className="min-h-10 min-w-14 items-center justify-center rounded-full border border-border px-3" accessibilityRole="button">
                  <Text weight="medium">{d > 0 ? '+' : '−'}{Math.abs(d) >= 60 ? `${Math.abs(d) / 60}m` : `${Math.abs(d)}s`}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {ended?.call.recordingConsent ? (
          <View className="flex-row items-center justify-between rounded-sm bg-surface px-4 py-3">
            <Text className="text-sm">Customer informed about recording</Text>
            <Switch value disabled />
          </View>
        ) : null}
        {error ? <Text className="text-sm text-danger">{error}</Text> : null}
        <Button label="Save & add outcome" onPress={save} loading={saving} />
      </Sheet>
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>');
  return ctx;
}
