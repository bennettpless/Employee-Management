import { getGraphClient } from './azure-graph'

// Excel file configuration
const EXCEL_FILE_NAME = 'BP Employee list and inventory.xlsx'
const EXCEL_SHEET_NAME = 'Master Updated Test'

// SharePoint site and file path - these will need to be configured
// Format: /sites/{site-name}/drive/root:/{folder-path}/{filename}
// Or: /sites/{site-name}/drive/items/{item-id}
const SHAREPOINT_SITE_PATH = process.env.SHAREPOINT_SITE_PATH || ''
const SHAREPOINT_FILE_PATH = process.env.SHAREPOINT_FILE_PATH || ''

/**
 * Get the site ID by resolving the site path
 */
async function getSiteId(client: any): Promise<string> {
  let sitePath = process.env.SHAREPOINT_SITE_PATH || SHAREPOINT_SITE_PATH
  
  // If sitePath is already a site ID (UUID format), return it
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sitePath)) {
    return sitePath
  }
  
  // Normalize site path - handle different formats
  let normalizedPath = sitePath
  
  // Remove leading /sites/ if present (we'll add it back)
  if (normalizedPath.startsWith('/sites/')) {
    normalizedPath = normalizedPath.slice(7) // Remove '/sites/'
  }
  
  // Now normalizedPath should be in format: hostname:/sites/sitename or just sitename
  console.log(`Resolving site with normalized path: "${normalizedPath}"`)
  
  try {
    // Try to get the site using the normalized path
    // Format: /sites/{hostname}:/sites/{sitename}
    const siteResponse = await client
      .api(`/sites/${normalizedPath}`)
      .get()
    
    console.log(`Successfully resolved site, ID: ${siteResponse.id}`)
    return siteResponse.id
  } catch (error: any) {
    // If that fails, try alternative formats
    console.log(`Failed to get site with path "${normalizedPath}", trying alternatives...`)
    console.log(`Error: ${error.message}`)
    
    // Try extracting hostname and sitename from format: hostname:/sites/sitename
    const match = normalizedPath.match(/^([^:]+):\/sites\/(.+)$/)
    if (match) {
      const hostname = match[1]
      const sitename = match[2]
      console.log(`Trying with extracted hostname: "${hostname}", sitename: "${sitename}"`)
      try {
        const siteResponse = await client
          .api(`/sites/${hostname}:/sites/${sitename}`)
          .get()
        console.log(`Successfully resolved site with alternative format, ID: ${siteResponse.id}`)
        return siteResponse.id
      } catch (e: any) {
        console.log(`Alternative format also failed: ${e.message}`)
      }
    }
    
    throw new Error(`Failed to resolve SharePoint site. Path: "${sitePath}", Normalized: "${normalizedPath}", Error: ${error.message}`)
  }
}

/**
 * Get the site path using site ID
 */
async function getSitePath(client: any): Promise<string> {
  const siteId = await getSiteId(client)
  return `/sites/${siteId}`
}

/**
 * Get the file path, normalized and URL encoded
 */
function getNormalizedFilePath(): string {
  const filePath = process.env.SHAREPOINT_FILE_PATH || SHAREPOINT_FILE_PATH
  
  // Build the file path - handle file path with or without leading slash
  let normalizedFilePath = filePath
  if (normalizedFilePath && !normalizedFilePath.startsWith('/')) {
    normalizedFilePath = '/' + normalizedFilePath
  }
  // Remove trailing slash if present
  if (normalizedFilePath.endsWith('/')) {
    normalizedFilePath = normalizedFilePath.slice(0, -1)
  }
  
  // URL encode the file path parts for spaces and special characters
  return normalizedFilePath.split('/').map(part => encodeURIComponent(part)).join('/')
}

/**
 * Find the Excel file and get its item ID using search (the working method)
 */
async function findExcelFileItemId(client: any): Promise<string> {
  const sitePath = await getSitePath(client)
  
  // Use the search endpoint which successfully found the file
  console.log(`Searching for file: ${EXCEL_FILE_NAME}`)
  const searchResults = await client
    .api(`${sitePath}/drive/root/search(q='${encodeURIComponent(EXCEL_FILE_NAME)}')`)
    .get()
  
  if (searchResults.value && searchResults.value.length > 0) {
    // Find the file that matches our name exactly
    const matchingFile = searchResults.value.find((file: any) => 
      file.name === EXCEL_FILE_NAME
    )
    if (matchingFile) {
      console.log(`Found file via search with ID: ${matchingFile.id}`)
      return matchingFile.id
    }
    // If no exact match, use the first result
    console.log(`Using first search result with ID: ${searchResults.value[0].id}`)
    return searchResults.value[0].id
  }
  
  throw new Error(`Excel file "${EXCEL_FILE_NAME}" not found in SharePoint`)
}

