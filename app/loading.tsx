export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="text-center">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 mb-4" />
        <p className="text-gray-600 font-medium">Loading...</p>
      </div>
    </div>
  )
}
