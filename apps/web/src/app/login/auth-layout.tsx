import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Logo } from '@/components/logo';

const points = [
  'Live team performance, talk time and collections',
  'Leads, queues and assignment in one place',
  'Attendance, leave, payroll inputs and approvals',
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <section className="relative hidden overflow-hidden bg-header p-12 text-on-header lg:flex lg:flex-col lg:justify-between">
        <Logo className="[&_span]:text-on-header" />
        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-bold leading-tight">Field sales and HR, together.</h2>
          <ul className="mt-6 space-y-3 text-sm/6 opacity-90">
            {points.map((p) => (
              <li key={p} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {p}</li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs opacity-70">Demo environment · all data is fictional</p>
        {/* decorative arcs echoing the logo mark */}
        <svg aria-hidden className="absolute -bottom-40 -right-40 size-[520px] opacity-15" viewBox="0 0 100 100" fill="none">
          <path d="M5 50a45 45 0 0 0 90 0" stroke="white" strokeWidth="6" strokeLinecap="round" />
          <path d="M22 50a28 28 0 0 0 56 0" stroke="#14B8A6" strokeWidth="6" strokeLinecap="round" />
          <circle cx="50" cy="33" r="8" fill="#F97316" />
        </svg>
      </section>
      <section className="flex items-center justify-center bg-background p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          {children}
        </div>
      </section>
    </div>
  );
}
