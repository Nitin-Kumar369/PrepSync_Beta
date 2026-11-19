import React, { useRef, forwardRef, useImperativeHandle } from 'react'
import { toPng } from 'html-to-image'
import { useThemeStore } from '../store/themeStore'

const SequenceRenderer = forwardRef(({ spec, onAskAboutNode }, ref) => {
  const { isDark } = useThemeStore()
  const exportRef = useRef(null)
  const participants = spec.participants || []
  const messages = spec.messages || []

  useImperativeHandle(ref, () => ({
    exportPng: async () => {
      if (!exportRef.current) return
      const dataUrl = await toPng(exportRef.current, {
        backgroundColor: isDark ? '#181818' : '#ffffff',
        pixelRatio: 2
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${(spec.title || 'sequence_diagram').replace(/\s+/g, '_').toLowerCase()}.png`
      a.click()
    }
  }))

  const indexMap = {}
  participants.forEach((p, idx) => { indexMap[p.id] = idx })
  const count = Math.max(participants.length, 2)

  return (
    <div className="space-y-2">
      <div
        ref={exportRef}
        className="rounded-2xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#181818] p-6 overflow-x-auto"
      >
        <div className="min-w-[520px] relative">
          {/* Participant Headers */}
          <div
            className="grid gap-4 mb-6"
            style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
          >
            {participants.map((p) => (
              <div key={p.id} className="flex justify-center">
                <button
                  type="button"
                  onClick={() => onAskAboutNode?.(`${p.name} role in ${spec.title}`)}
                  className="px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#252526] border border-slate-200 dark:border-[#3a3a3a] shadow-sm text-center hover:border-blue-400 transition-colors min-w-[120px]"
                >
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">{p.name}</div>
                  {p.subtitle && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{p.subtitle}</div>
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Lifelines + Messages */}
          <div className="relative py-2 space-y-5">
            {/* Vertical dashed lifelines */}
            <div
              className="absolute inset-0 grid gap-4 pointer-events-none"
              style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
            >
              {participants.map((p) => (
                <div key={p.id} className="flex justify-center">
                  <div className="w-px h-full border-l-2 border-dashed border-slate-200 dark:border-[#333333]" />
                </div>
              ))}
            </div>

            {/* Message Rows */}
            {messages.map((m, idx) => {
              const fromIdx = indexMap[m.from] ?? 0
              const toIdx = indexMap[m.to] ?? 1
              const leftPct = ((Math.min(fromIdx, toIdx) + 0.5) / count) * 100
              const widthPct = (Math.abs(toIdx - fromIdx) / count) * 100
              const isRight = toIdx >= fromIdx
              const isSelf = fromIdx === toIdx
              const isReply = m.type === 'reply'

              return (
                <div key={idx} className="relative h-12 flex items-center">
                  {isSelf ? (
                    <div
                      style={{ left: `${leftPct}%` }}
                      className="absolute -translate-x-1/2 z-10 px-3 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-[11px] font-semibold text-amber-800 dark:text-amber-200 shadow-sm"
                    >
                      {m.label}
                    </div>
                  ) : (
                    <div
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      className="absolute z-10 flex flex-col items-center cursor-pointer group"
                      onClick={() => onAskAboutNode?.(`${m.label} in ${spec.title}`)}
                    >
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-white dark:bg-[#252526] border border-slate-200 dark:border-[#3a3a3a] text-slate-800 dark:text-slate-100 shadow-xs mb-1 group-hover:border-blue-400">
                        {m.label}
                      </span>
                      <div className="w-full flex items-center">
                        {!isRight && (
                          <div className="w-0 h-0 border-y-[5px] border-y-transparent border-r-[8px] border-r-blue-500" />
                        )}
                        <div
                          className={`flex-1 h-0 border-t-2 ${
                            isReply
                              ? 'border-dashed border-emerald-500'
                              : 'border-solid border-blue-500'
                          }`}
                        />
                        {isRight && (
                          <div className={`w-0 h-0 border-y-[5px] border-y-transparent border-l-[8px] ${
                            isReply ? 'border-l-emerald-500' : 'border-l-blue-500'
                          }`} />
                        )}
                      </div>
                      {m.note && (
                        <span className="text-[10px] text-slate-400 mt-0.5">{m.note}</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 text-center">
        Click any actor or message step to ask the tutor for a deeper explanation.
      </p>
    </div>
  )
})

export default SequenceRenderer