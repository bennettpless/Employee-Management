const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

const root = path.resolve(__dirname, '..')
loadEnv(path.join(root, '.env.local'))
loadEnv(path.join(root, '.env'))

const PREFIX = 'AUG-TEST'
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const { data: existing, error: existingErr } = await sb
    .from('asset_purchase_lots')
    .select('id, item_id')
    .like('item_id', `${PREFIX}%`)
  if (existingErr) throw existingErr
  const ids = (existing || []).map((row) => row.id)
  if (ids.length > 0) {
    const { error: delAlloc } = await sb.from('asset_allocations').delete().in('lot_id', ids)
    if (delAlloc) throw delAlloc
    const { error: delLots } = await sb.from('asset_purchase_lots').delete().in('id', ids)
    if (delLots) throw delLots
    console.log(`Removed ${ids.length} previous ${PREFIX} lot(s)`)
  }

  const lots = [
    {
      item_id: `${PREFIX}-OPEN`,
      purchase_date: '2026-08-04',
      vendor: 'MicroAge',
      item_description: 'August leftover closet — should still show on Stock',
      qty_purchased: 5,
      unit_cost: 1200,
      asset_type: 'laptop',
      manufacturer: 'Dell',
      model: 'Latitude 5550',
      created_at: '2026-08-04T14:00:00.000Z',
      updated_at: '2026-08-04T14:00:00.000Z',
      created_by: 'seed-august-scenarios',
      updated_by: 'seed-august-scenarios',
    },
    {
      item_id: `${PREFIX}-EMPTY`,
      purchase_date: '2026-08-01',
      vendor: 'CDW',
      item_description: 'Emptied in August — hidden on Stock, still on August report',
      qty_purchased: 3,
      unit_cost: 900,
      asset_type: 'laptop',
      manufacturer: 'HP',
      model: 'EliteBook 840',
      created_at: '2026-08-01T14:00:00.000Z',
      updated_at: '2026-08-18T14:00:00.000Z',
      created_by: 'seed-august-scenarios',
      updated_by: 'seed-august-scenarios',
    },
    {
      item_id: `${PREFIX}-LAT-A`,
      purchase_date: '2026-08-03',
      vendor: 'MicroAge',
      item_description: 'Same-day Charlotte split — older cheaper Latitude',
      qty_purchased: 1,
      unit_cost: 1200,
      asset_type: 'laptop',
      manufacturer: 'Dell',
      model: 'Latitude 5550',
      created_at: '2026-08-03T14:00:00.000Z',
      updated_at: '2026-08-25T14:00:00.000Z',
      created_by: 'seed-august-scenarios',
      updated_by: 'seed-august-scenarios',
    },
    {
      item_id: `${PREFIX}-LAT-B`,
      purchase_date: '2026-08-15',
      vendor: 'MicroAge',
      item_description: 'Same-day Charlotte split — later pricier Latitude',
      qty_purchased: 1,
      unit_cost: 1350,
      asset_type: 'laptop',
      manufacturer: 'Dell',
      model: 'Latitude 5550',
      created_at: '2026-08-15T14:00:00.000Z',
      updated_at: '2026-08-25T14:00:00.000Z',
      created_by: 'seed-august-scenarios',
      updated_by: 'seed-august-scenarios',
    },
    {
      item_id: `${PREFIX}-DESK`,
      purchase_date: '2026-08-12',
      vendor: 'Dell',
      item_description: 'August desktop still in closet — assign from Devices to practice FIFO',
      qty_purchased: 4,
      unit_cost: 800,
      asset_type: 'desktop',
      manufacturer: 'Dell',
      model: 'OptiPlex 7020',
      created_at: '2026-08-12T14:00:00.000Z',
      updated_at: '2026-08-12T14:00:00.000Z',
      created_by: 'seed-august-scenarios',
      updated_by: 'seed-august-scenarios',
    },
  ]

  const { data: inserted, error: insertLotsErr } = await sb
    .from('asset_purchase_lots')
    .insert(
      lots.map((lot) => ({
        ...lot,
        total_purchase_cost: Math.round(lot.qty_purchased * lot.unit_cost * 100) / 100,
      }))
    )
    .select('id, item_id, unit_cost')
  if (insertLotsErr) throw insertLotsErr
  const byItem = Object.fromEntries((inserted || []).map((row) => [row.item_id, row]))

  const allocations = [
    {
      lot_id: byItem[`${PREFIX}-OPEN`].id,
      assigned_date: '2026-08-08',
      office: 'Charlotte',
      quantity: 2,
      unit_cost: 1200,
      allocated_cost: 2400,
    },
    {
      lot_id: byItem[`${PREFIX}-EMPTY`].id,
      assigned_date: '2026-08-18',
      office: 'Florida',
      quantity: 3,
      unit_cost: 900,
      allocated_cost: 2700,
    },
    {
      lot_id: byItem[`${PREFIX}-LAT-A`].id,
      assigned_date: '2026-08-25',
      office: 'Charlotte',
      quantity: 1,
      unit_cost: 1200,
      allocated_cost: 1200,
    },
    {
      lot_id: byItem[`${PREFIX}-LAT-B`].id,
      assigned_date: '2026-08-25',
      office: 'Charlotte',
      quantity: 1,
      unit_cost: 1350,
      allocated_cost: 1350,
    },
  ].map((row) => ({
    ...row,
    device_id: null,
    source: 'manual',
    created_by: 'seed-august-scenarios',
  }))

  const { error: allocErr } = await sb.from('asset_allocations').insert(allocations)
  if (allocErr) throw allocErr

  console.log(`Seeded ${inserted.length} ${PREFIX} lots`)
  console.log('Stock Tracker should show: AUG-TEST-OPEN (3 left), AUG-TEST-DESK (4 left)')
  console.log('Stock Tracker should hide: AUG-TEST-EMPTY, AUG-TEST-LAT-A, AUG-TEST-LAT-B')
  console.log('Reports → August 2026 should list Charlotte + Florida rows, including two Latitude lines on 2026-08-25')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
