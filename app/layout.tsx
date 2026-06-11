import type { Metadata } from 'next'
import SessionWrapper from '@/components/SessionWrapper'
import AppHeader from '@/components/AppHeader'
import './globals.css'
import 'leaflet/dist/leaflet.css'
import '@xyflow/react/dist/style.css'

// Use system font to avoid startup hang from next/font/google fetch
const fontClass = 'font-sans'

export const metadata: Metadata = {
  title: 'Employee Management System',
  description: 'Employee management with SharePoint Excel, NinjaOne, and Supabase',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={fontClass}>
        <SessionWrapper>
          <AppHeader />
          {children}
        </SessionWrapper>
      </body>
    </html>
  )
}



