import {
  BadgeIndianRupee, BriefcaseBusiness, CalendarCheck, ChartColumnBig, CheckCheck, CircleUser, Contact,
  FileBarChart, House, IndianRupee, LayoutDashboard, LifeBuoy, ListFilter, MapPinned, Megaphone, Palette,
  Palmtree, Plus, Receipt, ReceiptText, Repeat, Settings, ShieldCheck, Target, Upload, Users, Wallet,
  type LucideIcon, type LucideProps,
} from 'lucide-react';

/** Explicit map keeps the bundle small (no `import * from lucide`). */
const ICONS: Record<string, LucideIcon> = {
  BadgeIndianRupee, BriefcaseBusiness, CalendarCheck, ChartColumnBig, CheckCheck, CircleUser, Contact,
  FileBarChart, House, IndianRupee, LayoutDashboard, LifeBuoy, ListFilter, MapPinned, Megaphone, Palette,
  Palmtree, Plus, Receipt, ReceiptText, Repeat, Settings, ShieldCheck, Target, Upload, Users, Wallet,
};

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = ICONS[name] ?? LayoutDashboard;
  return <Cmp aria-hidden {...props} />;
}

export const iconNames = Object.keys(ICONS);
