import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary-text">
        <Compass className="size-6" aria-hidden />
      </span>
      <h1 className="text-2xl font-bold">We couldn’t find that page</h1>
      <p className="max-w-sm text-sm text-text-muted">The link may be old, or you may not have access to it.</p>
      <Button asChild><Link href="/dashboard">Back to dashboard</Link></Button>
    </div>
  );
}
