import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { isAdminRequest } from '@/lib/admin'
import {
  validateRows,
  commitRows,
  type ImportColumnMap,
  type NetworkDeviceImportInput,
} from '@/lib/network-import'
import type { NetworkDeviceSource } from '@/lib/types'

/**
 * POST /api/network/devices/import
 *
 * Re-validates the rows server-side (the wizard validates against this
 * endpoint with `dryRun: true` first to power the preview step) and, when
 * not in dry-run mode, bulk-inserts the valid rows.
 *
 * Body:
 *   {
 *     rows: Record<string, string>[],     // parsed file rows (raw values)
 *     columnMap: ImportColumnMap,          // { targetField -> sourceHeader }
 *     officeName?: string,                 // override: assign every row to this office
 *     defaultSource?: 'csv' | 'manual',    // defaults to 'csv'
 *     dryRun?: boolean                     // if true, validate only; don't insert
 *   }
 *
 * Returns:
 *   {
 *     inserted: number,            // 0 when dryRun is true
 *     skipped: number,             // rows that failed validation
 *     totalRows: number,
 *     validCount: number,
 *     errors: ImportError[],       // flat list across all rows
 *     rowResults: RowResult[],     // per-row valid/invalid for the UI preview
 *     dryRun: boolean
 *   }
 *
 * Admin-only.
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json(
        { error: 'Admin role required' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as {
      rows?: Record<string, string>[]
      columnMap?: ImportColumnMap
      officeName?: string
      defaultSource?: NetworkDeviceSource
      dryRun?: boolean
    }

    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json(
        { error: 'No rows to import' },
        { status: 400 }
      )
    }

    if (!body.columnMap || typeof body.columnMap !== 'object') {
      return NextResponse.json(
        { error: 'columnMap is required' },
        { status: 400 }
      )
    }

    const defaultSource: NetworkDeviceSource = body.defaultSource ?? 'csv'
    const dryRun = body.dryRun === true

    const supabase = getServiceSupabase()
    const { data: offices, error: officesError } = await supabase
      .from('offices')
      .select('id, name')
    if (officesError) throw officesError

    let workingRows = body.rows
    let workingMap = body.columnMap

    if (body.officeName && body.officeName.trim().length > 0) {
      const synthHeader = '__office_override__'
      workingRows = body.rows.map((r) => ({
        ...r,
        [synthHeader]: body.officeName!.trim(),
      }))
      workingMap = { ...body.columnMap, office_name: synthHeader }
    }

    const { valid, errors, rowResults } = validateRows({
      rows: workingRows,
      columnMap: workingMap,
      offices: offices ?? [],
      defaultSource,
    })

    let inserted = 0
    if (!dryRun && valid.length > 0) {
      const result = await commitRows(valid as NetworkDeviceImportInput[])
      inserted = result.inserted
    }

    return NextResponse.json({
      inserted,
      skipped: rowResults.length - valid.length,
      totalRows: rowResults.length,
      validCount: valid.length,
      errors,
      rowResults,
      dryRun,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to import network devices'
    console.error('Error importing network devices:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
