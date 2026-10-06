import { MapPin, Mic, ShieldCheck, Trash2 } from 'lucide-react';
import { Logo } from '@/components/logo';

export const metadata = { title: 'Employee privacy notice' };

const sections = [
  { icon: MapPin, title: 'Location', body: 'Collected only while you are punched in, and only within your shift window (30 minutes before start to 60 minutes after end). Used to verify field visits, calculate distance travelled and activity points. Never collected on leave days or holidays.' },
  { icon: Mic, title: 'Call recording', body: 'Off by default. You choose to record a call, and the app reminds you to tell the customer first. Recordings are kept for 90 days for quality and dispute resolution, then deleted automatically.' },
  { icon: ShieldCheck, title: 'Sensitive HR data', body: 'Bank account, PAN, Aadhaar and salary are encrypted at rest. Only you, HR and Finance can see them in full; everyone else sees masked values. Every time HR or Finance views them, it is recorded in the audit log.' },
  { icon: Trash2, title: 'Your choices', body: 'You can withdraw consent for location tracking or call recording at any time from Profile → Privacy in the mobile app. Location history is deleted after 30 days.' },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Logo />
        <h1 className="mt-8 text-3xl font-bold tracking-tight">Employee privacy notice</h1>
        <p className="mt-2 text-sm text-text-muted">Version 2026.1 · Plain-language summary of what TeamNest collects and why.</p>
        <div className="mt-8 space-y-4">
          {sections.map(({ icon: I, title, body }) => (
            <section key={title} className="flex gap-4 rounded-card bg-surface p-5 shadow-card">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-text"><I className="size-5" aria-hidden /></span>
              <div>
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-text-muted">{body}</p>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
