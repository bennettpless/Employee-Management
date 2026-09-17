import type { NextAuthOptions } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'
import { getRoleForEmail } from '@/lib/role-store'

const ALLOWED_DOMAINS = ['bennett-pless.com', 'bpl-enclosure.com']

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_CLIENT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
      tenantId: process.env.AZURE_TENANT_ID!,
      authorization: {
        params: {
          scope: 'openid profile email User.Read',
        },
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email ?? (profile as Record<string, unknown>)?.preferred_username as string | undefined
      if (!email) return false

      const domain = email.split('@')[1]?.toLowerCase()
      if (!ALLOWED_DOMAINS.includes(domain)) return false

      const role = await getRoleForEmail(email)
      return role === 'admin'
    },

    async jwt({ token, profile }) {
      if (profile) {
        const email = profile.email ?? (profile as Record<string, unknown>).preferred_username as string | undefined
        if (email) {
          token.email = email
          token.role = (await getRoleForEmail(email)) ?? undefined
        }
        token.name = profile.name ?? (profile as Record<string, unknown>).displayName as string | undefined
      } else if (token.email) {
        token.role = (await getRoleForEmail(token.email as string)) ?? undefined
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.role = token.role as 'admin' | 'accounting' | undefined
      }
      return session
    },
  },
}