/**
 * Helper function to build the workbook path using item ID
 */
async function getWorkbookPath(client: any): Promise<string> {
  const sitePath = await getSitePath(client)
  const itemId = await findExcelFileItemId(client)
  
  return `${sitePath}/drive/items/${itemId}/workbook`
}

function getColumnLetter(colIndex: number): string {
  let result = ''
  let index = colIndex
  while (index >= 0) {
    result = String.fromCharCode(65 + (index % 26)) + result
    index = Math.floor(index / 26) - 1
  }
  return result
}

// Excel column mapping
export const EXCEL_COLUMNS = {
  // Identifier (immutable)
  EMPLOYEE_ID: 'ID',
  
  // Basic Info
  FIRST_LAST: 'First, Last',
  LAST_FIRST: 'Last, First',
  FIRST_NAME: 'First Name',
  LAST_NAME: 'Last Name',
  NICK_NAME: 'Nick Name',
  USERNAME: 'Username',
  EMAIL_ADDRESS: 'Email Address',
  DUPLICATE_USER_EMAIL: 'Duplicate User Email',
  PHONE_NUMBER: 'Phone Number',
  EXTENSION: 'Extension',
  
  // Organization
  BRANCH_NAME: 'Branch Name',
  OFFICE_LOCATION: 'Office Location',
  TYPE: 'Type',
  TITLE: 'Title',
  DEPARTMENT: 'Department',
  SUPERVISOR: 'Supervisor',
  DPT_MANAGER: 'DPT. Manager',
  
  // Devices
  PC_NAMES_ACTIVE_ENROLLED: 'PC Names Active / Enrolled',
  PC_TYPE: 'PC Type',
  POTENTIAL_UNUSED_DEVICE_AMOUNT: 'Potential unused / Not Enrolled Device Amount',
  POTENTIAL_UNUSED_DEVICES_DATE: 'Potential unused / Not Enrolled Devices (Date)',
  
  // Services
  ENROLLED_IN_INTUNE: 'Enrolled in Intune',
  NINJA_END_USER_REMOTE_ACCESS: 'Ninja End User Remote Access',
  OFFICE_365_MFA: 'Office 365 MFA',
  
  // Software Licenses
  AUTOCAD: 'Autocad',
  AUTOCAD_LT: 'Autocad LT',
  AEC: 'AEC',
  BIM: 'BIM',
  BENTLEY: 'Bentley',
  HILTI: 'Hilti',
  SOFTRACK: 'Softrack',
  RISA: 'RISA',
  LUCID: 'Lucid',
  TEKLA_TEDDS: 'Tekla Tedds',
  TEKLA_STRUCTURAL_DESIGNER: 'Tekla Structural Designer',
  TEKLA_STRUCTURAL_DESIGNER_SUITE: 'Tekla Structural Designer Suite',
  ETABS: 'eTABS',
} as const

export interface ExcelRow {
  [key: string]: string | number | boolean | null | undefined
}

/**
 * Read all rows from the Excel sheet
 */
