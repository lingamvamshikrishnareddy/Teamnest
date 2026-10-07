/** Quick picks for follow-ups / meetings (device time; field teams run on IST). */
export function quickTimes(now = new Date()) {
  const at = (days: number, h: number, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const later = new Date(now.getTime() + 2 * 3600_000);
  later.setMinutes(later.getMinutes() < 30 ? 30 : 60, 0, 0);
  const nextMonday = (() => {
    const d = at(0, 10);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return d;
  })();
  const options = [
    { key: 'later', label: 'In 2 hours', at: later },
    { key: 'tomorrow', label: 'Tomorrow 10 AM', at: at(1, 10) },
    { key: '2days', label: 'In 2 days', at: at(2, 11) },
    { key: 'nextweek', label: 'Next Monday', at: nextMonday },
  ];
  // don't suggest "In 2 hours" after 7 PM
  return now.getHours() >= 19 ? options.slice(1) : options;
}
