import { Smartphone } from 'lucide-react';
import { Logo } from '@/components/logo';

export const metadata = { title: 'Use the mobile app' };

export default function MobileOnly() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <Logo />
      <span className="mt-6 inline-flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent-text">
        <Smartphone className="size-6" aria-hidden />
      </span>
      <h1 className="text-2xl font-bold">TeamNest lives on your phone</h1>
      <p className="max-w-sm text-sm text-text-muted">
        Your leads, calls, attendance, leave and payslips are in the TeamNest mobile app. The web console is for managers, HR and finance.
      </p>
    </div>
  );
}
