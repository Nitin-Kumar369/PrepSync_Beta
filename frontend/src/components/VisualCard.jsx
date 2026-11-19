import React, { useState, useRef } from 'react'
import FlowDiagramRenderer from './FlowDiagramRenderer'
import PacketRenderer from './PacketRenderer'
import SequenceRenderer from './SequenceRenderer'
import LayerStackRenderer from './LayerStackRenderer'
import ChartRenderer from './ChartRenderer'
import {
  GitBranch, BarChart3, Layers, ArrowLeftRight, Binary,
  ChevronDown, ChevronUp, RotateCcw, Download
} from 'lucide-react'

const KIND_META = {
  diagram: {
    label: 'Interactive Diagram',
    icon: GitBranch,
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
  },
  packet: {
    label: 'Bit-Field Layout',
    icon: Binary,
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
  },
  sequence: {
    label: 'Sequence Diagram',
    icon: ArrowLeftRight,
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
  },
  layers: {
    label: 'Layered Stack',
    icon: Layers,
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
  },
  chart: {
    label: 'Data Graph',
    icon: BarChart3,
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  }
}

export default function VisualCard({
  item,
  initialExpanded = true,
  onAskAboutNode,
  onRegenerate
}) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)
  const rendererRef = useRef(null)
  const spec = item?.visual || {}
  const kind = spec.kind || 'diagram'
  const meta = KIND_META[kind] || KIND_META.diagram
  const Icon = meta.icon

  const handleDownload = (e) => {
    e.stopPropagation()
    if (!isExpanded) {
      setIsExpanded(true)
      setTimeout(() => rendererRef.current?.exportPng?.(), 250)
    } else {
      rendererRef.current?.exportPng?.()
    }
  }

  return (
    <div className="my-5 bg-white dark:bg-[#1e1e1e] rounded-3xl border border-slate-200 dark:border-[#333333] shadow-sm overflow-hidden transition-all">
      {/* Header Ribbon */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252526] transition-colors select-none"
      >
        <div className="flex items-center gap-3 min-w-0 pr-3">
          <div className={`p-2 rounded-xl shrink-0 ${meta.badge}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base truncate">
                {spec.title || 'Visual Explanation'}
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {kind === 'chart' ? `${spec.chart_type || 'area'} graph` : meta.label}
              </span>
            </div>
            {spec.summary && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {spec.summary}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-[#333333] transition-colors"
            title="Download auto-cropped PNG"
          >
            <Download className="w-3.5 h-3.5" /> PNG
          </button>
          {onRegenerate && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRegenerate()
              }}
              className="p-1.5 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
              title="Regenerate visual"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expanded Visual Canvas */}
      {isExpanded && (
        <div className="border-t border-slate-100 dark:border-[#333333] p-5">
          {kind === 'chart' && <ChartRenderer ref={rendererRef} spec={spec} />}
          {kind === 'packet' && <PacketRenderer ref={rendererRef} spec={spec} onAskAboutNode={onAskAboutNode} />}
          {kind === 'sequence' && <SequenceRenderer ref={rendererRef} spec={spec} onAskAboutNode={onAskAboutNode} />}
          {kind === 'layers' && <LayerStackRenderer ref={rendererRef} spec={spec} onAskAboutNode={onAskAboutNode} />}
          {kind === 'diagram' && <FlowDiagramRenderer ref={rendererRef} spec={spec} onAskAboutNode={onAskAboutNode} />}
        </div>
      )}
    </div>
  )
}