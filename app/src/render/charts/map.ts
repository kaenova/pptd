// Chart mapper: PPTD v2 chart element → ECharts option.
// Spec: skills/cowork-ppt/reference/pptd.md "Chart (charts)" §; converter twin: scripts/pptd_utils/charts_native.py.
import type { EChartsCoreOption } from 'echarts/core'
import { resolveColor, resolveFontFamily, type ThemeCtx } from '../../theme'

// ---------- types (subset of spec we support; loose where checker already validates) ----------

type Loose = Record<string, any>

export interface ChartSpec {
  data: { cols: string[]; rows: unknown[][] }
  series: Loose[]
  seriesDefaults?: Record<string, Loose>
  xAxis?: Loose | Loose[]
  yAxis?: Loose | Loose[]
  barWidth?: number
  barGap?: number
  categoryGap?: number
  spokeAxis?: Loose
  title?: string | Loose
  legend?: boolean | Loose
  dataLabels?: Loose
  fontFamily?: Loose
  fill?: Loose
  border?: Loose
  shadow?: Loose
}

// ---------- shared helpers ----------

const THEME_CYCLE = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47']

export const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  const n = parseFloat(String(v))
  return Number.isNaN(n) ? null : n
}

const colIdx = (el: ChartSpec) => Object.fromEntries(el.data.cols.map((c, i) => [c, i]))
const vals = (rows: unknown[][], i: number) => rows.map((r) => (i < r.length ? r[i] : null))

/** §3.4 seriesDefaults merge: scalars override-if-absent, objects one-level shallow merge, arrays replace. */
export function mergeSeriesDefaults(series: Loose[], defaults?: Record<string, Loose>): Loose[] {
  return series.map((s) => {
    const d = defaults?.[s.type]
    if (!d) return s
    const m: Loose = { ...s }
    for (const [k, v] of Object.entries(d)) {
      if (k === 'type' || k === 'encode' || v === null || v === undefined) continue
      if (m[k] === undefined || m[k] === null) m[k] = v
      else if (typeof v === 'object' && !Array.isArray(v) && typeof m[k] === 'object' && !Array.isArray(m[k])) {
        m[k] = { ...v, ...m[k] }
      }
    }
    return m
  })
}

function fillToColor(f: unknown, theme: ThemeCtx): string | object {
  if (typeof f === 'string') return resolveColor(f, theme) ?? '#FF00FF'
  if (f && typeof f === 'object' && (f as Loose).type === 'gradient') {
    const g = f as { gradientType?: string; angle?: number; stops: { position: number; color: string }[] }
    const stops = (g.stops ?? []).map((s) => ({ offset: s.position ?? 0, color: resolveColor(s.color, theme) ?? '#000' }))
    if (g.gradientType === 'radial') return { type: 'radial', x: 0.5, y: 0.5, r: 0.5, colorStops: stops }
    // spec angle 0 = left→right = CSS 90deg; echarts x/y vectors: (cos(a-90), -sin(a-90)) … use CSS-deg convention
    const rad = (((g.angle ?? 0) + 90) * Math.PI) / 180
    return { type: 'linear', x: Math.cos(rad), y: -Math.sin(rad), x2: -Math.cos(rad), y2: Math.sin(rad), colorStops: stops }
  }
  return '#FF00FF'
}

function lineStyle(s: Loose, theme: ThemeCtx, colorKey: string, fallback: string, width: number) {
  const color = resolveColor(s[colorKey] ?? fallback, theme) ?? fallback
  return {
    color,
    width: s.width ?? width,
    type: s.lineStyle === 'dash' ? 'dashed' : s.lineStyle === 'dot' ? 'dotted' : 'solid',
  }
}

function boolOr<T>(v: boolean | Loose | undefined, def: T): boolean | T {
  if (v === false) return false
  if (v === true) return true
  if (v && typeof v === 'object') return v as T
  return def
}

/** Excel-format subset → d3-format-ish helper (0 / 0.0 / 0% / 0.0% / #,##0 / 0.0E+00). */
export function fmtNum(v: number, f?: string): string {
  if (!f) return String(v)
  const pct = /%$/.test(f)
  const dec = (f.split('.')[1] ?? '').replace('%', '').length
  if (pct) return (v * 100).toFixed(dec) + '%'
  if (f.includes('E+00')) return v.toExponential(f.split('.')[1]?.length || 0).replace('e', 'E').replace('E+', 'E+')
  if (f.includes(',')) return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  return v.toFixed(dec)
}

