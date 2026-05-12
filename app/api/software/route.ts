import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    
    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10) // 50 items per page by default
    
    // Fetch all software records in batches (Supabase has limits and timeout issues with nested selects)
    // Strategy: Fetch software records first (fast), then fetch device relationships separately
    const batchSize = 1000
    let allSoftware: any[] = []
    let offset = 0
    let hasMore = true
    const maxBatches = 100

    let batchCount = 0
    while (hasMore && batchCount < maxBatches) {
      // First fetch just software records (no nested relationships - much faster)
      const { data: batch, error } = await supabase
        .from('software')
        .select('*')
        .order('id', { ascending: true })
        .range(offset, offset + batchSize - 1)

      if (error) {
        throw error
      }

      if (batch && batch.length > 0) {
        allSoftware = allSoftware.concat(batch)
        offset += batch.length
        hasMore = batch.length === batchSize
      } else {
        hasMore = false
      }
      
      batchCount++
    }

    if (batchCount >= maxBatches) {
      console.warn(`Reached maximum batch limit (${maxBatches}). There may be more records.`)
    }

    const softwareIds = allSoftware.map(s => s.id)
    const deviceSoftwareMap = new Map<string, any[]>()
    
    // Fetch device_software in smaller batches (Supabase has limits on .in() clause size)
    const relationshipBatchSize = 100 // Reduced from 500 to avoid "Bad Request" errors
    for (let i = 0; i < softwareIds.length; i += relationshipBatchSize) {
      const batchIds = softwareIds.slice(i, i + relationshipBatchSize)
      
      const { data: deviceSoftware, error: dsError } = await supabase
        .from('device_software')
        .select(`
          software_id,
          install_date,
          device:devices(
            id,
            device_name,
            device_type,
            employee:employees(id, display_name, email, first_name, last_name),
            manufacturer,
            model,
            os_name,
            os_version
          )
        `)
        .in('software_id', batchIds)

      if (dsError) {
        // Continue even if some batches fail
      } else if (deviceSoftware) {
        // Group by software_id
        deviceSoftware.forEach((ds: any) => {
          if (!deviceSoftwareMap.has(ds.software_id)) {
            deviceSoftwareMap.set(ds.software_id, [])
          }
          deviceSoftwareMap.get(ds.software_id)!.push(ds)
        })
      }
    }
    
    allSoftware.forEach((sw: any) => {
      sw.device_software = deviceSoftwareMap.get(sw.id) || []
    })
    
    if (!allSoftware || allSoftware.length === 0) {
      return NextResponse.json({ 
        software: [],
        pagination: {
          page: 1,
          limit,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false
        }
      })
    }
    
    const software = allSoftware

    // Extract base software name by removing version numbers and edition info
    // Examples: "7-Zip 24.01 (x64)" → "7-Zip", "Chrome 120.0 x64" → "Chrome"
    const extractBaseName = (name: string): string => {
      if (!name) return ''
      
      return name
        // Remove version patterns: "v1.0", "24.01", "120.0", "1.2.3"
        .replace(/\s*v?\d+\.\d+(\.\d+)*/gi, '')
        // Remove edition info in parentheses: "(x64)", "(x86)", "(64-bit)", etc.
        .replace(/\s*\([^)]*(?:x64|x86|64.?bit|32.?bit|amd64|arm64)[^)]*\)/gi, '')
        // Remove standalone edition info: " x64", " x86", " 64-bit", etc.
        .replace(/\s+(?:x64|x86|64.?bit|32.?bit|amd64|arm64)(?:\s|$)/gi, ' ')
        // Remove leading/trailing spaces and clean up
        .trim()
        // Remove multiple spaces
        .replace(/\s+/g, ' ')
    }

    // Normalize software name for grouping (handle variations)
    // This ensures "7-Zip", "7 Zip", "7zip", "7_zip" all group together
    const normalizeName = (name: string): string => {
      const baseName = extractBaseName(name)
      return baseName
        .toLowerCase()
        .trim()
        // Replace all spaces, hyphens, underscores, and other separators with nothing
        .replace(/[\s\-_\.]+/g, '')
        // Remove any remaining special characters except alphanumeric
        .replace(/[^\w]/g, '')
        .trim()
    }

    // Extract and normalize edition from text (handles "x64 edition", "x64", "(x64 edition)", etc.)
    const normalizeEdition = (text: string): string | null => {
      // Extract architecture from parentheses or standalone
      const editionPattern = /(?:\([^)]*(?:x64|x86|64.?bit|32.?bit|amd64|arm64)[^)]*\))|(?:\b(?:x64|x86|64.?bit|32.?bit|amd64|arm64)\b)/i
      const editionMatch = text.match(editionPattern)
      
      if (editionMatch) {
        // Extract just the architecture identifier, ignoring words like "edition"
        const archMatch = editionMatch[0].match(/\b(x64|x86|64.?bit|32.?bit|amd64|arm64)\b/i)
        if (archMatch) {
          let arch = archMatch[1].toLowerCase()
          // Normalize to common format
          if (arch.match(/64.?bit/i)) arch = 'x64'
          if (arch.match(/32.?bit/i)) arch = 'x86'
          return `(${arch})`
        }
      }
      return null
    }

    // Extract version info from name (includes edition info if present)
    // Combines version field with any version/edition info in the name
    // Normalizes editions so "(x64 edition)" and "(x64)" are treated the same
    const extractVersionInfo = (name: string, version: string | null): string => {
      const versionParts: string[] = []
      
      // Extract version number from name if present (e.g., "24.01", "v1.0", "120.0.1")
      const versionMatch = name.match(/v?(\d+\.\d+(?:\.\d+)*)/i)
      if (versionMatch && versionMatch[1]) {
        versionParts.push(versionMatch[1])
      } else if (version) {
        // Remove edition from version field if present before adding
        const versionWithoutEdition = version.replace(/\([^)]*(?:x64|x86|64.?bit|32.?bit|amd64|arm64)[^)]*\)/gi, '').trim()
        if (versionWithoutEdition) {
          versionParts.push(versionWithoutEdition)
        }
      }
      
      // Extract and normalize edition from name
      const normalizedEdition = normalizeEdition(name)
      if (normalizedEdition) {
        versionParts.push(normalizedEdition)
      } else if (version) {
        // Try extracting edition from version field as fallback
        const editionFromVersion = normalizeEdition(version)
        if (editionFromVersion) {
          versionParts.push(editionFromVersion)
        }
      }
      
      if (versionParts.length === 0) {
        return version || '(no version)'
      }
      
      return versionParts.join(' ')
    }

    // Group software by normalized name and aggregate versions
    const softwareMap = new Map<string, any>()
    let processedCount = 0
    
    software?.forEach((sw: any) => {
      processedCount++
      const normalizedKey = normalizeName(sw.name || '')
      const baseDisplayName = extractBaseName(sw.name || '') || sw.name
      
      if (!softwareMap.has(normalizedKey)) {
        // Use the base name (without version/edition) for display
        softwareMap.set(normalizedKey, {
          name: baseDisplayName, // Clean base name for display
          publisher: sw.publisher,
          versions: new Map<string, any>()
        })
      }
      
      const swEntry = softwareMap.get(normalizedKey)!
      // Extract version info from both name and version field
      const fullVersion = extractVersionInfo(sw.name || '', sw.version)
      const versionKey = fullVersion.trim() || '(no version)'
      
      if (!swEntry.versions.has(versionKey)) {
        swEntry.versions.set(versionKey, {
          version: fullVersion,
          devices: [] as any[]
        })
      }
      
      // Add devices to this version
      if (sw.device_software && sw.device_software.length > 0) {
        sw.device_software.forEach((ds: any) => {
          swEntry.versions.get(versionKey)!.devices.push({
            device: ds.device,
            install_date: ds.install_date
          })
        })
      }
    })

    const compareVersionStrings = (a: string | null, b: string | null) => {
      const parseVersion = (version: string | null) => {
        if (!version || version === '(no version)') {
          return {
            hasNumber: false,
            segments: [] as number[],
            original: version || ''
          }
        }

        const numericMatch = version.match(/\d+(?:\.\d+)*/g)
        const segments = numericMatch
          ? numericMatch[0].split('.').map((segment) => parseInt(segment, 10))
          : []

        return {
          hasNumber: numericMatch !== null,
          segments,
          original: version
        }
      }

      const va = parseVersion(a)
      const vb = parseVersion(b)

      if (va.hasNumber && vb.hasNumber) {
        const maxLength = Math.max(va.segments.length, vb.segments.length)
        for (let i = 0; i < maxLength; i++) {
          const segmentA = va.segments[i] || 0
          const segmentB = vb.segments[i] || 0
          if (segmentA !== segmentB) {
            return segmentA - segmentB
          }
        }
        // If numeric parts are equal, fall back to edition text (e.g., x64 vs x86)
        return (a || '').localeCompare(b || '')
      }

      if (va.hasNumber && !vb.hasNumber) return -1
      if (!va.hasNumber && vb.hasNumber) return 1

      return (a || '').localeCompare(b || '')
    }

    // Convert to array format
    const groupedSoftware = Array.from(softwareMap.values()).map(sw => ({
      name: sw.name,
      publisher: sw.publisher,
      versions: Array.from(sw.versions.values()).map((v: any) => ({
        version: v.version,
        deviceCount: v.devices.length,
        devices: v.devices
      }))
    }))

    // Sort versions from least to greatest
    groupedSoftware.forEach(sw => {
      sw.versions.sort((a, b) => compareVersionStrings(a.version, b.version))
    })

    // Filter out software with 0 devices (since all software comes from devices)
    const softwareWithDevices = groupedSoftware.filter(sw => {
      const totalDevices = sw.versions.reduce((sum, v) => sum + v.deviceCount, 0)
      return totalDevices > 0
    })

    // Sort software by name
    softwareWithDevices.sort((a, b) => a.name.localeCompare(b.name))

    // Calculate pagination (using filtered software)
    const totalItems = softwareWithDevices.length
    const totalPages = Math.ceil(totalItems / limit)
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedSoftware = softwareWithDevices.slice(startIndex, endIndex)

    return NextResponse.json({ 
      software: paginatedSoftware,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    })
  } catch (error: any) {
    console.error('Error fetching software:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch software' },
      { status: 500 }
    )
  }
}

