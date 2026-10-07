import type { TeamNestClient } from '../client';
import { unwrap } from '../errors';

export async function listPackages(client: TeamNestClient) {
  return unwrap(await client.from('packages').select('*').eq('is_active', true).order('sort_order'));
}

/** Creates a quote; discounts above the package limit are routed for approval by the DB. */
export async function createQuote(client: TeamNestClient, q: { leadId: string; packageId: string; listPrice: number; discountPct: number; gstPct: number; notes?: string }) {
  return unwrap(
    await client
      .from('quotes')
      .insert({
        lead_id: q.leadId,
        package_id: q.packageId,
        list_price: q.listPrice,
        discount_pct: q.discountPct,
        gst_pct: q.gstPct,
        status: 'sent',
        notes: q.notes,
        valid_until: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10),
      })
      .select('*')
      .single(),
  );
}

export async function listLeadQuotes(client: TeamNestClient, leadId: string) {
  return unwrap(await client.from('quotes').select('*, package:packages(name, tenure_months)').eq('lead_id', leadId).order('created_at', { ascending: false }));
}

export async function listMyDeals(client: TeamNestClient, ownerId: string, limit = 50) {
  return unwrap(
    await client
      .from('deals')
      .select('id, deal_no, status, contract_value, payment_mode, closed_at, lead:leads(id, business_name), package:packages!deals_package_id_fkey(name)')
      .eq('owner_id', ownerId)
      .order('closed_at', { ascending: false })
      .limit(limit),
  );
}

export async function getDeal(client: TeamNestClient, dealId: string) {
  return unwrap(
    await client
      .from('deals')
      .select('*, lead:leads(id, business_name, contact_name, phone, whatsapp, email, state), package:packages!deals_package_id_fkey(name, tenure_months)')
      .eq('id', dealId)
      .single(),
  );
}

export async function uploadKycDocument(
  client: TeamNestClient,
  args: { orgId: string; userId: string; leadId: string; dealId?: string; categoryId: string; title: string; file: { uri?: string; body?: Blob | ArrayBuffer; contentType: string; ext: string } },
) {
  const path = `${args.orgId}/${args.userId}/kyc/${crypto.randomUUID()}.${args.file.ext}`;
  const body = args.file.body ?? (await (await fetch(args.file.uri!)).arrayBuffer());
  const up = await client.storage.from('kyc').upload(path, body, { contentType: args.file.contentType });
  if (up.error) throw up.error;
  const file = unwrap(
    await client.from('files').insert({ bucket: 'kyc', path, mime_type: args.file.contentType, owner_user_id: args.userId, entity_table: 'leads', entity_id: args.leadId, is_sensitive: true }).select('id').single(),
  );
  return unwrap(
    await client.from('documents').insert({ category_id: args.categoryId, lead_id: args.leadId, deal_id: args.dealId, title: args.title, file_id: file.id }).select('*').single(),
  );
}

export async function listDocumentCategories(client: TeamNestClient, context: 'employee' | 'kyc') {
  return unwrap(await client.from('document_categories').select('*').eq('context', context).order('sort_order'));
}

export async function listLeadDocuments(client: TeamNestClient, leadId: string) {
  return unwrap(await client.from('documents').select('*, category:document_categories(name, code)').eq('lead_id', leadId).order('created_at', { ascending: false }));
}