function textStyle(s: Loose | undefined, theme: ThemeCtx, base?: Loose): Loose | undefined {
  if (!s && !base) return undefined
  const o: Loose = { ...base }
  const st = s && typeof s === 'object' ? s : {}
  if (st.color) o.color = resolveColor(st.color, theme)
  if (st.fontSize) o.fontSize = st.fontSize
  const ff = resolveFontFamily(st.fontFamily)
  if (ff) o.fontFamily = ff
  return o
}

// ---------- data-labels (§3.3 chain: series.dataLabels > chart.dataLabels > off) ----------

function labelOpt(s: Loose, el: ChartSpec, theme: ThemeCtx, contentDef: string, pos: string): Loose | undefined {
  const dl: Loose = { ...(el.dataLabels ?? {}), ...(s.dataLabels ?? {}) }
  if (!dl.show) return undefined
  const content = dl.content ?? contentDef
  const t = textStyle(dl, theme)
  return {
    show: true,
    position: pos,
    ...(t ?? {}),
    ...(dl.numberFormat ? { formatter: (p: Loose) => fmtNum(Number(p.value), dl.numberFormat) } : {}),
    ...(content === 'percentage' ? { formatter: '{d}%' } : {}),
    ...(content === 'category' ? { formatter: (p: Loose) => p.name } : {}),
  }
}

// ---------- axes ----------

function axisOpt(cfg: boolean | Loose | undefined, isVal: boolean, theme: ThemeCtx, col?: unknown[], overrideType?: string): Loose {
  const c = (typeof cfg === 'object' && cfg) || {}
  const show = c.show !== false
  const type = overrideType ?? (c.type as string) ?? (col && col.some((v) => typeof v === 'string' && v !== null) ? 'category' : 'value')
  const o: Loose = { show }
  if (type === 'value') {
    o.type = 'value'
    if (c.min !== undefined) o.min = c.min
    if (c.max !== undefined) o.max = c.max
    if (c.reverse) o.inverse = true
  } else {
    o.type = 'category'
    if (c.reverse) o.inverse = true
  }
  const label = boolOr(c.label, true)
  if (label === false) o.axisLabel = { show: false }
  else if (typeof label === 'object') {
    o.axisLabel = { ...(textStyle(label, theme) ?? {}), show: true }
    if ((label as Loose).numberFormat && type === 'value')
      o.axisLabel.formatter = (v: number) => fmtNum(v, (label as Loose).numberFormat)
  }
  const axisLine = boolOr(c.axisLine, true)
  if (axisLine === false) o.axisLine = { show: false }
  else if (typeof axisLine === 'object') {
    const al = axisLine as Loose
    o.axisLine = {
      show: true,
      lineStyle: {
        color: resolveColor(al.color ?? '#000000', theme),
        width: al.width ?? 1,
        ...(al.style ? { type: al.style === 'dash' ? 'dashed' : al.style === 'dot' ? 'dotted' : 'solid' } : {}),
      },
    }
    if (al.arrow) o.axisLine.symbol = ['none', al.arrow === 'start' ? 'arrow' : 'arrow']
    if (al.arrow === 'start') o.axisLine.symbol = ['arrow', 'none']
    if (al.arrow === 'both') o.axisLine.symbol = ['arrow', 'arrow']
  }
  const grid = boolOr(c.gridLine, true)
  if (grid === false) o.splitLine = { show: false }
  else if (typeof grid === 'object') {
    const gl = grid as Loose
    o.splitLine = { show: true, lineStyle: { color: resolveColor(gl.color ?? '#e6e6e6', theme), width: gl.width ?? 1, ...(gl.style ? { type: gl.style === 'dash' ? 'dashed' : gl.style === 'dot' ? 'dotted' : 'solid' } : {}) } }
  } else o.splitLine = { show: true }
  if (c.title) {
    const t = typeof c.title === 'object' ? c.title : { text: String(c.title) }
    o.name = t.text
    o.nameTextStyle = textStyle(t, theme) ?? {}
    o.nameGap = 6
  }
  // value axes get gridlines from the value axis; category axis keeps its own
  if (!isVal && type === 'value') o.splitLine = o.splitLine ?? { show: true }
  return o
}

