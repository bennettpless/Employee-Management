'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

interface MultiSelectFilterProps {
  allLabel: string
  pluralNoun: string
  options: readonly string[]
  selected: string[]
  onChange: (next: string[]) => void
  getLabel?: (value: string) => string
}

export default function MultiSelectFilter({
  allLabel,
  pluralNoun,
  options,
  selected,
  onChange,
  getLabel = (v) => v,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const selectedSet = new Set(selected)

  const toggle = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange(options.filter((o) => o === value || selectedSet.has(o)))
    }
  }

  const buttonLabel =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? getLabel(selected[0])
        : `${selected.length} ${pluralNoun}`

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected.length > 1 ? selected.map(getLabel).join(', ') : undefined}
        className={`inline-flex items-center gap-2 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white min-w-[10rem] justify-between ${
          selected.length > 0 ? 'border-blue-400 text-blue-800' : 'border-gray-300 text-gray-900'
        }`}
      >
        <span className="truncate max-w-[12rem]">{buttonLabel}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 min-w-full w-max max-w-xs bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-gray-100 text-xs">
            <button
              type="button"
              onClick={() => onChange([...options])}
              className="text-blue-600 hover:text-blue-800"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
              className="text-gray-600 hover:text-gray-900 disabled:text-gray-300"
            >
              Clear
            </button>
          </div>
          <ul role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto">
            {options.map((value) => {
              const checked = selectedSet.has(value)
              return (
                <li key={value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(value)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-800 hover:bg-blue-50"
                  >
                    <span
                      className={`flex items-center justify-center w-4 h-4 rounded border flex-shrink-0 ${
                        checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className="truncate">{getLabel(value)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
