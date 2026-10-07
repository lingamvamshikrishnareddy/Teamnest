/** Parses ?month=YYYY-MM into a month start; defaults to the current IST month. */
export function monthFromParam(m?: string) {
  const now = new Date(Date.now() + 330 * 60_000);
  const valid = m && /^\d{4}-\d{2}$/.test(m) ? m : now.toISOString().slice(0, 7);
  const [y, mm] = valid.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  return { key: valid, start: `${valid}-01`, end: `${valid}-${String(days).padStart(2, '0')}`, days };
}