// ---------- per-type mappers ----------

function cartesian(el: ChartSpec, series: Loose[], theme: ThemeCtx, types: Set<string>): Loose {
  const idx = colIdx(el)
  const rows = el.data.rows
  const s0 = series[0]
  const xcfgList = Array.isArray(el.xAxis) ? el.xAxis : el.xAxis ? [el.xAxis] : []
  const ycfgList = Array.isArray(el.yAxis) ? el.yAxis : el.yAxis ? [el.yAxis] : []
  const xcfg = xcfgList[(s0.xAxisIndex as number) || 0] ?? xcfgList[0]
  const ycfg = ycfgList[(s0.yAxisIndex as number) || 0] ?? ycfgList[0]

  // horizontal = y is category (bar/waterfall direction rule; numeric x + string y)
  const xCol = vals(rows, idx[s0.encode.x as string] ?? 0)
  const yCol = vals(rows, idx[s0.encode.y as string] ?? 0)
  const yIsCat = (ycfg as Loose)?.type === 'category' || (!xcfgList.length && !ycfgList.length && xCol.every((v) => num(v) !== null && v !== null) && yCol.some((v) => typeof v === 'string'))
  const horizontal = types.has('waterfall') || (types.size <= 3 && [...types].every((t) => ['bar', 'line', 'area'].includes(t)) && yIsCat)

  const xAxis: Loose[] = []
  const yAxis: Loose[] = []
  const nAx = Math.max(xcfgList.length, ycfgList.length, 1)
  for (let i = 0; i < nAx; i++) {
    const catCol = horizontal ? yCol : xCol
    if (horizontal) {
      yAxis.push(axisOpt(ycfg, false, theme, catCol, 'category'))
      xAxis.push(axisOpt(xcfg, true, theme, xCol, 'value'))
    } else {
      xAxis.push(axisOpt(xcfg, false, theme, catCol, (xcfg as Loose | undefined)?.type === 'value' ? 'value' : 'category'))
      yAxis.push(axisOpt(ycfg, true, theme, undefined, 'value'))
    }
  }

  const out: Loose[] = []
  let bi = 0
  for (const s of series) {
    const ci = bi % THEME_CYCLE.length
    const vCol = horizontal ? s.encode.x : s.encode.y
    const v = vals(rows, idx[vCol]).map(num)
    const base: Loose = {
      type: s.type === 'area' ? 'line' : s.type,
      name: s.name ?? vCol,
      xAxisIndex: (s.xAxisIndex as number) || 0,
      yAxisIndex: (s.yAxisIndex as number) || 0,
      data: v,
      encode: undefined,
      // label chain
      ...(s.type !== 'candlestick' ? (() => { const l = labelOpt(s, el, theme, 'value', s.type === 'bar' ? (horizontal ? 'right' : 'top') : 'top'); return l ? { label: l } : {} })() : {}),
    }
    if (!types.has('heatmap')) {
      // categories on the category axis
      const ax = horizontal ? yAxis[base.yAxisIndex] : xAxis[base.xAxisIndex]
      const catVals = horizontal ? yCol : xCol
      if (ax?.type === 'category') ax.data = catVals.map((v2: unknown) => (v2 === null ? '' : String(v2)))
    }
    if (s.type === 'bar') {
      base.itemStyle = { color: fillToColor(s.fill ?? THEME_CYCLE[ci], theme), ...(s.border ? { borderColor: resolveColor(s.border.color, theme), borderWidth: s.border.width ?? 1 } : {}) }
      base.barMaxWidth = 80
      if (el.barWidth) base.barWidth = `${Math.round((el.barWidth as number) * 100)}%`
      if (s.stack) base.stack = 'stack'
      if (types.has('bar') && el.barGap !== undefined) base.barGap = `${Math.round((el.barGap as number) * 100)}%`
      out.push(base)
      bi++
    } else if (s.type === 'line' || s.type === 'area') {
      const color = resolveColor(s.lineColor ?? s.areaColor ?? THEME_CYCLE[ci], theme) as string
      base.lineStyle = lineStyle(s, theme, 'lineColor', color as string, 2)
      base.itemStyle = { color }
      base.showSymbol = s.marker !== false
      base.symbolSize = s.marker?.size ?? 6
      base.symbol = s.marker?.shape === 'rect' ? 'rect' : s.marker?.shape ?? 'circle'
      base.smooth = !!s.smooth
      base.connectNulls = s.nullHandling === 'connect'
      if (s.nullHandling === 'zero') base.data = v.map((x) => (x === null ? 0 : x))
      if (s.stack) base.stack = 'stack'
      if (s.type === 'area') {
        base.areaStyle = s.areaColor
          ? { color: fillToColor(s.areaColor, theme) }
          : { color, opacity: 0.35 }
        if (s.stack === 'stream') base.stack = 'stream'
      }
      out.push(base)
      bi++
    } else if (s.type === 'scatter') {
      base.itemStyle = { color: fillToColor(s.marker?.fill ?? s.fill ?? THEME_CYCLE[ci], theme) }
      base.symbolSize = s.marker?.size ?? 10
      base.symbol = s.marker?.shape ?? 'circle'
      out.push(base)
      bi++
    } else if (s.type === 'bubble') {
      base.itemStyle = { color: fillToColor(s.fill ?? THEME_CYCLE[ci], theme) }
      out.push(base)
      bi++
    } else if (s.type === 'candlestick') {
      base.itemStyle = {
        color: resolveColor(s.upBars?.fill ?? '#ec0000', theme),
        color0: resolveColor(s.downBars?.fill ?? '#00da3c', theme),
        borderColor: resolveColor(s.upBars?.fill ?? '#ec0000', theme),
        borderColor0: resolveColor(s.downBars?.fill ?? '#00da3c', theme),
      }
      base.data = rows
        .map((r) => [num(r[idx[s.encode.open as string] ?? 0]), num(r[idx[s.encode.close as string]]), num(r[idx[s.encode.low as string]]), num(r[idx[s.encode.high as string]])])
        .filter((r) => r.every((x) => x !== null))
      out.push(base)
      bi++
    } else if (s.type === 'waterfall') {
      out.push(...waterfall(s, rows, idx, el, theme))
      bi++
    }
  }
  return { xAxis, yAxis, series: out }
}

