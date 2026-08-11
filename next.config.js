/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained production bundle for Azure App Service (run with `node server.js`)
  output: 'standalone',
  experimental: {
    instrumentationHook: true,
  },
  images: {
    domains: ['graph.microsoft.com'],
  },
  // Avoid dev server hang on Windows: disable webpack cache (fixes "stuck at Starting...")
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false
    }
    return config
  },
}

module.exports = nextConfig