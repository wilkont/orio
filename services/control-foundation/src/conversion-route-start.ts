import type { Pool } from 'pg';
import type { ConversionRouteQuote, IndependentRouteLimit } from './conversion-route.ts';

/** Trusted internal recorder requiring migration 004. No swap execution. */
export async function recordConversionRouteStart(
  pool: Pool,
  eventId: string,
  expectedVersion: string,
  quote: ConversionRouteQuote,
  independent: IndependentRouteLimit,
): Promise<{ state: string; version: string }> {
  if (typeof expectedVersion !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(expectedVersion))
    throw new Error('Invalid conversion version');
  // Calling the migration-specific entry point fails closed if 004 is absent.
  // SQL rechecks persisted state under locks; retry is a receipt, not permission
  // to execute twice. Evidence authentication remains the adapter's obligation.
  const result = await pool.query<{ resulting_state: string; resulting_version: string }>(
    'SELECT resulting_state,resulting_version FROM orio_conversion.record_route_start($1,$2,$3::jsonb,$4::jsonb)',
    [eventId, expectedVersion, JSON.stringify(quote), JSON.stringify(independent)]);
  const row = result.rows[0];
  if (!row) throw new Error('Missing conversion start receipt');
  return { state: row.resulting_state, version: row.resulting_version };
}