export async function readExcelSheet(): Promise<ExcelRow[]> {
  const client = await getGraphClient()
  
  // Read environment variables at runtime to ensure they're fresh
  const sitePath = process.env.SHAREPOINT_SITE_PATH || ''
  const filePath = process.env.SHAREPOINT_FILE_PATH || ''
  
  if (!sitePath || !filePath) {
    console.error('Environment variables check:', {
      SHAREPOINT_SITE_PATH: sitePath || 'NOT SET',
      SHAREPOINT_FILE_PATH: filePath || 'NOT SET',
      allEnvKeys: Object.keys(process.env).filter(k => k.includes('SHAREPOINT'))
    })
    throw new Error('SHAREPOINT_SITE_PATH and SHAREPOINT_FILE_PATH must be configured in environment variables. Please restart your dev server after adding them to .env.local')
  }
  
  try {
    // Use Microsoft Graph API to read Excel workbook
    // First, find the file and get its item ID, then build the workbook path
    const workbookPath = await getWorkbookPath(client)
    
    console.log('Attempting to access workbook at:', workbookPath)
    
    // Create a session for the workbook
    const sessionResponse = await client
      .api(`${workbookPath}/createSession`)
      .post({
        persistChanges: false
      })
    
    const sessionId = sessionResponse.id
    
    try {
      // Get the worksheet
      const worksheetsResponse = await client
        .api(`${workbookPath}/worksheets`)
        .header('workbook-session-id', sessionId)
        .get()
      
      // Find the target worksheet
      const worksheet = worksheetsResponse.value.find((ws: any) => ws.name === EXCEL_SHEET_NAME)
      
      if (!worksheet) {
        throw new Error(`Worksheet "${EXCEL_SHEET_NAME}" not found`)
      }
      
      // Get used range to determine data bounds
      const usedRangeResponse = await client
        .api(`${workbookPath}/worksheets/${worksheet.id}/usedRange`)
        .header('workbook-session-id', sessionId)
        .get()
      
      if (!usedRangeResponse.address) {
        console.log('[readExcelSheet] No usedRange found, sheet appears empty')
        return [] // Empty sheet
      }
      
      // Get all values from the used range first (this is reliable)
      const valuesResponse = await client
        .api(`${workbookPath}/worksheets/${worksheet.id}/usedRange`)
        .header('workbook-session-id', sessionId)
        .get()
      
      const values = valuesResponse.values as any[][]
      
      if (!values || values.length === 0) {
        console.log('[readExcelSheet] No values found in usedRange')
        return []
      }
      
      // First row is headers
      const headers = values[0] as string[]
      
      if (!headers || headers.length === 0) {
        console.log('[readExcelSheet] No headers found')
        return []
      }
      
      console.log(`[readExcelSheet] Found ${values.length} rows in usedRange (${headers.length} columns)`)
      
      // Find the ID column index
      const idColumnIndex = headers.findIndex(h => h?.toString().trim() === 'ID')
      const usedRangeRowCount = values.length
      let maxIdNumber = 0
      
      // If ID column exists, find the largest ID number from usedRange data
      if (idColumnIndex >= 0) {
        for (let i = 1; i < values.length; i++) {
          const rowData = values[i] || []
          const idCell = rowData[idColumnIndex]
          if (idCell !== null && idCell !== undefined) {
            const idStr = String(idCell).trim()
            // Remove leading zeros and convert to number
            const idNum = parseInt(idStr.replace(/^0+/, '') || '0', 10)
            if (idNum > maxIdNumber) {
              maxIdNumber = idNum
            }
          }
        }
        console.log(`[readExcelSheet] Largest ID found in usedRange: ${maxIdNumber} (usedRange has ${usedRangeRowCount} rows)`)
      }
      
      let allValues = values
      
      // If the largest ID is larger than the number of rows found, or if usedRange is missing rows,
      // scan additional rows based on the largest ID + buffer
      if (maxIdNumber > 0 && (maxIdNumber > usedRangeRowCount || usedRangeRowCount < values.length)) {
        // Add buffer: scan up to largest ID + 50 rows, or minimum 100 rows beyond usedRange
        const targetRows = Math.max(maxIdNumber + 50, usedRangeRowCount + 100, 1000)
        const lastColumn = getColumnLetter(headers.length - 1)
        const extendedRangeAddress = `A1:${lastColumn}${targetRows}`
        
        console.log(`[readExcelSheet] Largest ID (${maxIdNumber}) suggests more rows exist. Reading extended range: ${extendedRangeAddress}`)
        
        // Try to read the extended range to catch manually added rows
        try {
          const extendedValuesResponse = await client
            .api(`${workbookPath}/worksheets/${worksheet.id}/range(address='${extendedRangeAddress}')`)
            .header('workbook-session-id', sessionId)
            .get()
          
          if (extendedValuesResponse.values && extendedValuesResponse.values.length > values.length) {
            console.log(`[readExcelSheet] Extended range found ${extendedValuesResponse.values.length} rows (vs ${values.length} in usedRange)`)
            allValues = extendedValuesResponse.values as any[][]
            
            // Re-check for largest ID in extended range to ensure we got everything
            let newMaxId = maxIdNumber
            for (let i = 1; i < allValues.length; i++) {
              const rowData = allValues[i] || []
              const idCell = rowData[idColumnIndex]
              if (idCell !== null && idCell !== undefined) {
                const idStr = String(idCell).trim()
                const idNum = parseInt(idStr.replace(/^0+/, '') || '0', 10)
                if (idNum > newMaxId) {
                  newMaxId = idNum
                }
              }
            }
            
            // If we found a larger ID, read even more rows
            if (newMaxId > maxIdNumber && newMaxId + 50 > allValues.length) {
              const finalTargetRows = newMaxId + 50
              const finalRangeAddress = `A1:${lastColumn}${finalTargetRows}`
              console.log(`[readExcelSheet] Found larger ID (${newMaxId}) in extended range. Reading final range: ${finalRangeAddress}`)
              
              try {
                const finalValuesResponse = await client
                  .api(`${workbookPath}/worksheets/${worksheet.id}/range(address='${finalRangeAddress}')`)
                  .header('workbook-session-id', sessionId)
                  .get()
                
                if (finalValuesResponse.values && finalValuesResponse.values.length > allValues.length) {
                  console.log(`[readExcelSheet] Final range found ${finalValuesResponse.values.length} rows`)
                  allValues = finalValuesResponse.values as any[][]
                }
              } catch (finalRangeError: any) {
                console.warn(`[readExcelSheet] Could not read final range: ${finalRangeError.message}`)
              }
            }
          } else {
            console.log(`[readExcelSheet] Extended range returned same or fewer rows, using usedRange data`)
          }
        } catch (extendedRangeError: any) {
          console.warn(`[readExcelSheet] Could not read extended range, using usedRange data: ${extendedRangeError.message}`)
          // Continue with usedRange data
        }
      } else {
        console.log(`[readExcelSheet] Using usedRange data (largest ID: ${maxIdNumber}, rows: ${usedRangeRowCount})`)
      }
      
      // Convert rows to objects
      const rows: ExcelRow[] = []
      
      // Start from index 1 (skip header row)
      for (let i = 1; i < allValues.length; i++) {
        const rowData = allValues[i] || []
        
        // Check if row has any non-null, non-empty values (in any column)
        const hasData = rowData.some((cell: any) => {
          if (cell === null || cell === undefined) return false
          const str = String(cell).trim()
          return str.length > 0
        })
        
        if (!hasData) {
          // Empty row - skip it but continue checking (there might be data further down)
          // Only stop if we've passed the usedRange count and found an empty row
          if (i > usedRangeRowCount + 10) {
            // After usedRange + buffer, if we find an empty row, likely no more data
            break
          }
          continue
        }
        
        // Convert row to object
        const row: ExcelRow = {}
        for (let j = 0; j < headers.length; j++) {
          const header = headers[j]?.toString().trim() || ''
          const value = rowData[j]
          row[header] = value !== undefined && value !== null ? value : null
        }
        rows.push(row)
      }
      
      console.log(`[readExcelSheet] Returning ${rows.length} data rows from Excel`)
      
      return rows
    } finally {
      // Close the session
      try {
        await client
          .api(`${workbookPath}/closeSession`)
          .post({
            id: sessionId
          })
      } catch (error) {
        // Ignore errors when closing session
      }
    }
  } catch (error: any) {
    // Provide more helpful error messages
    if (error.message?.includes('Invalid hostname') || error.message?.includes('hostname')) {
      const sitePath = process.env.SHAREPOINT_SITE_PATH || ''
      throw new Error(`Failed to read Excel sheet: Invalid SharePoint site path format. The site path "${sitePath}" may be incorrect. Microsoft Graph API requires the format: /sites/{hostname}:/sites/{site-name} (e.g., /sites/yourcompany.sharepoint.com:/sites/BPITExternalTeam). Original error: ${error.message}`)
    }
    throw new Error(`Failed to read Excel sheet: ${error.message}`)
  }
}

