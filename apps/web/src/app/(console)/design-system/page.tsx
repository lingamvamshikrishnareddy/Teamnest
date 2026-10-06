import type { Metadata } from 'next';
import { BadgeIndianRupee, Handshake, IndianRupee, PhoneCall, Repeat, Search, ShieldAlert, Star, TrendingUp, Wifi } from 'lucide-react';
import {
  chartColors, createTranslator, darkTheme, formatDate, formatDateTime, formatDistance, formatDuration, formatINR, formatINRCompact,
  formatPhone, kpiTones, layout, lightTheme, radius, typography, type KpiTone, type SemanticTheme,
} from '@teamnest/ui';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Design system' };

const swatchGroups: { title: string; keys: (keyof SemanticTheme)[] }[] = [
  { title: 'Brand', keys: ['primary', 'header', 'accent', 'highlight', 'primarySoft', 'accentSoft', 'highlightSoft'] },
  { title: 'Surfaces', keys: ['background', 'surface', 'surfaceMuted', 'border', 'borderStrong'] },
  { title: 'Text', keys: ['text', 'textMuted', 'textSubtle', 'primaryText', 'accentText', 'highlightText'] },
  { title: 'Status', keys: ['success', 'warning', 'danger', 'info'] },
];

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function DesignSystemPage() {
  const tones = Object.keys(kpiTones.light) as KpiTone[];
  const sample = new Date('2026-10-06T08:35:00Z');

  return (
    <>
      <PageHeader
        title="Design system"
        description="Tokens live in packages/ui/src/tokens.ts and feed Tailwind (web), NativeWind (mobile) and theme.css. Toggle the theme in the top bar to see dark mode."
      />
      <div className="grid gap-6">
        <Section title="Colour" description="Semantic tokens. Every text/background pair is checked for WCAG AA contrast in CI.">
          <div className="grid gap-6">
            {swatchGroups.map((g) => (
              <div key={g.title}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">{g.title}</h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
                  {g.keys.map((k) => (
                    <div key={k} className="overflow-hidden rounded-sm border border-border">
                      <div className="h-14" style={{ background: `rgb(var(--tn-${kebab(k)}))` }} />
                      <div className="space-y-0.5 bg-surface p-2 text-[11px] leading-tight">
                        <div className="font-semibold text-text">{k}</div>
                        <div className="font-mono text-text-muted">{lightTheme[k]}</div>
                        <div className="font-mono text-text-subtle">dark {darkTheme[k]}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Chart series</h4>
              <div className="flex flex-wrap gap-2">
                {chartColors.map((c, i) => (
                  <span key={c} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 text-xs">
                    <span className="size-3 rounded-full" style={{ background: c }} /> {i + 1} · <span className="font-mono">{c}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title="KPI tiles" description="Pastel tones with trend arrows. Up is green unless the metric is inverse (e.g. bounce %).">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile label="Revenue" value={formatINRCompact(1_845_000)} tone="blue" icon={IndianRupee} change={12.4} hint="vs last month" />
            <KpiTile label="Deals Closed" value="38" tone="teal" icon={Handshake} change={-6.1} hint="vs last month" />
            <KpiTile label="Collections" value={formatINRCompact(925_500)} tone="orange" icon={BadgeIndianRupee} change={3.2} />
            <KpiTile label="Bounce %" value="4.8%" tone="violet" icon={Repeat} change={-1.6} inverse hint="lower is better" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {tones.map((t) => (
              <span key={t} className={`rounded-sm px-3 py-1.5 text-xs font-semibold bg-kpi-${t} text-kpi-${t}-fg`}>{t}</span>
            ))}
          </div>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Buttons" description={`Min tap target on mobile: ${layout.minTapTarget}dp.`}>
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="accent">Accent</Button>
              <Button variant="highlight">Highlight</Button>
              <Button variant="soft">Soft</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" variant="outline" aria-label="Call"><PhoneCall /></Button>
              <Button disabled>Disabled</Button>
            </div>
          </Section>

          <Section title="Badges, inputs, avatars">
            <div className="flex flex-wrap gap-2">
              <Badge tone="primary">New</Badge>
              <Badge tone="highlight"><Star className="size-3" /> Hot</Badge>
              <Badge tone="accent">Renewal</Badge>
              <Badge tone="success">Paid</Badge>
              <Badge tone="warning">Pending</Badge>
              <Badge tone="danger">Bounced</Badge>
              <Badge tone="info">Meeting</Badge>
              <Badge>Neutral</Badge>
            </div>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
              <Input placeholder="Search by business name" className="pl-9" aria-label="Example search" />
            </div>
            <div className="mt-4 flex items-center gap-3">
              {['Priya Nair', 'Karthik Goud', 'Ananya Hegde', 'Farhan Qureshi', 'Tanvi Bhosale'].map((n) => <Avatar key={n} name={n} size={40} />)}
            </div>
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </Section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Typography" description={`${typography.fontFamily.sans} with Noto Devanagari / Telugu fallbacks.`}>
            <div className="space-y-2">
              {(['4xl', '3xl', '2xl', 'xl', 'lg', 'base', 'sm', 'xs'] as const).map((s) => (
                <div key={s} className="flex items-baseline gap-4">
                  <span className="w-12 shrink-0 font-mono text-xs text-text-subtle">{s}</span>
                  <span className={`text-${s} font-semibold truncate`}>Field sales, together</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Shape & depth" description={`Cards use ${radius.md}px radius with a soft shadow.`}>
            <div className="grid grid-cols-3 gap-3">
              {(['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const).map((r) => (
                <div key={r} className={`flex h-16 items-center justify-center rounded-${r} border border-border bg-surface-muted text-xs`}>
                  {r} · {radius[r]}px
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="flex h-20 items-center justify-center rounded-card bg-surface text-xs shadow-card">shadow-card</div>
              <div className="flex h-20 items-center justify-center rounded-card bg-surface text-xs shadow-raised">shadow-raised</div>
            </div>
          </Section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Indian formats (IST)" description="From packages/ui/src/format.ts — identical on web and mobile.">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {[
                ['Currency', formatINR(1234567)],
                ['Compact', `${formatINRCompact(85_400)} · ${formatINRCompact(1_250_000)} · ${formatINRCompact(32_500_000)}`],
                ['Date', formatDate(sample)],
                ['Date & time', formatDateTime(sample)],
                ['Duration', formatDuration(3725)],
                ['Distance', `${formatDistance(850)} · ${formatDistance(2380)}`],
                ['Phone', formatPhone('+919800000001')],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-text-muted">{k}</dt>
                  <dd className="font-medium tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Languages" description="English, Hindi and Telugu ready — the same keys in every dictionary.">
            <div className="space-y-3">
              {(['en-IN', 'hi-IN', 'te-IN'] as const).map((loc) => {
                const t = createTranslator(loc);
                return (
                  <div key={loc} className="rounded-sm bg-surface-muted p-3">
                    <div className="text-xs font-semibold text-text-muted">{loc}</div>
                    <div className="mt-1 font-semibold">{t('greeting.morning', { name: 'Priya' })}</div>
                    <div className="text-sm text-text-muted">
                      {t('tabs.home')} · {t('tabs.leads')} · {t('tabs.add')} · {t('tabs.work')} · {t('tabs.profile')}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        <Section title="Feedback states">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex items-start gap-3 rounded-sm bg-success-soft p-3 text-sm text-success"><TrendingUp className="size-4 shrink-0" /> You are 12% ahead of last month.</div>
            <div className="flex items-start gap-3 rounded-sm bg-warning-soft p-3 text-sm text-warning"><Wifi className="size-4 shrink-0" /> You’re offline. Changes will sync when you reconnect.</div>
            <div className="flex items-start gap-3 rounded-sm bg-danger-soft p-3 text-sm text-danger"><ShieldAlert className="size-4 shrink-0" /> Auto-pay mandate rejected: signature mismatch.</div>
          </div>
        </Section>
      </div>
    </>
  );
}
