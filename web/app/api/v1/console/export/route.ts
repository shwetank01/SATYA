export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { caseRegister } from '@/lib/console/metrics';
import { fail, isResponse, requireBank } from '@/lib/gateway';
import { listReports, logAction, storeConfigured } from '@/lib/store';

/** Case register as CSV (tags only). The download itself is recorded in the audit trail. */
export async function GET(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const rows = await listReports(u.org);
  await logAction(u.org, u.user, 'exported_case_register', undefined, `${rows.length} report(s)`);
  const name = `nyaya-${u.org.toLowerCase()}-case-register-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(caseRegister(rows), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' },
  });
}
