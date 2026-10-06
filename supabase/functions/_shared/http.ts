export const corsHeaders = {
  'access-control-allow-origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-teamnest-client',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'error') {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...corsHeaders } });
}

/** Wraps a handler with CORS preflight, JSON errors and no stack leakage. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      const pg = e as { code?: string; message?: string };
      // Postgres guard functions raise readable messages with these codes
      if (pg.code === '42501') return json({ error: 'forbidden', message: pg.message }, 403);
      if (pg.code === '23514' || pg.code === '23505') return json({ error: 'rule_violation', message: pg.message }, 422);
      if (pg.code === 'P0002') return json({ error: 'not_found', message: pg.message }, 404);
      console.error(e);
      return json({ error: 'internal', message: 'Something went wrong' }, 500);
    }
  });
}