function waterfall(s: Loose, rows: unknown[][], idx: Record<string, number>, el: ChartSpec, theme: ThemeCtx): Loose[] {
  const yv = vals(rows, idx[s.encode.y]).map(num)
  const isTotal = s.encode.isTotal ? vals(rows, idx[s.encode.isTotal]).map((v) => v === true) : rows.map(() => false)
  // classic stacked-transparent trick: invisible base bar + visible per-bar bar
  const base: number[] = []
  let cum = 0
  yv.forEach((v, i) => {
    if (isTotal[i]) {
      base.push(0)
      cum = v ?? 0
    } else {
      base.push(cum)
      cum += v ?? 0
    }
  })
  const inc = s.increaseBars?.fill ?? '#91cc75'
  const dec = s.decreaseBars?.fill ?? '#ee6666'
  const colored = yv.map((v, i) => {
    const cls = isTotal[i] ? s.totalBars?.fill ?? '#5470c6' : (v ?? 0) >= 0 ? inc : dec
    return { value: Math.abs(v ?? 0), itemStyle: { color: fillToColor(cls, theme) } }
  })
  const bw = el.barWidth ? `${Math.round(el.barWidth * 100)}%` : undefined
  return [
    { type: 'bar', stack: 'wf', name: 'base', itemStyle: { color: 'transparent' }, silent: true, barWidth: bw, data: base },
    { type: 'bar', stack: 'wf', name: 'waterfall', barWidth: bw, data: colored },
  ]
}

