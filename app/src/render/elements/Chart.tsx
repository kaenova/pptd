// Chart element: ECharts wrapper. Chart lifecycle: init on mount, setOption on deck/page change, dispose on unmount.
// Canvas is fixed at bounds px inside the scaled wrapper (scale-to-fit is CSS transform, echarts never resizes).
import { useEffect, useRef } from 'react'
import { init, use } from 'echarts/core'
import {
  BarChart, LineChart, ScatterChart, BubbleChart, PieChart, RadarChart,
  CandlestickChart, HeatmapChart, TreemapChart, SunburstChart, SankeyChart,
} from 'echarts/charts'
import {
  GridComponent, LegendComponent, TitleComponent, TooltipComponent,
  VisualMapComponent, RadarComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ChartElement } from '../../types'
import { useTheme } from '../../theme'
import { boxStyle } from '../Fill'
import { chartOption, type ChartSpec } from '../charts/map'

let registered = false
function ensureRegistered() {
  if (registered) return
  use([
    BarChart, LineChart, ScatterChart, BubbleChart, PieChart, RadarChart,
    CandlestickChart, HeatmapChart, TreemapChart, SunburstChart, SankeyChart,
    GridComponent, LegendComponent, TitleComponent, TooltipComponent,
    VisualMapComponent, RadarComponent, CanvasRenderer,
  ])
  registered = true
}

export function ChartBox({ el }: { el: ChartElement }) {
  ensureRegistered()
  const theme = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof init> | null>(null)
  const [, , w, h] = el.bounds

  useEffect(() => {
    if (!ref.current) return
    const chart = init(ref.current, null, { renderer: 'canvas' })
    chartRef.current = chart
    return () => {
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(chartOption(el as unknown as ChartSpec, theme), { notMerge: true })
  }, [el, theme])

  return (
    <div
      className="el chart"
      data-id={el.elementId}
      style={{ position: 'absolute', left: el.bounds[0], top: el.bounds[1], width: w, height: h, ...boxStyle(el.fill, el.border, el.shadow, theme) }}
    >
      <div ref={ref} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
