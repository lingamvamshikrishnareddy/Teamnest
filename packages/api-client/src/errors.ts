/** Turns Supabase/Postgres errors into short, user-facing messages. */
export interface AppError {
  code: string;
  message: string;
  /** True when retrying might help (network, timeouts). */
  retryable: boolean;
  cause?: unknown;
}

interface MaybePgError {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

export function toAppError(err: unknown): AppError {
  const e = (err ?? {}) as MaybePgError;
  const code = e.code ?? (e.status ? String(e.status) : 'unknown');
  const raw = e.message ?? '';

  if (e.name === 'AuthApiError' || code === 'invalid_credentials' || /invalid login credentials/i.test(raw)) {
    return { code: 'invalid_credentials', message: 'That email and password don’t match.', retryable: false, cause: err };
  }
  if (code === '42501' || e.status === 403) {
    // RLS / guard functions use 42501 with a human message — show it when we wrote it ourselves
    const ours = /approvals inbox|HR-approved|own profile|locked|Only HR/i.test(raw);
    return { code: 'forbidden', message: ours ? raw : 'You don’t have access to do that.', retryable: false, cause: err };
  }
  if (code === '23505') return { code: 'duplicate', message: 'This record already exists (possible duplicate).', retryable: false, cause: err };
  if (code === '23514') return { code: 'rule_violation', message: raw || 'That value isn’t allowed.', retryable: false, cause: err };
  if (code === 'P0002') return { code: 'not_found', message: raw || 'Not found.', retryable: false, cause: err };
  if (/fetch failed|network|Failed to fetch|timeout/i.test(raw) || e.status === 0) {
    return { code: 'network', message: 'You seem to be offline. We’ll retry when you’re back.', retryable: true, cause: err };
  }
  return { code, message: 'Something went wrong. Please try again.', retryable: e.status ? e.status >= 500 : false, cause: err };
}

/** Unwraps a Supabase `{ data, error }` result or throws an AppError. */
export function unwrap<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R['data']> {
  if (res.error) throw toAppError(res.error);
  if (res.data === null || res.data === undefined) throw toAppError({ code: 'P0002', message: 'Not found.' });
  return res.data as NonNullable<R['data']>;
}
