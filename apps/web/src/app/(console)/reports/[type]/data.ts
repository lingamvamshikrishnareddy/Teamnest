import 'server-only';
import type { getServerClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof getServerClient>>;
type Range = { from: string; to: string; fromTs: string; toTs: string };
export type ReportRow = Record<string, string | number | boolean | null>;

const ist = (ts: string | null) => (ts ? new Date(new Date(ts).getTime() + 330 * 60_000).toISOString().slice(0, 10) : null);

/** Loads rows for a report. RLS scopes every query to the viewer. */
export async function loadReport(supabase: Client, key: string, r: Range, f: { team?: string; city?: string; status?: string }): Promise<ReportRow[]> {
  switch (key) {
    case 'sales':
    case 'talk-time': {
      const { data } = await supabase.from('daily_kpis').select('*, users!inner(full_name, team_id, teams:teams!users_team_id_fkey(name), territory:territories!users_territory_id_fkey(name))').gte('day', r.from).lte('day', r.to);
      const map = new Map<string, ReportRow>();
      for (const k of data ?? []) {
        const u = k.users as unknown as { full_name: string; team_id: string | null; teams: { name: string } | null; territory: { name: string } | null };
        if (f.team && u.team_id !== f.team) continue;
        if (f.city && u.territory?.name !== f.city) continue;
        const row = map.get(k.user_id) ?? { name: u.full_name, team: u.teams?.name ?? '', city: u.territory?.name ?? '', days: 0, calls: 0, connected: 0, talk_sec: 0, visits: 0, km: 0, meetings: 0, deals: 0, revenue: 0, collections: 0, autopay: 0, points: 0 };
        row.days = Number(row.days) + 1; row.calls = Number(row.calls) + k.calls; row.connected = Number(row.connected) + k.connected_calls; row.talk_sec = Number(row.talk_sec) + k.talk_time_sec;
        row.visits = Number(row.visits) + k.visits; row.km = Number(row.km) + Number(k.distance_km); row.meetings = Number(row.meetings) + k.meetings; row.deals = Number(row.deals) + k.deals;
        row.revenue = Number(row.revenue) + Number(k.revenue); row.collections = Number(row.collections) + Number(k.collections); row.autopay = Number(row.autopay) + k.autopay_deals; row.points = Number(row.points) + k.activity_points;
        map.set(k.user_id, row);
      }
      return [...map.entries()].map(([id, v]) => ({ id, ...v }));
    }
    case 'outcomes': {
      const { data } = await supabase.from('report_outcomes').select('*').gte('day', r.from).lte('day', r.to);
      const map = new Map<string, ReportRow>();
      for (const o of data ?? []) {
        const row = map.get(o.user_id!) ?? { id: o.user_id!, name: o.full_name!, total: 0 };
        row[o.outcome_code!] = Number(row[o.outcome_code!] ?? 0) + Number(o.total);
        row.total = Number(row.total) + Number(o.total);
        map.set(o.user_id!, row);
      }
      return [...map.values()];
    }
    case 'field-visits': {
      const { data } = await supabase.from('report_field_visits').select('*').gte('day', r.from).lte('day', r.to).order('check_in_at', { ascending: false }).limit(5000);
      return (data ?? []).map((v) => ({ id: v.id!, day: v.day!, name: v.full_name!, business: v.business_name, locality: v.locality, purpose: v.purpose!, check_in: v.check_in_at, check_out: v.check_out_at, distance_m: v.distance_from_lead_m, verified: v.within_geofence, km: Number(v.travel_distance_km ?? 0) }));
    }
    case 'leads': {
      let q = supabase.from('leads').select('id, lead_code, business_name, phone, city, locality, status, source, segment, tag, created_at, owner:users!leads_owner_id_fkey(full_name)').gte('created_at', r.fromTs).lte('created_at', r.toTs).order('created_at', { ascending: false }).limit(10000);
      if (f.city) q = q.eq('city', f.city);
      if (f.status) q = q.eq('status', f.status as 'new');
      const { data } = await q;
      return (data ?? []).map((l) => ({ id: l.id, code: l.lead_code, business: l.business_name, phone: l.phone, city: l.city, locality: l.locality, status: l.status, source: l.source, segment: l.segment, tag: l.tag, owner: (l.owner as { full_name?: string } | null)?.full_name ?? 'Unassigned', created: ist(l.created_at) }));
    }
    case 'incentives': {
      let q = supabase.from('incentives').select('id, period_month, basis, base_amount, rate_pct, amount, status, approved_at, user:users!incentives_user_id_fkey(full_name), deal:deals(deal_no)').gte('period_month', `${r.from.slice(0, 7)}-01`).lte('period_month', `${r.to.slice(0, 7)}-01`);
      if (f.status) q = q.eq('status', f.status as 'approved');
      const { data } = await q;
      return (data ?? []).map((i) => ({ id: i.id, month: i.period_month, name: (i.user as { full_name?: string } | null)?.full_name ?? '', deal: (i.deal as { deal_no?: string } | null)?.deal_no ?? '', basis: i.basis, base: Number(i.base_amount), rate: i.rate_pct == null ? null : Number(i.rate_pct), amount: Number(i.amount), status: i.status }));
    }
    case 'cancelled':
    case 'downgrades': {
      let q = supabase.from('deals').select('id, deal_no, contract_value, payment_mode, closed_at, cancelled_at, cancel_reason, status, lead:leads(business_name, city), owner:users!deals_owner_id_fkey(full_name), package:packages!deals_package_id_fkey(name), from_pkg:packages!deals_downgraded_from_package_id_fkey(name)');
      q = key === 'cancelled' ? q.eq('status', 'cancelled') : q.not('downgraded_from_package_id', 'is', null);
      const { data } = await q.gte('closed_at', r.fromTs).lte('closed_at', r.toTs);
      return (data ?? []).map((d) => ({ id: d.id, deal: d.deal_no, business: (d.lead as { business_name?: string } | null)?.business_name ?? '', owner: (d.owner as { full_name?: string } | null)?.full_name ?? '', package: (d.package as { name?: string } | null)?.name ?? '', from_package: (d.from_pkg as { name?: string } | null)?.name ?? '', value: Number(d.contract_value), mode: d.payment_mode, closed: ist(d.closed_at), cancelled: ist(d.cancelled_at), reason: d.cancel_reason }));
    }
    case 'autopay': {
      const { data } = await supabase.from('deals').select('closed_at, payment_mode, contract_value, mandates(status, bounce_count)').gte('closed_at', r.fromTs).lte('closed_at', r.toTs);
      const map = new Map<string, ReportRow>();
      for (const d of data ?? []) {
        const month = ist(d.closed_at)!.slice(0, 7);
        const row = map.get(month) ?? { id: month, month, deals: 0, autopay: 0, active: 0, pending: 0, rejected: 0, bounced: 0, value: 0 };
        row.deals = Number(row.deals) + 1;
        if (d.payment_mode === 'autopay') {
          row.autopay = Number(row.autopay) + 1;
          row.value = Number(row.value) + Number(d.contract_value);
          for (const m of (d.mandates as { status: string; bounce_count: number }[]) ?? []) {
            if (m.status === 'active') row.active = Number(row.active) + 1;
            else if (m.status === 'rejected') row.rejected = Number(row.rejected) + 1;
            else row.pending = Number(row.pending) + 1;
            if (m.bounce_count > 0) row.bounced = Number(row.bounced) + 1;
          }
        }
        map.set(month, row);
      }
      return [...map.values()].sort((a, b) => String(b.month).localeCompare(String(a.month)));
    }
    case 'mandates': {
      let q = supabase.from('report_mandates').select('*').gte('created_at', r.fromTs).lte('created_at', r.toTs);
      if (f.status) q = q.eq('status', f.status as 'active');
      const { data } = await q;
      return (data ?? []).map((m) => ({ id: m.id!, deal: m.deal_no, business: m.business_name, owner: m.owner_name, umrn: m.umrn, max: Number(m.max_amount), status: m.status, bounces: m.bounce_count, last_bounce: ist(m.last_bounce_at), reason: m.rejection_reason, start: m.start_date }));
    }
    case 'payment-failures':
    case 'finance': {
      let q = supabase.from('report_payments').select('*').gte('created_at', r.fromTs).lte('created_at', r.toTs).order('created_at', { ascending: false }).limit(10000);
      if (key === 'payment-failures') q = q.eq('status', 'failed');
      else if (f.status) q = q.eq('status', f.status as 'success');
      if (f.city) q = q.eq('city', f.city);
      const { data } = await q;
      return (data ?? []).map((p) => ({ id: p.id!, date: ist(p.created_at), deal: p.deal_no, business: p.business_name, city: p.city, owner: p.owner_name, amount: Number(p.amount), method: p.method, status: p.status, mode: p.payment_mode, receipt: p.receipt_no, reason: p.failure_reason, attempt: p.attempt_no }));
    }
    case 'invoices':
    case 'proforma': {
      const { data } = await supabase.from('invoices').select('id, invoice_no, kind, issued_at, subtotal, discount, cgst, sgst, igst, total, bill_to, deal:deals(deal_no)').eq('kind', key === 'invoices' ? 'tax' : 'proforma').gte('issued_at', r.fromTs).lte('issued_at', r.toTs).order('issued_at', { ascending: false }).limit(10000);
      return (data ?? []).map((i) => ({ id: i.id, number: i.invoice_no, date: ist(i.issued_at), deal: (i.deal as { deal_no?: string } | null)?.deal_no ?? '', customer: (i.bill_to as { name?: string } | null)?.name ?? '', taxable: Number(i.subtotal) - Number(i.discount), cgst: Number(i.cgst), sgst: Number(i.sgst), igst: Number(i.igst), total: Number(i.total) }));
    }
    case 'attendance': {
      const { data } = await supabase.from('attendance').select('user_id, status, is_late, work_minutes, activity_points, users!inner(full_name, team_id, employees(employee_code))').gte('day', r.from).lte('day', r.to);
      const map = new Map<string, ReportRow>();
      for (const a of data ?? []) {
        const u = a.users as unknown as { full_name: string; team_id: string | null; employees: { employee_code: string } | { employee_code: string }[] | null };
        if (f.team && u.team_id !== f.team) continue;
        const code = Array.isArray(u.employees) ? u.employees[0]?.employee_code : u.employees?.employee_code;
        const row = map.get(a.user_id) ?? { id: a.user_id, code: code ?? '', name: u.full_name, present: 0, half_day: 0, absent: 0, on_leave: 0, holiday: 0, late: 0, hours: 0, points: 0 };
        if (a.status in row) row[a.status] = Number(row[a.status]) + 1;
        if (a.is_late) row.late = Number(row.late) + 1;
        row.hours = Number(row.hours) + (a.work_minutes ?? 0) / 60;
        row.points = Number(row.points) + a.activity_points;
        map.set(a.user_id, row);
      }
      return [...map.values()].map((x) => ({ ...x, hours: Math.round(Number(x.hours)) }));
    }
    case 'leave': {
      let q = supabase.from('leave_requests').select('id, from_date, to_date, days, half_day, status, reason, created_at, decided_at, user:users!leave_requests_user_id_fkey(full_name), leave_type:leave_types(name)').lte('from_date', r.to).gte('to_date', r.from).order('from_date', { ascending: false });
      if (f.status) q = q.eq('status', f.status as 'approved');
      const { data } = await q;
      return (data ?? []).map((l) => ({ id: l.id, name: (l.user as { full_name?: string } | null)?.full_name ?? '', type: (l.leave_type as { name?: string } | null)?.name ?? '', from: l.from_date, to: l.to_date, days: Number(l.days), status: l.status, reason: l.reason, applied: ist(l.created_at), decided: ist(l.decided_at) }));
    }
    case 'headcount': {
      const { data } = await supabase.from('report_headcount').select('*');
      return (data ?? []).map((h, i) => ({ id: String(i), department: h.department, city: h.work_city, role: h.role, status: h.status, headcount: Number(h.headcount), joined: Number(h.joined_this_month), exits: Number(h.exits) }));
    }
    case 'payroll': {
      const { data } = await supabase.from('payroll_inputs').select('*').eq('period_month', `${r.to.slice(0, 7)}-01`);
      return (data ?? []).map((p) => ({ id: p.user_id!, code: p.employee_code, name: p.full_name, department: p.department, city: p.work_city, paid_days: Number(p.paid_days), absent: Number(p.absent_days), leave: Number(p.leave_days), late: Number(p.late_marks), incentives: Number(p.incentives), reimbursements: Number(p.reimbursements), locked: p.locked }));
    }
    default:
      return [];
  }
}
