import { AppState, Linking, type AppStateStatus } from 'react-native';

/**
 * Click-to-call tracking. We can't read the dialer's call log, so we time
 * how long the user was away in the dialer and ask them to confirm.
 */
export interface PendingCall {
  leadId: string;
  businessName: string;
  phone: string;
  startedAt: Date;
  recordingConsent: boolean;
}

type Listener = (call: PendingCall, awaySec: number) => void;

let pending: PendingCall | null = null;
let leftAt: number | null = null;
const listeners = new Set<Listener>();

AppState.addEventListener('change', (state: AppStateStatus) => {
  if (!pending) return;
  if (state === 'background' || state === 'inactive') {
    leftAt ??= Date.now();
  } else if (state === 'active' && leftAt) {
    const away = Math.round((Date.now() - leftAt) / 1000);
    const call = pending;
    pending = null;
    leftAt = null;
    listeners.forEach((l) => l(call, away));
  }
});

export async function startCall(call: Omit<PendingCall, 'startedAt'>) {
  pending = { ...call, startedAt: new Date() };
  leftAt = null;
  await Linking.openURL(`tel:${call.phone.replace(/\s/g, '')}`);
}

export function onCallEnded(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
