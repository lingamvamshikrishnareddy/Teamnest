import type { Tables, Enums, Views } from './database';

// Convenience aliases for the most-used rows.
export type Organization = Tables<'organizations'>;
export type UserProfile = Tables<'users'>;
export type Employee = Tables<'employees'>;
export type Team = Tables<'teams'>;
export type Territory = Tables<'territories'>;
export type Lead = Tables<'leads'>;
export type LeadQueue = Tables<'lead_queues'>;
export type Call = Tables<'calls'>;
export type Visit = Tables<'visits'>;
export type Outcome = Tables<'outcomes'>;
export type OutcomeCode = Tables<'outcome_codes'>;
export type FollowUp = Tables<'follow_ups'>;
export type Meeting = Tables<'meetings'>;
export type Package = Tables<'packages'>;
export type Quote = Tables<'quotes'>;
export type Deal = Tables<'deals'>;
export type Payment = Tables<'payments'>;
export type Mandate = Tables<'mandates'>;
export type Invoice = Tables<'invoices'>;
export type DailyKpi = Tables<'daily_kpis'>;
export type Target = Tables<'targets'>;
export type Attendance = Tables<'attendance'>;
export type LeaveType = Tables<'leave_types'>;
export type LeaveBalance = Tables<'leave_balances'>;
export type LeaveRequest = Tables<'leave_requests'>;
export type Payslip = Tables<'payslips'>;
export type Document = Tables<'documents'>;
export type HrRequest = Tables<'requests'>;
export type Policy = Tables<'policies'>;
export type Goal = Tables<'goals'>;
export type Incentive = Tables<'incentives'>;
export type Reimbursement = Tables<'reimbursements'>;
export type Approval = Tables<'approvals'>;
export type ApprovalInboxItem = Views<'my_approvals_inbox'>;
export type Notification = Tables<'notifications'>;

export type LeadStatus = Enums<'lead_status'>;
export type ApprovalType = Enums<'approval_type'>;
export type RequestStatus = Enums<'request_status'>;
export type AttendanceStatus = Enums<'attendance_status'>;

/** Outcome codes seeded for every org (admins can add more). */
export const CORE_OUTCOMES = [
  'interested',
  'call_back',
  'meeting_set',
  'deal_closed',
  'not_interested',
  'do_not_contact',
  'wrong_number',
  'not_reachable',
] as const;
export type CoreOutcome = (typeof CORE_OUTCOMES)[number];

/** Payload stored in payslip earnings/deductions jsonb. */
export interface PayComponent {
  code: string;
  label: string;
  amount: number;
}

/** Queue rule tree stored in lead_queues.rules (evaluated by lead_matches_rules()). */
export type QueueRule =
  | { all: QueueRule[] }
  | { any: QueueRule[] }
  | {
      field: keyof Lead;
      op:
        | 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte'
        | 'is_null' | 'not_null' | 'contains'
        | 'within_next_days' | 'older_than_days' | 'within_last_days' | 'today';
      value?: string | number | boolean | Array<string | number>;
    };

/** Current user's resolved session context, shared by web + mobile. */
export interface SessionContext {
  user: UserProfile;
  employee: Employee | null;
  organization: Organization;
  team: Team | null;
  manager: Pick<UserProfile, 'id' | 'full_name' | 'avatar_url' | 'phone'> | null;
}
