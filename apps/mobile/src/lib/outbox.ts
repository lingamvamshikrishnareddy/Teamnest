import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { clientRef, logCall, logOutcome, toAppError, type CallLog, type OutcomeInput } from '@teamnest/api-client';
import { supabase } from './supabase';

/**
 * Offline outbox for field activity. Calls and outcomes are written with a
 * client_ref, so replays after reconnecting are idempotent server-side.
 */
type Job =
  | { id: string; kind: 'call'; userId: string; payload: Omit<CallLog, 'startedAt'> & { startedAt: string }; tries: number }
  | { id: string; kind: 'outcome'; userId: string; payload: Omit<OutcomeInput, 'nextFollowUpAt'> & { nextFollowUpAt?: string | null }; tries: number };

const KEY = 'tn.outbox.v1';
let flushing = false;
const subscribers = new Set<(n: number) => void>();

async function read(): Promise<Job[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
  } catch {
    return [];
  }
}
async function write(jobs: Job[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(jobs));
  subscribers.forEach((s) => s(jobs.length));
}

export function subscribeOutbox(fn: (pending: number) => void) {
  subscribers.add(fn);
  read().then((j) => fn(j.length));
  return () => {
    subscribers.delete(fn);
  };
}

async function run(job: Job): Promise<string | undefined> {
  if (job.kind === 'call') {
    const row = await logCall(supabase, job.userId, { ...job.payload, startedAt: new Date(job.payload.startedAt) }).catch((e) => {
      // a replay of an already-synced call returns no row — that's success
      if (toAppError(e).code === 'not_found') return null;
      throw e;
    });
    return row?.id;
  }
  const row = await logOutcome(supabase, job.userId, { ...job.payload, nextFollowUpAt: job.payload.nextFollowUpAt ? new Date(job.payload.nextFollowUpAt) : null });
  return row.id;
}

/** Try now; if offline (or a network error), queue for later. */
export async function sendOrQueue(job: Omit<Job, 'id' | 'tries'>): Promise<{ sent: boolean; id?: string }> {
  const full = { ...job, id: clientRef(), tries: 0, payload: { ...job.payload, clientRef: job.payload.clientRef ?? clientRef() } } as Job;
  const net = await NetInfo.fetch();
  if (net.isConnected !== false) {
    try {
      return { sent: true, id: await run(full) };
    } catch (e) {
      if (!toAppError(e).retryable) throw e;
    }
  }
  await write([...(await read()), full]);
  return { sent: false };
}

export async function flushOutbox() {
  if (flushing) return;
  flushing = true;
  try {
    const jobs = await read();
    const remaining: Job[] = [];
    for (const job of jobs) {
      try {
        await run(job);
      } catch (e) {
        const err = toAppError(e);
        // permanent failures (e.g. lead reassigned → RLS) are dropped after 5 attempts
        if (err.retryable || job.tries < 5) remaining.push({ ...job, tries: job.tries + 1 });
      }
    }
    await write(remaining);
  } finally {
    flushing = false;
  }
}

NetInfo.addEventListener((s) => {
  if (s.isConnected) void flushOutbox();
});
