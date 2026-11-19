import React, { useRef, forwardRef, useImperativeHandle } from 'react'
import { toPng } from 'html-to-image'
import { useThemeStore } from '../store/themeStore'

const LAYER_STYLES = {
  blue: 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/25 border-blue-200/80 dark:border-blue-900/60',
  indigo: 'border-l-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/25 border-indigo-200/80 dark:border-indigo-900/60',
  emerald: 'border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/25 border-emerald-200/80 dark:border-emerald-900/60',
  amber: 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/25 border-amber-200/80 dark:border-amber-900/60',
  violet: 'border-l-violet-500 bg-violet-50/50 dark:bg-violet-950/25 border-violet-200/80 dark:border-violet-900/60',
  rose: 'border-l-rose-500 bg-rose-50/50 dark:bg-rose-950/25 border-rose-200/80 dark:border-rose-900/60',
  cyan: 'border-l-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/25 border-cyan-200/80 dark:border-cyan-900/60',
  slate: 'border-l-slate-500 bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
}

const LayerStackRenderer = forwardRef(({ spec, onAskAboutNode }, ref) => {
  const { isDark } = useThemeStore()
  const exportRef = useRef(null)
  const layers = spec.layers || []

  useImperativeHandle(ref, () => ({
    exportPng: async () => {
      if (!exportRef.current) return
      const dataUrl = await toPng(exportRef.current, {
        backgroundColor: isDark ? '#181818' : '#ffffff',
        pixelRatio: 2
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${(spec.title || 'layer_stack').replace(/\s+/g, '_').toLowerCase()}.png`
      a.click()
    }
  }))

  return (
    <div className="space-y-2">
      <div
        ref={exportRef}
        className="rounded-2xl border border-slate-200 dark:border-[#333333] bg-white dark:bg-[#181818] p-5 space-y-2.5"
      >
        {layers.map((layer, idx) => {
          const style = LAYER_STYLES[layer.color] || LAYER_STYLES.blue
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onAskAboutNode?.(`${layer.name} in ${spec.title}`)}
              className={`w-full text-left rounded-2xl border border-l-4 ${style} px-4 py-3.5 transition-all hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/80 dark:bg-[#252526] text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-[#333333]">
                    {layer.level}
                  </span>
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {layer.name}
                  </span>
                </div>
                {layer.subtitle && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {layer.subtitle}
                  </p>
                )}
              </div>

              {layer.items?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {layer.items.map((item, iIdx) => (
                    <span
                      key={iIdx}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#252526] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#3a3a3a]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-slate-400 text-center">
        Click any layer to ask the tutor for a deeper explanation.
      </p>
    </div>
  )
})

export default LayerStackRenderer