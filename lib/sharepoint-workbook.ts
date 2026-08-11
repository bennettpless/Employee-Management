import { getGraphClient } from './azure-graph'

/**
 * Generalized SharePoint Excel workbook reader.
 *
 * Used by the onboarding sync and device-inventory import. Opens any workbook
 * on the configured SharePoint site by file name, sharing/Doc.aspx URL, or
 * sourcedoc GUID, and reads any sheet.
 */

export interface WorkbookRef {
  /** Exact file name to search for on the configured SharePoint site drive */
  fileName?: string
  /** A SharePoint sharing or Doc.aspx URL (sourcedoc GUID is extracted if present) */
  shareUrl?: string
}

export interface SheetData {
  headers: string[]
  rows: Record<string, string | number | boolean | null>[]
}

async function getSiteId(client: any): Promise<string> {
  const sitePath = process.env.SHAREPOINT_SITE_PATH || ''
  if (!sitePath) {
    throw new Error('SHAREPOINT_SITE_PATH must be configured')
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sitePath)) {
    return sitePath
  }
  let normalizedPath = sitePath
  if (normalizedPath.startsWith('/sites/')) {
    normalizedPath = normalizedPath.slice(7)
  }
  const siteResponse = await client.api(`/sites/${normalizedPath}`).get()
  return siteResponse.id
}

function extractSourcedocGuid(url: string): string | null {
  const match = /sourcedoc=(?:%7B|\{)?([0-9a-f-]{36})(?:%7D|\})?/i.exec(url)
  return match ? match[1] : null
}

function encodeShareUrl(url: string): string {
  const base64 = Buffer.from(url, 'utf-8')
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\//g, '_')
    .replace(/\+/g, '-')
  return `u!${base64}`
}

/**
 * Resolve a WorkbookRef to a Graph drive-item path like
 * `/drives/{driveId}/items/{itemId}`.
 */
export async function resolveWorkbookItemPath(client: any, ref: WorkbookRef): Promise<string> {
  if (ref.shareUrl) {
    // Doc.aspx URLs carry the file's listItemUniqueId in the sourcedoc param;
    // SharePoint drives support addressing items by that GUID directly.
    const guid = extractSourcedocGuid(ref.shareUrl)
    if (guid) {
      try {
        const siteId = await getSiteId(client)
        const item = await client.api(`/sites/${siteId}/drive/items/${guid}?$select=id,name,parentReference`).get()
        return `/drives/${item.parentReference.driveId}/items/${item.id}`
      } catch {
        // fall through to the /shares endpoint
      }
    }
    const shareId = encodeShareUrl(ref.shareUrl)
    const item = await client.api(`/shares/${shareId}/driveItem?$select=id,name,parentReference`).get()
    return `/drives/${item.parentReference.driveId}/items/${item.id}`
  }

  if (ref.fileName) {
    const siteId = await getSiteId(client)
    const searchResults = await client
      .api(`/sites/${siteId}/drive/root/search(q='${encodeURIComponent(ref.fileName)}')`)
      .get()
    const files = searchResults.value || []
    const match = files.find((f: any) => f.name === ref.fileName) || files[0]
    if (!match) {
      throw new Error(`Workbook "${ref.fileName}" not found on SharePoint site`)
    }
    return `/drives/${match.parentReference.driveId}/items/${match.id}`
  }

  throw new Error('WorkbookRef must have fileName or shareUrl')
}

/**
 * Build a WorkbookRef from an env var that may hold either a SharePoint URL
 * or a plain file name. Falls back to the provided default file name.
 */