/**
 * Update a row in the Excel sheet
 */
export async function updateExcelRow(rowIndex: number, data: Partial<ExcelRow>): Promise<void> {
  const client = await getGraphClient()
  
  // Read environment variables at runtime
  const sitePath = process.env.SHAREPOINT_SITE_PATH || ''
  const filePath = process.env.SHAREPOINT_FILE_PATH || ''
  
  if (!sitePath || !filePath) {
    throw new Error('SHAREPOINT_SITE_PATH and SHAREPOINT_FILE_PATH must be configured in environment variables. Please restart your dev server after adding them to .env.local')
  }
  
  try {
    const workbookPath = await getWorkbookPath(client)
    
    // Create a session for the workbook (with persistChanges: true for writing)
    const sessionResponse = await client
      .api(`${workbookPath}/createSession`)
      .post({
        persistChanges: true
      })
    
    const sessionId = sessionResponse.id
    
    try {
      // Get the worksheet
      const worksheetsResponse = await client
        .api(`${workbookPath}/worksheets`)
        .header('workbook-session-id', sessionId)
        .get()
      
      const worksheet = worksheetsResponse.value.find((ws: any) => ws.name === EXCEL_SHEET_NAME)
      
      if (!worksheet) {
        throw new Error(`Worksheet "${EXCEL_SHEET_NAME}" not found`)
      }
      
      // Get headers to map column names to indices
      const usedRangeResponse = await client
        .api(`${workbookPath}/worksheets/${worksheet.id}/usedRange`)
        .header('workbook-session-id', sessionId)
        .get()
      
      const values = usedRangeResponse.values as any[][]
      const headers = values[0] as string[]
      
      // Build update data with column indices
      const updates: Array<{ column: number; value: any }> = []
      
      for (const [columnName, value] of Object.entries(data)) {
        // Try multiple matching strategies
        let columnIndex = -1
        
        // Strategy 1: Exact match
        columnIndex = headers.findIndex(h => h?.toString() === columnName)
        
        // Strategy 2: Trimmed match (both sides)
        if (columnIndex < 0) {
          columnIndex = headers.findIndex(h => {
            const headerStr = (h?.toString() || '').trim()
            const columnStr = columnName.trim()
            return headerStr === columnStr
          })
        }
        
        // Strategy 3: Normalized whitespace match (for cases like "Last , First" vs "Last, First")
        if (columnIndex < 0) {
          columnIndex = headers.findIndex(h => {
            const headerStr = (h?.toString() || '').trim().replace(/\s+/g, ' ').trim()
            const columnStr = columnName.trim().replace(/\s+/g, ' ').trim()
            return headerStr === columnStr
          })
        }
        
        // Strategy 4: Case-insensitive match
        if (columnIndex < 0) {
          columnIndex = headers.findIndex(h => {
            const headerStr = (h?.toString() || '').trim().toLowerCase()
            const columnStr = columnName.trim().toLowerCase()
            return headerStr === columnStr
          })
        }
        
        if (columnIndex >= 0) {
          console.log(`[updateExcelRow] Found column "${columnName}" at index ${columnIndex} (header: "${headers[columnIndex]}")`)
          updates.push({ column: columnIndex, value })
        } else {
          console.warn(`[updateExcelRow] Column "${columnName}" not found in headers. Available headers: ${headers.slice(0, 15).join(', ')}...`)
          // Log all headers for debugging
          console.log(`[updateExcelRow] All headers:`, headers.map((h, i) => `${i}: "${h}"`).slice(0, 20))
        }
      }
      
      for (const update of updates) {
        const cellAddress = `${getColumnLetter(update.column)}${rowIndex + 1}`
        const columnName = headers[update.column]
        
        console.log(`[updateExcelRow] Updating cell ${cellAddress} (column: "${columnName}") with value: "${update.value}"`)
        
        await client
          .api(`${workbookPath}/worksheets/${worksheet.id}/range(address='${cellAddress}')`)
          .header('workbook-session-id', sessionId)
          .patch({
            values: [[update.value]]
          })
        
        console.log(`[updateExcelRow] ✅ Successfully updated ${cellAddress}`)
      }
    } finally {
      // Close the session (this will save changes)
      try {
        await client
          .api(`${workbookPath}/closeSession`)
          .post({
            id: sessionId
          })
      } catch (error) {
        // Ignore errors when closing session
      }
    }
  } catch (error: any) {
    throw new Error(`Failed to update Excel row: ${error.message}`)
  }
}

