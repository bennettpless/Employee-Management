'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShieldOff,
  Download,
  X,
} from 'lucide-react'
import {
  IMPORT_TARGET_FIELDS,
  REQUIRED_TARGET_FIELDS,
  TARGET_FIELD_LABEL,
  autoMapHeaders,
  type ImportColumnMap,
  type ImportError,
  type ImportTargetField,
} from '@/lib/network-import-shared'

const LOCAL_STORAGE_KEY = 'ems.network-import.columnMap.v1'

type WizardStep = 'upload' | 'map' | 'preview' | 'done'

interface ParsedResponse {
  headers: string[]
  rows: Record<string, string>[]
  totalRows: number
  filename: string
}

interface RowResult {
  rowNumber: number
  raw: Record<string, string>
  valid: boolean
  errors: ImportError[]
}

interface DryRunResponse {
  inserted: number
  skipped: number
  totalRows: number
  validCount: number
  errors: ImportError[]
  rowResults: RowResult[]
  dryRun: boolean
}

export default function NetworkImportWizard() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = role === 'admin'

  const [step, setStep] = useState<WizardStep>('upload')

  // Upload step
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedResponse | null>(null)

  // Map step
  const [columnMap, setColumnMap] = useState<ImportColumnMap>({})

  // Preview step
  const [validating, setValidating] = useState(false)
  const [previewResult, setPreviewResult] = useState<DryRunResponse | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Commit
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [commitResult, setCommitResult] = useState<DryRunResponse | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Load saved column map on parse
  useEffect(() => {
    if (!parsed) return
    let saved: ImportColumnMap | null = null
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
      if (raw) saved = JSON.parse(raw) as ImportColumnMap
    } catch {
      saved = null
    }

    const auto = autoMapHeaders(parsed.headers)
    const merged: ImportColumnMap = { ...auto }
    if (saved) {
      for (const target of IMPORT_TARGET_FIELDS) {
        const savedCol = saved[target]
        if (savedCol && parsed.headers.includes(savedCol)) {
          merged[target] = savedCol
        }
      }
    }
    setColumnMap(merged)
  }, [parsed])

  const handleFileSelect = (f: File | null) => {
    setFile(f)
    setUploadError(null)
    setParsed(null)
    setPreviewResult(null)
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/network/devices/import/parse', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setUploadError(data.error || 'Failed to parse file')
        return
      }
      setParsed(data)
      setStep('map')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) handleFileSelect(f)
  }

  const requiredMissing = REQUIRED_TARGET_FIELDS.filter(
    (t) => !columnMap[t]
  )

  const setMapping = (target: ImportTargetField, source: string | null) => {
    setColumnMap((prev) => ({ ...prev, [target]: source }))
  }

  const runValidation = useCallback(async () => {
    if (!parsed) return
    setValidating(true)
    setPreviewError(null)
    try {
      const res = await fetch('/api/network/devices/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: parsed.rows,
          columnMap,
          dryRun: true,
          defaultSource: 'csv',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPreviewError(data.error || 'Validation failed')
        return
      }
      setPreviewResult(data)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Validation failed')
    } finally {
      setValidating(false)
    }
  }, [parsed, columnMap])

  const handleGoToPreview = async () => {
    setStep('preview')
    await runValidation()
  }

  const handleCommit = async () => {
    if (!parsed || !previewResult) return
    setCommitting(true)
    setCommitError(null)
    try {
      const res = await fetch('/api/network/devices/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: parsed.rows,
          columnMap,
          dryRun: false,
          defaultSource: 'csv',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCommitError(data.error || 'Commit failed')
        return
      }
      try {
        window.localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify(columnMap)
        )
      } catch {
        // localStorage might be unavailable (privacy mode etc.) — non-fatal
      }
      setCommitResult(data)
      setStep('done')
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Commit failed')
    } finally {
      setCommitting(false)
    }
  }

  const resetAll = () => {
    setStep('upload')
    setFile(null)
    setParsed(null)
    setColumnMap({})
    setPreviewResult(null)
    setCommitResult(null)
    setUploadError(null)
    setPreviewError(null)
    setCommitError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="container mx-auto px-4 py-8">
          <Link
            href="/network"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Network
          </Link>
          <div className="bg-white rounded-lg shadow-md p-8 max-w-2xl mx-auto border-l-4 border-amber-500">
            <div className="flex items-start">
              <ShieldOff className="w-6 h-6 text-amber-500 mr-3 flex-shrink-0 mt-1" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Admin role required
                </h2>
                <p className="text-gray-600">
                  Importing network devices is restricted to administrators.
                  Contact IT if you need access.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Link
          href="/network"
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Network
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
          <Upload className="w-7 h-7 text-blue-600" />
          Import Network Devices
        </h1>
        <p className="text-gray-600 mb-6">
          Upload a CSV or XLSX file, map your columns to our fields, and
          commit the valid rows.
        </p>

        <StepIndicator current={step} />

        {step === 'upload' && (
          <div className="bg-white rounded-xl shadow-md p-6 mt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              1. Upload file
            </h2>

            <label
              htmlFor="file-input"
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="block border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
            >
              <FileSpreadsheet className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              {file ? (
                <div>
                  <p className="text-gray-900 font-medium">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-700 font-medium">
                    Drag a file here, or click to choose
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    .csv or .xlsx, up to 10 MB
                  </p>
                </div>
              )}
              <input
                id="file-input"
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>

            <p className="text-sm text-gray-600 mt-4">
              Need a starting point? Download the{' '}
              <a
                href="/network-devices-template.csv"
                download
                className="text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                sample CSV template
              </a>
              .
            </p>

            {uploadError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {uploadError}
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                Parse & continue
              </button>
            </div>
          </div>
        )}

        {step === 'map' && parsed && (
          <div className="bg-white rounded-xl shadow-md p-6 mt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              2. Map columns
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Found {parsed.totalRows} row{parsed.totalRows === 1 ? '' : 's'} in{' '}
              <span className="font-mono">{parsed.filename}</span>. Match each
              of your columns to one of our fields.
            </p>

            {requiredMissing.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <p className="font-medium">Required mappings still missing:</p>
                <ul className="list-disc list-inside mt-1">
                  {requiredMissing.map((t) => (
                    <li key={t}>{TARGET_FIELD_LABEL[t]}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3">
              {IMPORT_TARGET_FIELDS.map((target) => {
                const isRequired = (
                  REQUIRED_TARGET_FIELDS as readonly ImportTargetField[]
                ).includes(target)
                return (
                  <div
                    key={target}
                    className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex-1">
                      <span className="font-medium text-gray-900">
                        {TARGET_FIELD_LABEL[target]}
                      </span>
                      {isRequired && (
                        <span className="ml-2 text-xs text-red-600 font-medium">
                          required
                        </span>
                      )}
                      <div className="text-xs text-gray-500 font-mono">
                        {target}
                      </div>
                    </div>
                    <select
                      value={columnMap[target] ?? ''}
                      onChange={(e) =>
                        setMapping(target, e.target.value || null)
                      }
                      aria-label={`Map ${TARGET_FIELD_LABEL[target]}`}
                      className="w-72 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    >
                      <option value="">— Not mapped —</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setStep('upload')}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={handleGoToPreview}
                disabled={requiredMissing.length > 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Preview & validate
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && parsed && (
          <div className="bg-white rounded-xl shadow-md p-6 mt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              3. Preview & validate
            </h2>
            {validating && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            )}
            {previewError && !validating && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {previewError}
              </div>
            )}

            {previewResult && !validating && (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <SummaryStat
                    label="Total rows"
                    value={previewResult.totalRows}
                    tone="neutral"
                  />
                  <SummaryStat
                    label="Valid"
                    value={previewResult.validCount}
                    tone="success"
                  />
                  <SummaryStat
                    label="Invalid"
                    value={previewResult.skipped}
                    tone={previewResult.skipped > 0 ? 'danger' : 'neutral'}
                  />
                </div>

                {commitError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {commitError}
                  </div>
                )}

                <PreviewTable
                  parsedHeaders={parsed.headers}
                  rowResults={previewResult.rowResults}
                  columnMap={columnMap}
                />

                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => setStep('map')}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    disabled={committing}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back to mapping
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={resetAll}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      disabled={committing}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCommit}
                      disabled={
                        committing || previewResult.validCount === 0
                      }
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {committing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Commit {previewResult.validCount} valid row
                      {previewResult.validCount === 1 ? '' : 's'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'done' && commitResult && (
          <div className="bg-white rounded-xl shadow-md p-6 mt-6">
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                Import complete
              </h2>
              <p className="text-gray-600">
                Inserted <strong>{commitResult.inserted}</strong> device
                {commitResult.inserted === 1 ? '' : 's'}
                {commitResult.skipped > 0 && (
                  <>
                    , skipped{' '}
                    <strong>{commitResult.skipped}</strong> invalid row
                    {commitResult.skipped === 1 ? '' : 's'}
                  </>
                )}
                .
              </p>
            </div>

            <div className="flex justify-center gap-3 mt-4">
              <button
                onClick={resetAll}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Import another file
              </button>
              <button
                onClick={() => router.push('/network')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Go to Network dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StepIndicator({ current }: { current: WizardStep }) {
  const steps: { id: WizardStep; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'map', label: 'Map columns' },
    { id: 'preview', label: 'Preview & validate' },
    { id: 'done', label: 'Done' },
  ]
  const currentIdx = steps.findIndex((s) => s.id === current)

  return (
    <ol className="flex items-center w-full">
      {steps.map((s, i) => (
        <li
          key={s.id}
          className={`flex items-center ${
            i < steps.length - 1 ? 'flex-1' : ''
          }`}
        >
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-medium ${
              i < currentIdx
                ? 'bg-blue-600 border-blue-600 text-white'
                : i === currentIdx
                ? 'bg-white border-blue-600 text-blue-600'
                : 'bg-white border-gray-300 text-gray-400'
            }`}
          >
            {i < currentIdx ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              i + 1
            )}
          </div>
          <span
            className={`ml-2 text-sm font-medium hidden sm:inline ${
              i <= currentIdx ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div
              className={`flex-1 h-0.5 mx-2 ${
                i < currentIdx ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          )}
        </li>
      ))}
    </ol>
  )
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'neutral' | 'success' | 'danger'
}) {
  const colour =
    tone === 'success'
      ? 'text-green-600'
      : tone === 'danger'
      ? 'text-red-600'
      : 'text-gray-900'
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold ${colour}`}>{value}</div>
      <div className="text-xs text-gray-600 uppercase tracking-wide">
        {label}
      </div>
    </div>
  )
}

function PreviewTable({
  parsedHeaders,
  rowResults,
  columnMap,
}: {
  parsedHeaders: string[]
  rowResults: RowResult[]
  columnMap: ImportColumnMap
}) {
  const targets = IMPORT_TARGET_FIELDS.filter((t) => columnMap[t])
  const [showAll, setShowAll] = useState(false)
  const visibleRows = showAll ? rowResults : rowResults.slice(0, 20)

  // Pre-index errors by (row, source header)
  const errorIndex = new Map<string, ImportError>()
  for (const row of rowResults) {
    for (const err of row.errors) {
      const sourceHeader = columnMap[err.field as ImportTargetField]
      const key = `${row.rowNumber}::${sourceHeader ?? err.field}`
      errorIndex.set(key, err)
    }
  }

  return (
    <div>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-700">
                #
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">
                Status
              </th>
              {targets.map((t) => (
                <th
                  key={t}
                  className="px-3 py-2 text-left font-medium text-gray-700"
                >
                  {TARGET_FIELD_LABEL[t]}
                  <div className="text-[10px] text-gray-400 font-normal font-mono">
                    {columnMap[t]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleRows.map((r) => (
              <tr
                key={r.rowNumber}
                className={r.valid ? 'bg-green-50/40' : 'bg-red-50/60'}
              >
                <td className="px-3 py-2 font-mono text-gray-500">
                  {r.rowNumber}
                </td>
                <td className="px-3 py-2">
                  {r.valid ? (
                    <span className="inline-flex items-center gap-1 text-green-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Valid
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-red-700"
                      title={r.errors.map((e) => e.message).join('\n')}
                    >
                      <X className="w-3.5 h-3.5" />
                      {r.errors.length} error
                      {r.errors.length === 1 ? '' : 's'}
                    </span>
                  )}
                </td>
                {targets.map((t) => {
                  const sourceHeader = columnMap[t]
                  const value = sourceHeader
                    ? r.raw[sourceHeader] ?? ''
                    : ''
                  const errKey = `${r.rowNumber}::${sourceHeader}`
                  const err = errorIndex.get(errKey)
                  return (
                    <td
                      key={t}
                      className={`px-3 py-2 ${
                        err
                          ? 'bg-red-100 text-red-900 font-medium'
                          : 'text-gray-700'
                      }`}
                      title={err?.message}
                    >
                      {value || <span className="text-gray-400">—</span>}
                      {err && (
                        <div className="text-[10px] text-red-700 mt-0.5 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {err.message}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rowResults.length > 20 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline"
        >
          Show all {rowResults.length} rows
        </button>
      )}
    </div>
  )
}
