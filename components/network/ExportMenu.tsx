'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
} from 'lucide-react'

export type ExportFormat = 'png' | 'csv' | 'pdf'

export interface ExportMenuItem {
  format: ExportFormat
  onSelect: () => void | Promise<void>
  disabled?: boolean
  /** Tooltip shown when the item is disabled. */
  disabledReason?: string
  /** When true, show a spinner instead of the format icon (that item is running). */
  running?: boolean
}

interface ExportMenuProps {
  items: ExportMenuItem[]
  /** Label shown next to the download icon; defaults to "Export". */
  label?: string
  /** Extra class names for the trigger button. */
  className?: string
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  png: 'PNG (topology diagram)',
  csv: 'CSV (device list)',
  pdf: 'PDF (topology diagram)',
}

function FormatIcon({ format }: { format: ExportFormat }) {
  const className = 'w-4 h-4'
  switch (format) {
    case 'png':
      return <FileImage className={`${className} text-purple-600`} />
    case 'csv':
      return <FileSpreadsheet className={`${className} text-green-600`} />
    case 'pdf':
      return <FileText className={`${className} text-red-600`} />
  }
}

/**
 * A small, keyboard-accessible export dropdown.
 *
 * - Enter/Space on the trigger opens the menu and focuses the first enabled item.
 * - Arrow Up/Down navigates enabled items; Home/End jump to the ends.
 * - Enter/Space activates the focused item; Escape closes.
 * - Clicking outside closes.
 * - Selecting an item calls its `onSelect` and closes the menu.
 * - Disabled items render greyed with a `title` tooltip explaining why.
 */
export default function ExportMenu({ items, label = 'Export', className = '' }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const enabledIndexes = useMemo(
    () => items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0),
    [items]
  )

  const focusItem = useCallback((index: number) => {
    setActiveIndex(index)
    const el = itemRefs.current[index]
    if (el) el.focus()
  }, [])

  const openMenu = useCallback(() => {
    setOpen(true)
    // Focus the first enabled item after the menu renders.
    setTimeout(() => {
      const first = enabledIndexes[0]
      if (first !== undefined) focusItem(first)
    }, 0)
  }, [enabledIndexes, focusItem])

  const closeMenu = useCallback(
    (returnFocus = true) => {
      setOpen(false)
      setActiveIndex(-1)
      if (returnFocus) triggerRef.current?.focus()
    },
    []
  )

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const handleTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openMenu()
    }
  }

  const handleItemKey = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu(true)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (enabledIndexes.length === 0) return
      const currentPos = enabledIndexes.indexOf(index)
      const delta = e.key === 'ArrowDown' ? 1 : -1
      const nextPos =
        currentPos < 0
          ? 0
          : (currentPos + delta + enabledIndexes.length) % enabledIndexes.length
      focusItem(enabledIndexes[nextPos])
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      if (enabledIndexes[0] !== undefined) focusItem(enabledIndexes[0])
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      const last = enabledIndexes[enabledIndexes.length - 1]
      if (last !== undefined) focusItem(last)
      return
    }
    if (e.key === 'Tab') {
      // Let the browser move focus naturally, but close the menu.
      setOpen(false)
      setActiveIndex(-1)
      return
    }
  }

  const handleItemActivate = async (index: number) => {
    const item = items[index]
    if (!item || item.disabled) return
    // Close first so the UI feels snappy; the caller can manage its own
    // spinner state via the `running` prop if the action is long.
    closeMenu(false)
    try {
      await item.onSelect()
    } catch (err) {
      console.error('Export action failed:', err)
    }
  }

  const anyRunning = items.some((it) => it.running)

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={handleTriggerKey}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        disabled={anyRunning && !open}
      >
        {anyRunning ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {label}
        <ChevronDown className="w-4 h-4 text-gray-500" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1"
        >
          {items.map((item, index) => {
            const isDisabled = Boolean(item.disabled)
            const isActive = activeIndex === index
            return (
              <button
                key={item.format}
                ref={(el) => {
                  itemRefs.current[index] = el
                }}
                type="button"
                role="menuitem"
                tabIndex={isActive ? 0 : -1}
                disabled={isDisabled}
                title={isDisabled ? item.disabledReason : undefined}
                onClick={() => handleItemActivate(index)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleItemActivate(index)
                    return
                  }
                  handleItemKey(e, index)
                }}
                onMouseEnter={() => !isDisabled && setActiveIndex(index)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  isDisabled
                    ? 'text-gray-400 cursor-not-allowed'
                    : isActive
                      ? 'bg-blue-50 text-gray-900'
                      : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {item.running ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                ) : (
                  <FormatIcon format={item.format} />
                )}
                <span className="flex-1">{FORMAT_LABELS[item.format]}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