function pieOpt(s: Loose, el: ChartSpec, theme: ThemeCtx): Loose {
  const idx = colIdx(el)
  const cats = vals(el.data.rows, idx[s.encode.category]).map((v) => (v === null ? '' : String(v)))
  const v = vals(el.data.rows, idx[s.encode.value]).map(num)
  const fills: unknown[] = Array.isArray(s.fill) ? s.fill : s.fill ? [s.fill] : []
  const data = v.map((x, i) => ({
    name: cats[i],
    value: x,
    itemStyle: { color: fillToColor(fills[i % Math.max(fills.length, 1)] ?? THEME_CYCLE[i % THEME_CYCLE.length], theme), ...(s.border ? { borderColor: resolveColor(s.border.color, theme) ?? '#fff', borderWidth: s.border.width ?? 1 } : {}) },
  }))
  const dl = { ...(el.dataLabels ?? {}), ...(s.dataLabels ?? {}) }
  const content = dl.content ?? 'value'
  const r0 = (s.innerRadius ?? 0) * 100
  const l = labelOpt(s, el, theme, 'value', 'outside')
  return {
    type: 'pie',
    radius: s.innerRadius ? [`${r0}%`, '70%'] : '70%',
    startAngle: 90 - (s.startAngle ?? 0), // spec 0 = 12 o'clock; echarts 90 = 12 o'clock
    data,
    ...(l ? { label: { ...l, ...(content === 'percentage' ? { formatter: '{d}%' } : content === 'category' ? { formatter: '{b}' } : {}) } } : {}),
  }
}

function radarOpt(el: ChartSpec, series: Loose[], theme: ThemeCtx): Loose[] {
  const idx = colIdx(el)
  const cats = vals(el.data.rows, idx[series[0].encode.category]).map((v) => (v === null ? '' : String(v)))
  const spoke = el.spokeAxis ?? {}
  const allV = series.flatMap((s) => vals(el.data.rows, idx[s.encode.y]).map(num).filter((x) => x !== null)) as number[]
  const out: Loose[] = []
  series.forEach((s, i) => {
    const v = vals(el.data.rows, idx[s.encode.y]).map(num)
    const color = resolveColor(s.lineColor ?? s.areaColor ?? THEME_CYCLE[i % THEME_CYCLE.length], theme) as string
    out.push({
      type: 'radar',
      name: s.name ?? s.encode.y,
      data: [{ value: v, name: s.name ?? s.encode.y }],
      lineStyle: { color, width: s.width ?? 2, type: s.lineStyle === 'dash' ? 'dashed' : s.lineStyle === 'dot' ? 'dotted' : 'solid' },
      itemStyle: { color },
      symbol: s.marker === false ? 'none' : (s.marker?.shape ?? 'circle'),
      symbolSize: s.marker?.size ?? 6,
      smooth: !!s.smooth,
      areaStyle: s.areaColor ? { color: fillToColor(s.areaColor, theme) } : undefined,
      ...(labelOpt(s, el, theme, 'value', 'top') ? { label: labelOpt(s, el, theme, 'value', 'top') } : {}),
    })
  })
  // radar indicator carried on chart-level via caller
  ;(out as Loose & { __indicator?: unknown }).__indicator = cats.map((name) => ({ name, max: spoke.max ?? Math.max(1, Math.ceil(Math.max(...allV) * 1.2)), min: spoke.min ?? 0 }))
  return out
}