/**
 * Add a new row to the Excel sheet
 */
export async function addExcelRow(data: ExcelRow): Promise<void> {
  const client = await getGraphClient()
  
  // Read environment variables at runtime
  const sitePath = process.env.SHAREPOINT_SITE_PATH || ''
  const filePath = process.env.SHAREPOINT_FILE_PATH || ''
  
  if (!sitePath || !filePath) {
    throw new Error('SHAREPOINT_SITE_PATH and SHAREPOINT_FILE_PATH must be configured in environment variables. Please restart your dev server after adding them to .env.local')
  }
  
  try {
    const workbookPath = await getWorkbookPath(client)
    
    const sessionResponse = await client
      .api(`${workbookPath}/createSession`)
      .post({
        persistChanges: true
      })
    
    const sessionId = sessionResponse.id
    
    try {
      const worksheetsResponse = await client
        .api(`${workbookPath}/worksheets`)
        .header('workbook-session-id', sessionId)
        .get()
      
      const worksheet = worksheetsResponse.value.find((ws: any) => ws.name === EXCEL_SHEET_NAME)
      
      if (!worksheet) {
        throw new Error(`Worksheet "${EXCEL_SHEET_NAME}" not found`)
      }
      
      // Get headers and current row count
      const usedRangeResponse = await client
        .api(`${workbookPath}/worksheets/${worksheet.id}/usedRange`)
        .header('workbook-session-id', sessionId)
        .get()
      
      const values = usedRangeResponse.values as any[][]
      const headers = values[0] as string[]
      const nextRowIndex = values.length + 1
      
      // Build row array matching header order
      const rowValues: any[] = []
      for (const header of headers) {
        const headerName = header?.toString().trim() || ''
        rowValues.push(data[headerName] ?? null)
      }
      
      const lastColumnLetter = getColumnLetter(headers.length - 1)
      const rangeAddress = `A${nextRowIndex}:${lastColumnLetter}${nextRowIndex}`
      
      await client
        .api(`${workbookPath}/worksheets/${worksheet.id}/range(address='${rangeAddress}')`)
        .header('workbook-session-id', sessionId)
        .patch({
          values: [rowValues]
        })
    } finally {
      try {
        await client
          .api(`${workbookPath}/closeSession`)
          .post({
            id: sessionId
          })
      } catch (error) {
        // Ignore errors
      }
    }
  } catch (error: any) {
    throw new Error(`Failed to add Excel row: ${error.message}`)
  }
}

