import { NextResponse } from 'next/server'

/**
 * The Intune/Entra device sync is retired. The devices table is now an asset
 * inventory imported from the SharePoint "Device Inventory" sheet
 * (POST /api/devices/import-inventory).
 */
const gone = () =>
  NextResponse.json(
    { error: 'The Intune device sync has been disabled. Use the Device Inventory import on the Sync page instead.' },
    { status: 410 }
  )

export async function POST() {
  return gone()
}

export async function GET() {
  return gone()
}