function heatmapOpt(el: ChartSpec, s: Loose, theme: ThemeCtx): Loose {
  const idx = colIdx(el)
  const xs = [...new Set(vals(el.data.rows, idx[s.encode.x]).map((v) => String(v ?? '')))]
  const ys = [...new Set(vals(el.data.rows, idx[s.encode.y]).map((v) => String(v ?? '')))]
  const v = vals(el.data.rows, idx[s.encode.value]).map(num)
  const scheme: string[] = Array.isArray(s.colorScheme) ? (s.colorScheme as string[]) : []
  const scale = s.colorScale ?? {}
  const allV = v.filter((x) => x !== null) as number[]
  const domain = scale.domain ?? [Math.min(...allV), Math.max(...allV)]
  const dv = scale.type === 'diverging' ? Math.max(Math.abs(domain[0]), Math.abs(domain[1])) : 0
  const inRange = scheme.length
    ? { color: scheme.map((c) => resolveColor(c, theme)) }
    : { color: ['#ffffff', THEME_CYCLE[0]] }
  const series = {
    type: 'heatmap',
    data: el.data.rows.map((r: unknown[], i: number) => {
      const cx = r[idx[s.encode.x] as number]
      const cy = r[idx[s.encode.y] as number]
      return [xs.indexOf(cx === null || cx === undefined ? '' : String(cx)), ys.indexOf(cy === null || cy === undefined ? '' : String(cy)), v[i]]
    }).filter((d: (number | null)[]) => (d[0] ?? -1) >= 0 && (d[1] ?? -1) >= 0),
    label: { show: !!((el.dataLabels ?? s.dataLabels ?? {}).show) },
  }
  const visualMap: Loose = {
    type: 'continuous',
    min: scale.type === 'diverging' ? -dv : domain[0],
    max: scale.type === 'diverging' ? dv : domain[1],
    calculable: true,
    orient: 'horizontal',
    left: 'center',
    bottom: 0,
    itemHeight: 80,
    ...(inRange ? { inRange } : {}),
  }
  const cb = s.colorbar
  if (cb === false) visualMap.show = false
  else if (cb && typeof cb === 'object' && cb.position) {
    // position mapping left/right/top/bottom
    const pos = cb.position
    if (pos === 'right') Object.assign(visualMap, { orient: 'vertical', right: 0, left: undefined, bottom: undefined, top: 'middle' })
    if (pos === 'left') Object.assign(visualMap, { orient: 'vertical', left: 0, bottom: undefined, top: 'middle' })
    if (pos === 'top') Object.assign(visualMap, { left: 'center', bottom: undefined, top: 0 })
  }
  return { series, visualMap, xAxis: { type: 'category', data: xs }, yAxis: { type: 'category', data: ys } }
}

function hierarchy(s: Loose, el: ChartSpec, kind: 'treemap' | 'sunburst', theme: ThemeCtx): Loose {
  const idx = colIdx(el)
  const catCol = idx[s.encode.category]
  const valCol = idx[s.encode.value]
  const parentCol = s.encode.parent !== undefined ? idx[s.encode.parent] : -1
  const nodes: Loose = {}
  const roots: Loose[] = []
  el.data.rows.forEach((r) => {
    const name = String(r[catCol] ?? '')
    const parent = parentCol >= 0 && r[parentCol] !== null && r[parentCol] !== undefined && r[parentCol] !== '' ? String(r[parentCol]) : null
    const n: Loose = { name, value: num(r[valCol]), children: [] }
    nodes[name] = n
    if (parent && nodes[parent]) nodes[parent].children.push(n)
    else if (parent) nodes[parent] = { name: parent, children: [n], value: undefined }
    else roots.push(n)
  })
  // aggregate parent values? spec: parent rows may carry own value; echarts treemap sums children automatically when value undefined
  const fills: unknown[] = Array.isArray(s.fill) ? s.fill : s.fill ? [s.fill] : []
  const dl = { ...(el.dataLabels ?? {}), ...(s.dataLabels ?? {}) }
  const content = dl.content ?? 'category'
  const data = roots.map((n, i) => {
    const f = fills.length ? fillToColor(fills[i % fills.length], theme) : THEME_CYCLE[i % THEME_CYCLE.length]
    return { ...n, itemStyle: { color: f } }
  })
  const label = labelOpt(s, el, theme, content, 'inside')
  return {
    type: kind,
    data,
    ...(label ? { label } : {}),
    ...(kind === 'treemap' ? { roam: false, nodeClick: false } : {}),
  }
}

function sankeyOpt(s: Loose, el: ChartSpec, theme: ThemeCtx): Loose {
  const idx = colIdx(el)
  const nodeNames: string[] = []
  el.data.rows.forEach((r) => {
    for (const c of [s.encode.source, s.encode.target]) {
      const n = String(r[idx[c]] ?? '')
      if (!nodeNames.includes(n)) nodeNames.push(n)
    }
  })
  const fillMap = typeof s.fill === 'object' && !Array.isArray(s.fill) && s.fill ? s.fill : null
  const fills: unknown[] = Array.isArray(s.fill) ? s.fill : []
  const data = nodeNames.map((n, i) => ({
    name: n,
    itemStyle: { color: fillToColor(fillMap?.[n] ?? fills[i % Math.max(fills.length, 1)] ?? THEME_CYCLE[i % THEME_CYCLE.length], theme) },
  }))
  const links = el.data.rows.map((r) => ({ source: String(r[idx[s.encode.source]]), target: String(r[idx[s.encode.target]]), value: num(r[idx[s.encode.flow]]) }))
  const dl = { ...(el.dataLabels ?? {}), ...(s.dataLabels ?? {}) }
  const content = dl.content ?? 'value'
  const l = labelOpt(s, el, theme, content, 'right')
  return {
    type: 'sankey',
    nodeAlign: s.nodeAlign ?? 'justify',
    data,
    links,
    ...(l ? { label: { ...l, ...(content === 'value' ? {} : content === 'category' ? { formatter: '{b}' } : {}) } } : {}),
    ...(s.border ? { itemStyle: { borderColor: resolveColor(s.border.color, theme), borderWidth: s.border.width ?? 1 } } : {}),
  }
}

