import React, { useRef, forwardRef, useImperativeHandle } from 'react'
import { toPng } from 'html-to-image'
import { useThemeStore } from '../store/themeStore'

const FIELD_COLORS = {
  blue: 'bg-blue-50/90 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700/80 text-blue-950 dark:text-blue-100',
  indigo: 'bg-indigo-50/90 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700/80 text-indigo-950 dark:text-indigo-100',
  emerald: 'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700/80 text-emerald-950 dark:text-emerald-100',
  amber: 'bg-amber-50/90 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700/80 text-amber-950 dark:text-amber-100',
  violet: 'bg-violet-50/90 dark:bg-violet-950/50 border-violet-300 dark:border-violet-700/80 text-violet-950 dark:text-violet-100',
  rose: 'bg-rose-50/90 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700/80 text-rose-950 dark:text-rose-100',
  cyan: 'bg-cyan-50/90 dark:bg-cyan-950/50 border-cyan-300 dark:border-cyan-700/80 text-cyan-950 dark:text-cyan-100',
  slate: 'bg-slate-100/90 dark:bg-slate-800/70 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100'
}

const PacketRenderer = forwardRef(({ spec, onAskAboutNode }, ref) => {
  const { isDark } = useThemeStore()
  const exportRef = useRef(null)
  const bitsPerRow = spec.bits_per_row || 32
  const unit = spec.unit || 'bits'
  const rows = spec.rows || []

  useImperativeHandle(ref, () => ({
    exportPng: async () => {
      if (!exportRef.current) return
      const dataUrl = await toPng(exportRef.current, {
        backgroundColor: isDark ? '#181818' : '#ffffff',
        pixelRatio: 2
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${(spec.title || 'packet_layout').replace(/\s+/g, '_').toLowerCase()}.png`
      a.click()
    }
  }))

  // Generate ruler markers (e.g., 0, 4, 8, ..., 31 for 32-bit rows)
  const step = bitsPerRow >= 32 ? 4 : bitsPerRow >= 16 ? 2 : 1
  const ticks = []
  for (let i = 0; i < bitsPerRow; i += step) ticks.push(i)

  return (
    <div className="space-y-2">
      <div
        ref={exportRef}
        className="rounded-2xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#181818] p-5 overflow-x-auto"
      >
        <div className="min-w-[540px] space-y-2">
          {/* Bit-Offset Ruler */}
          <div className="flex items-center gap-2">
            <div className="w-12 shrink-0 text-[10px] font-mono text-slate-400 text-right pr-1">
              Bit
            </div>
            <div
              className="flex-1 grid text-[10px] font-mono text-slate-400 select-none pb-1 border-b border-slate-200 dark:border-[#333333]"
              style={{ gridTemplateColumns: `repeat(${bitsPerRow}, minmax(0, 1fr))` }}
            >
              {ticks.map((t, idx) => (
                <div
                  key={t}
                  style={{ gridColumn: `span ${step} / span ${step}` }}
                  className="flex justify-between pr-1 border-l border-slate-200 dark:border-[#333333] pl-1"
                >
                  <span>{t}</span>
                  {idx === ticks.length - 1 && <span>{bitsPerRow - 1}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Packet Rows */}
          {rows.map((row, rIdx) => {
            const totalRowBits = row.fields.reduce((acc, f) => acc + (f.bits || 1), 0)
            const isMultiRowBlock = row.fields.length === 1 && row.fields[0].bits > bitsPerRow

            return (
              <div key={rIdx} className="flex items-stretch gap-2">
                <div className="w-12 shrink-0 flex items-center justify-end pr-1 text-[10px] font-mono text-slate-400">
                  {row.label || `Row ${rIdx + 1}`}
                </div>

                {isMultiRowBlock ? (
                  (() => {
                    const f = row.fields[0]
                    const colorCls = FIELD_COLORS[f.color] || FIELD_COLORS.blue
                    return (
                      <button
                        type="button"
                        onClick={() => onAskAboutNode?.(`${f.name} field in ${spec.title}`)}
                        title={f.description || `Click to ask about ${f.name}`}
                        className={`flex-1 rounded-xl border ${colorCls} px-4 py-5 text-center transition-all hover:shadow-md hover:brightness-95 dark:hover:brightness-110`}
                      >
                        <div className="font-bold text-sm leading-tight">{f.name}</div>
                        <div className="text-[11px] opacity-75 mt-1 font-mono">
                          {f.bits} {unit} {f.value ? `• ${f.value}` : ''}
                        </div>
                        {f.description && (
                          <div className="text-[11px] opacity-70 mt-1">{f.description}</div>
                        )}
                      </button>
                    )
                  })()
                ) : (
                  <div
                    className="flex-1 grid gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${Math.max(totalRowBits, bitsPerRow)}, minmax(0, 1fr))` }}
                  >
                    {row.fields.map((f, fIdx) => {
                      const span = Math.min(f.bits || 1, Math.max(totalRowBits, bitsPerRow))
                      const colorCls = FIELD_COLORS[f.color] || FIELD_COLORS.blue
                      return (
                        <button
                          key={fIdx}
                          type="button"
                          onClick={() => onAskAboutNode?.(`${f.name} field in ${spec.title}`)}
                          title={f.description || `Click to ask about ${f.name}`}
                          style={{ gridColumn: `span ${span} / span ${span}` }}
                          className={`rounded-xl border ${colorCls} px-2.5 py-3 text-center flex flex-col justify-center transition-all hover:shadow-md hover:brightness-95 dark:hover:brightness-110 min-h-[64px]`}
                        >
                          <div className="font-bold text-xs leading-tight break-words">{f.name}</div>
                          <div className="text-[10px] opacity-75 mt-1 font-mono">
                            {f.bits} {unit}
                          </div>
                          {f.value && (
                            <div className="text-[10px] opacity-70 truncate mt-0.5">{f.value}</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-[11px] text-slate-400 text-center">
        Hover any field for details or click it to ask the tutor for a deeper explanation.
      </p>
    </div>
  )
})

export default PacketRenderer