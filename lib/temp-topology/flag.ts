/**
 * Kill-switch for the inter-office topology page.
 *
 * The inter-office canvas started life as a throwaway workbench (hence the
 * `temp-topology` folder name and the env var name below), but its data now
 * lives in the `office_connections` table + `offices.layout_x/_y` (see
 * `supabase/migrations/10_office_connections.sql`), so the feature is
 * permanent. This flag is only retained as a hard kill-switch — set
 * `NEXT_PUBLIC_TEMP_TOPOLOGY=0` to hide `/network/inter-office` and its
 * dashboard link without removing any code or dropping any DB rows.
 *
 * Defaulting to enabled keeps the map available without any env change.
 */
export function isTempTopologyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TEMP_TOPOLOGY !== '0'
}
