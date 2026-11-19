import React, { useRef, forwardRef, useImperativeHandle } from 'react'
import {
  ResponsiveContainer,
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'
import { toPng } from 'html-to-image'
import { useThemeStore } from '../store/themeStore'

const ChartRenderer = forwardRef(({ spec }, ref) => {
  const { isDark } = useThemeStore()
  const exportRef = useRef(null)

  const series = spec.series || []
  const data = spec.data || []
  const gridColor = isDark ? '#333333' : '#e2e8f0'
  const textColor = isDark ? '#9ca3af' : '#64748b'
  const tooltipStyle = {
    backgroundColor: isDark ? '#252526' : '#ffffff',
    borderColor: isDark ? '#333333' : '#e2e8f0',
    borderRadius: '14px',
    fontSize: '12px'
  }

  useImperativeHandle(ref, () => ({
    exportPng: async () => {
      if (!exportRef.current) return
      const dataUrl = await toPng(exportRef.current, {
        backgroundColor: isDark ? '#181818' : '#ffffff',
        pixelRatio: 2
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${(spec.title || 'graph').replace(/\s+/g, '_').toLowerCase()}.png`
      a.click()
    }
  }))

  const ChartTag =
    spec.chart_type === 'bar' ? BarChart :
    spec.chart_type === 'line' ? LineChart : AreaChart

  return (
    <div
      ref={exportRef}
      className="w-full h-[330px] rounded-2xl border border-slate-200 dark:border-[#333333] bg-slate-50/60 dark:bg-[#181818] p-4"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ChartTag data={data} margin={{ top: 10, right: 20, left: 4, bottom: 22 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad_${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color || '#3b82f6'} stopOpacity={0.35} />
                <stop offset="95%" stopColor={s.color || '#3b82f6'} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="x"
            stroke={textColor}
            fontSize={11}
            label={spec.x_label ? { value: spec.x_label, position: 'insideBottom', offset: -12, fill: textColor, fontSize: 11 } : undefined}
          />
          <YAxis
            stroke={textColor}
            fontSize={11}
            label={spec.y_label ? { value: spec.y_label, angle: -90, position: 'insideLeft', fill: textColor, fontSize: 11 } : undefined}
          />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />

          {series.map((s) => {
            const color = s.color || '#3b82f6'
            if (spec.chart_type === 'bar') {
              return <Bar key={s.key} dataKey={s.key} name={s.name} fill={color} radius={[8, 8, 0, 0]} />
            }
            if (spec.chart_type === 'line') {
              return <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={color} strokeWidth={2.5} dot={{ r: 3.5 }} />
            }
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={color}
                strokeWidth={2.5}
                fill={`url(#grad_${s.key})`}
              />
            )
          })}
        </ChartTag>
      </ResponsiveContainer>
    </div>
  )
})

export default ChartRenderer