export function workbookRefFromEnv(envVar: string, defaultFileName: string): WorkbookRef {
  const value = (process.env[envVar] || '').trim()
  if (!value) return { fileName: defaultFileName }
  if (/^https?:\/\//i.test(value)) return { shareUrl: value }
  return { fileName: value }
}

export async function listWorksheets(ref: WorkbookRef): Promise<string[]> {
  const client = await getGraphClient()
  const itemPath = await resolveWorkbookItemPath(client, ref)
  const response = await client.api(`${itemPath}/workbook/worksheets?$select=name`).get()
  return (response.value || []).map((ws: any) => ws.name)
}

/**
 * Read a sheet's raw cell grid (usedRange values). Useful for transposed
 * sheets where columns are records instead of rows.
 */
export async function readWorkbookSheetRaw(ref: WorkbookRef, sheetName: string): Promise<any[][]> {
  const client = await getGraphClient()
  const itemPath = await resolveWorkbookItemPath(client, ref)
  const workbookPath = `${itemPath}/workbook`

  const sessionResponse = await client
    .api(`${workbookPath}/createSession`)
    .post({ persistChanges: false })
  const sessionId = sessionResponse.id

  try {
    const worksheetsResponse = await client
      .api(`${workbookPath}/worksheets?$select=id,name`)
      .header('workbook-session-id', sessionId)
      .get()

    const worksheet = (worksheetsResponse.value || []).find(
      (ws: any) => ws.name.trim().toLowerCase() === sheetName.trim().toLowerCase()
    )
    if (!worksheet) {
      const available = (worksheetsResponse.value || []).map((ws: any) => ws.name).join(', ')
      throw new Error(`Worksheet "${sheetName}" not found. Available sheets: ${available}`)
    }

    const usedRange = await client
      .api(`${workbookPath}/worksheets/${worksheet.id}/usedRange(valuesOnly=true)`)
      .header('workbook-session-id', sessionId)
      .get()

    return usedRange?.values || []
  } finally {
    try {
      await client.api(`${workbookPath}/closeSession`).post({ id: sessionId })
    } catch {
      // ignore session close errors
    }
  }
}

/**
 * Read a sheet into header-keyed row objects. The first non-empty row is
 * treated as the header row. Empty rows are skipped.
 */
export async function readWorkbookSheet(ref: WorkbookRef, sheetName: string): Promise<SheetData> {
  const values = await readWorkbookSheetRaw(ref, sheetName)
  if (values.length === 0) {
    return { headers: [], rows: [] }
  }

  // Find the header row: first row with at least 2 non-empty cells
  let headerRowIndex = 0
  for (let i = 0; i < Math.min(values.length, 10); i++) {
    const nonEmpty = (values[i] || []).filter(
      (c) => c !== null && c !== undefined && String(c).trim().length > 0
    )
    if (nonEmpty.length >= 2) {
      headerRowIndex = i
      break
    }
  }

  const headers = (values[headerRowIndex] || []).map((h: any) => (h ?? '').toString().trim())
  const rows: Record<string, string | number | boolean | null>[] = []

  for (let i = headerRowIndex + 1; i < values.length; i++) {
    const rowData = values[i] || []
    const hasData = rowData.some((cell: any) => {
      if (cell === null || cell === undefined) return false
      return String(cell).trim().length > 0
    })
    if (!hasData) continue

    const row: Record<string, string | number | boolean | null> = {}
    for (let j = 0; j < headers.length; j++) {
      if (!headers[j]) continue
      const value = rowData[j]
      row[headers[j]] = value !== undefined && value !== null ? value : null
    }
    rows.push(row)
  }

  return { headers: headers.filter(Boolean), rows }
}

/**
 * Excel serial date or string → ISO date (YYYY-MM-DD), or null.
 * Graph returns dates as serial numbers when the cell is date-formatted.
 */
export function excelValueToIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
    // Excel epoch: Dec 30, 1899 (accounting for the 1900 leap-year bug)
    const ms = Math.round((value - 25569) * 86400 * 1000)
    const d = new Date(ms)
    return d.toISOString().slice(0, 10)
  }
  const str = String(value).trim()
  if (!str) return null
  const parsed = new Date(str)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}
