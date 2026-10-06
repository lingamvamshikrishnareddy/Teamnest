import type { TeamNestClient } from '../client';
import { unwrap } from '../errors';

/** Unified approvals inbox (leave, discounts, reimbursements, requests, incentives). */
export async function getApprovalsInbox(client: TeamNestClient) {
  return unwrap(await client.from('my_approvals_inbox').select('*').order('created_at', { ascending: false }));
}

export async function decideApproval(client: TeamNestClient, approvalId: string, approve: boolean, comment?: string) {
  return unwrap(
    await client.rpc('decide_approval', { p_approval_id: approvalId, p_approve: approve, p_comment: comment ?? undefined }),
  );
}
