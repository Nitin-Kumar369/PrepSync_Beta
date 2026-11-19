import React, { useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { toPng } from 'html-to-image'
import { useThemeStore } from '../store/themeStore'
import { Play, Cpu, GitFork, Database, Sparkles } from 'lucide-react'

const VARIANT_STYLES = {
  start: {
    border: 'border-emerald-400/80 dark:border-emerald-600/80',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    icon: Play
  },
  process: {
    border: 'border-blue-400/80 dark:border-blue-600/80',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    icon: Cpu
  },
  decision: {
    border: 'border-amber-400/80 dark:border-amber-600/80',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    icon: GitFork
  },
  data: {
    border: 'border-violet-400/80 dark:border-violet-600/80',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    icon: Database
  },
  highlight: {
    border: 'border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-500/20',
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    icon: Sparkles
  }
}

function CustomCardNode({ data }) {
  const style = VARIANT_STYLES[data.variant] || VARIANT_STYLES.process
  const Icon = style.icon
  const isHorizontal = data.direction === 'LR'

  return (
    <div
      onClick={() => data.onNodeClick?.(data.label)}
      className={`w-[220px] rounded-2xl bg-white dark:bg-[#252526] border ${style.border} shadow-md hover:shadow-lg transition-all px-4 py-3 cursor-pointer group`}
      title="Click to ask AI about this concept"
    >
      {data.hasIncoming && (
        <Handle
          type="target"
          position={isHorizontal ? Position.Left : Position.Top}
          className="!w-2.5 !h-2.5 !bg-slate-400 dark:!bg-slate-500 !border-2 !border-white dark:!border-[#252526]"
        />
      )}
      <div className="flex items-start gap-2.5">
        <div className={`p-1.5 rounded-xl shrink-0 mt-0.5 ${style.badge}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-xs text-slate-900 dark:text-slate-100 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {data.label}
          </div>
          {data.subtitle && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              {data.subtitle}
            </div>
          )}
        </div>
      </div>
      {data.hasOutgoing && (
        <Handle
          type="source"
          position={isHorizontal ? Position.Right : Position.Bottom}
          className="!w-2.5 !h-2.5 !bg-blue-500 !border-2 !border-white dark:!border-[#252526]"
        />
      )}
    </div>
  )
}

const nodeTypes = { customCard: CustomCardNode }

function computeLayout(rawNodes, rawEdges, direction = 'TB', isDark = false, onNodeClick) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))

  const isHorizontal = direction === 'LR'
  g.setGraph({
    rankdir: direction,
    nodesep: isHorizontal ? 60 : 55,
    ranksep: isHorizontal ? 155 : 95
  })

  const NODE_W = 220
  const NODE_H = 78

  const incomingSet = new Set(rawEdges.map((e) => e.target))
  const outgoingSet = new Set(rawEdges.map((e) => e.source))

  rawNodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  rawEdges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)

  let maxY = 0
  const nodes = rawNodes.map((n) => {
    const pos = g.node(n.id)
    maxY = Math.max(maxY, pos.y + NODE_H / 2)
    return {
      id: n.id,
      type: 'customCard',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: {
        label: n.label,
        subtitle: n.subtitle,
        variant: n.variant,
        direction,
        hasIncoming: incomingSet.has(n.id),
        hasOutgoing: outgoingSet.has(n.id),
        onNodeClick
      }
    }
  })

  const edgeColor = isDark ? '#64748b' : '#94a3b8'
  const edges = rawEdges.map((e, idx) => ({
    id: `e_${idx}_${e.source}_${e.target}`,
    source: e.source,
    target: e.target,
    label: e.label || undefined,
    animated: Boolean(e.animated),
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
    style: { stroke: edgeColor, strokeWidth: 1.8 },
    labelStyle: {
      fontSize: 11,
      fontWeight: 600,
      fill: isDark ? '#e2e8f0' : '#334155'
    },
    labelBgStyle: {
      fill: isDark ? '#1e293b' : '#ffffff',
      fillOpacity: 0.95,
      stroke: isDark ? '#334155' : '#cbd5e1',
      strokeWidth: 1
    },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 8
  }))

  const suggestedHeight = Math.min(Math.max(Math.round(maxY + 120), 290), 430)
  return { nodes, edges, suggestedHeight }
}

const FlowDiagramInner = forwardRef(({ spec, onAskAboutNode }, ref) => {
  const { isDark } = useThemeStore()
  const wrapperRef = useRef(null)
  const { getNodes } = useReactFlow()

  const { nodes, edges, suggestedHeight } = useMemo(
    () => computeLayout(spec.nodes || [], spec.edges || [], spec.direction || 'TB', isDark, onAskAboutNode),
    [spec, isDark, onAskAboutNode]
  )

  useImperativeHandle(ref, () => ({
    exportPng: async () => {
      const viewportEl = wrapperRef.current?.querySelector('.react-flow__viewport')
      if (!viewportEl) return

      const currentNodes = getNodes()
      if (!currentNodes.length) return

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      currentNodes.forEach((n) => {
        const w = n.measured?.width ?? n.width ?? 220
        const h = n.measured?.height ?? n.height ?? 90
        minX = Math.min(minX, n.position.x)
        minY = Math.min(minY, n.position.y)
        maxX = Math.max(maxX, n.position.x + w)
        maxY = Math.max(maxY, n.position.y + h)
      })

      const padding = 40
      const imageWidth = Math.ceil(maxX - minX + padding * 2)
      const imageHeight = Math.ceil(maxY - minY + padding * 2)

      const dataUrl = await toPng(viewportEl, {
        backgroundColor: isDark ? '#181818' : '#f8fafc',
        width: imageWidth,
        height: imageHeight,
        pixelRatio: 2,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transformOrigin: '0 0',
          transform: `translate(${-minX + padding}px, ${-minY + padding}px) scale(1)`
        }
      })

      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${(spec.title || 'diagram').replace(/\s+/g, '_').toLowerCase()}.png`
      a.click()
    }
  }))

  return (
    <div className="space-y-2">
      <div
        ref={wrapperRef}
        style={{ height: `${suggestedHeight}px` }}
        className="w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#181818] relative"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color={isDark ? '#2e2e2e' : '#cbd5e1'} gap={18} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <p className="text-[11px] text-slate-400 text-center">
        Drag to pan, scroll to zoom, or click any node to ask the tutor about it.
      </p>
    </div>
  )
})

const FlowDiagramRenderer = forwardRef((props, ref) => (
  <ReactFlowProvider>
    <FlowDiagramInner {...props} ref={ref} />
  </ReactFlowProvider>
))

export default FlowDiagramRenderer