/**
 * Delete a row from the Excel sheet
 */
export async function deleteExcelRow(rowIndex: number): Promise<void> {
  const client = await getGraphClient()
  
  // Read environment variables at runtime
  const sitePath = process.env.SHAREPOINT_SITE_PATH || ''
  const filePath = process.env.SHAREPOINT_FILE_PATH || ''
  
  if (!sitePath || !filePath) {
    throw new Error('SHAREPOINT_SITE_PATH and SHAREPOINT_FILE_PATH must be configured in environment variables. Please restart your dev server after adding them to .env.local')
  }
  
  try {
    const workbookPath = await getWorkbookPath(client)
    
    const sessionResponse = await client
      .api(`${workbookPath}/createSession`)
      .post({
        persistChanges: true
      })
    
    const sessionId = sessionResponse.id
    
    try {
      const worksheetsResponse = await client
        .api(`${workbookPath}/worksheets`)
        .header('workbook-session-id', sessionId)
        .get()
      
      const worksheet = worksheetsResponse.value.find((ws: any) => ws.name === EXCEL_SHEET_NAME)
      
      if (!worksheet) {
        throw new Error(`Worksheet "${EXCEL_SHEET_NAME}" not found`)
      }
      
      // Get used range to determine column count
      const usedRangeResponse = await client
        .api(`${workbookPath}/worksheets/${worksheet.id}/usedRange`)
        .header('workbook-session-id', sessionId)
        .get()
      
      const values = usedRangeResponse.values as any[][]
      const headers = values[0] as string[]
      const columnCount = headers.length
      
      const lastColumnLetter = getColumnLetter(columnCount - 1)
      const rangeAddress = `A${rowIndex + 1}:${lastColumnLetter}${rowIndex + 1}`
      
      await client
        .api(`${workbookPath}/worksheets/${worksheet.id}/range(address='${rangeAddress}')/delete`)
        .header('workbook-session-id', sessionId)
        .post({
          shift: 'Up'
        })
    } finally {
      try {
        await client
          .api(`${workbookPath}/closeSession`)
          .post({
            id: sessionId
          })
      } catch (error) {
        // Ignore errors
      }
    }
  } catch (error: any) {
    throw new Error(`Failed to delete Excel row: ${error.message}`)
  }
}

