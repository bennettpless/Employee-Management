import Link from 'next/link'
import { ArrowLeft, AlertTriangle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function ResponseAgentPage() {
  const agentUrl = process.env.IT_RESPONSE_AGENT_URL
  const agentApiKey = process.env.IT_RESPONSE_AGENT_API_KEY

  if (!agentUrl || !agentApiKey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="container mx-auto px-4 py-8">
          <Link
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <div className="bg-white rounded-lg shadow-md p-8 max-w-2xl mx-auto border-l-4 border-amber-500">
            <div className="flex items-start">
              <AlertTriangle className="w-6 h-6 text-amber-500 mr-3 flex-shrink-0 mt-1" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  IT Response Agent not configured
                </h2>
                <p className="text-gray-600 mb-4">
                  The IT Response Agent integration requires the following
                  environment variables to be set:
                </p>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 mb-4">
                  <li><code className="bg-gray-100 px-1 rounded">IT_RESPONSE_AGENT_URL</code></li>
                  <li><code className="bg-gray-100 px-1 rounded">IT_RESPONSE_AGENT_API_KEY</code></li>
                </ul>
                <p className="text-sm text-gray-600">
                  See <code className="bg-gray-100 px-1 rounded">docs/employee-management-system/11-it-response-agent.md</code>{' '}
                  for setup details.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const baseUrl = agentUrl.replace(/\/$/, '')
  const iframeSrc = `${baseUrl}/review.html?key=${encodeURIComponent(agentApiKey)}`

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Home
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">
            IT Response Agent
          </h1>
        </div>
      </div>
      <iframe
        src={iframeSrc}
        title="IT Response Agent Review Dashboard"
        className="flex-1 w-full border-0 min-h-[calc(100vh-105px)]"
      />
    </div>
  )
}
