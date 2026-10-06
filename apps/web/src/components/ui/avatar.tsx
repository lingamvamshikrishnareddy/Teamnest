import { initials } from '@teamnest/ui';
import { cn } from '@/lib/utils';

/** Generic placeholder avatar: initials on a tone derived from the name. */
const tones = ['bg-kpi-blue text-kpi-blue-fg', 'bg-kpi-teal text-kpi-teal-fg', 'bg-kpi-orange text-kpi-orange-fg', 'bg-kpi-violet text-kpi-violet-fg', 'bg-kpi-pink text-kpi-pink-fg', 'bg-kpi-green text-kpi-green-fg'];

export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const tone = tones[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % tones.length];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={cn('rounded-full object-cover', className)} />;
  }
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', tone, className)}
    >
      {initials(name)}
    </span>
  );
}
