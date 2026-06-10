import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin'
import { parseFile } from '@/lib/network-import'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * POST /api/network/devices/import/parse
 *
 * Accepts a multipart/form-data upload with a single `file` field, returns
 * the parsed `{ headers, rows }` for the import wizard's mapping step.
 *
 * Parsing happens server-side because `exceljs` is a Node-only dependency
 * and we don't want to ship it to the browser.
 *
 * Admin-only (same gate as the commit endpoint).
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json(
        { error: 'Admin role required' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file uploaded (expected a `file` field).' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `File too large (${(file.size / 1024 / 1024).toFixed(
            1
          )} MB). Max ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
        },
        { status: 413 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const parsed = await parseFile(buffer, file.name)

    if (parsed.headers.length === 0) {
      return NextResponse.json(
        { error: 'No header row detected in the uploaded file.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      headers: parsed.headers,
      rows: parsed.rows,
      totalRows: parsed.rows.length,
      filename: file.name,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to parse file'
    console.error('Error parsing import file:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