// ---------- top-level components ----------

function titleOpt(el: ChartSpec, theme: ThemeCtx): Loose | undefined {
  if (!el.title) return undefined
  const t = typeof el.title === 'object' ? el.title : { text: String(el.title) }
  return { text: t.text, ...(textStyle(t, theme, { fontSize: 14 }) ?? {}), left: 'center', top: 4 }
}

const LEGEND_DEF: Record<string, boolean> = {
  bar: true, line: true, area: true, scatter: true, bubble: true, candlestick: true, pie: true, radar: true,
  waterfall: false, treemap: false, sunburst: false, sankey: false, heatmap: false,
}

function legendOpt(el: ChartSpec, types: Set<string>, theme: ThemeCtx): Loose | undefined {
  const show = el.legend === false ? false : el.legend === true ? true : el.legend && typeof el.legend === 'object' ? el.legend.show !== false : [...types].some((t) => LEGEND_DEF[t])
  if (!show) return undefined
  const cfg = typeof el.legend === 'object' ? el.legend : {}
  const pos = cfg.position ?? 'bottom'
  const where = pos === 'top' ? { top: 4 } : pos === 'bottom' ? { bottom: 4 } : pos === 'left' ? { left: 4 } : { right: 4 }
  const orient = pos === 'left' || pos === 'right' ? 'vertical' : 'horizontal'
  return { show: true, orient, ...(textStyle(cfg, theme, { fontSize: 10 }) ?? {}), ...where }
}

// ---------- entry ----------

export function chartOption(el: ChartSpec, theme: ThemeCtx): EChartsCoreOption {
  const series = mergeSeriesDefaults(el.series, el.seriesDefaults)
  const types = new Set(series.map((s) => s.type))
  const opt: Loose = {}
  const t = titleOpt(el, theme)
  if (t) opt.title = t
  const lg = legendOpt(el, types, theme)
  if (lg) opt.legend = lg
  if (el.fontFamily) opt.textStyle = { fontFamily: resolveFontFamily(el.fontFamily as never) }

  const first = series[0]
  if (['bar','line','area','scatter','bubble','candlestick','waterfall'].some((t) => types.has(t))) {
    Object.assign(opt, cartesian(el, series, theme, types))
  } else if (types.has('pie')) {
    opt.series = [pieOpt(first, el, theme)]
  } else if (types.has('radar')) {
    const rs = radarOpt(el, series, theme)
    const ind = (rs[0] as Loose & { __indicator?: unknown }).__indicator
    for (const r of rs) delete (r as Loose & { __indicator?: unknown }).__indicator
    opt.radar = { indicator: ind, ...(el.spokeAxis?.show === false ? { splitLine: { show: false }, axisLine: { show: false } } : {}) }
    opt.series = rs
  } else if (types.has('heatmap')) {
    const h = heatmapOpt(el, first, theme)
    Object.assign(opt, { xAxis: h.xAxis, yAxis: h.yAxis, visualMap: h.visualMap, series: [h.series] })
  } else if (types.has('treemap')) {
    opt.series = [hierarchy(first, el, 'treemap', theme)]
  } else if (types.has('sunburst')) {
    opt.series = [hierarchy(first, el, 'sunburst', theme)]
  } else if (types.has('sankey')) {
    opt.series = [sankeyOpt(first, el, theme)]
  }
  // grid defaults: leave room for title/legend
  if (opt.xAxis) opt.grid = { left: 60, right: 30, top: t ? 44 : 24, bottom: lg && el.legend !== false ? 44 : 30, containLabel: true }
  return opt as EChartsCoreOption
}
