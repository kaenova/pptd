import { describe, expect, test } from 'bun:test'
import { chartOption, fmtNum, mergeSeriesDefaults } from '../src/render/charts/map'
import type { ChartSpec } from '../src/render/charts/map'

const theme = { colors: { $primary: '#24C', $accent: '#E91E63' }, textStyles: {}, tableStyles: {} }
const chart = (series: Record<string, unknown>[], rows: unknown[][], cols: string[]): ChartSpec => ({
  data: { cols, rows }, series,
})

describe('chart mapper helpers', () => {
  test('formats supported number patterns', () => {
    expect(fmtNum(12, '0')).toBe('12')
    expect(fmtNum(12.5, '0.0')).toBe('12.5')
    expect(fmtNum(0.125, '0.0%')).toBe('12.5%')
    expect(fmtNum(1234, '#,##0')).toBe('1,234')
    expect(fmtNum(1200, '0.0E+00')).toBe('1.2E+3')
  })

  test('merges defaults shallowly without replacing encode/type', () => {
    const [s] = mergeSeriesDefaults(
      [{ type: 'bar', encode: { x: 'q', y: 'v' }, itemStyle: { color: '#f00' } }],
      { bar: { stack: 'value', itemStyle: { opacity: 0.5, color: '#00f' }, encode: { x: 'bad' } } },
    )
    expect(s.stack).toBe('value')
    expect(s.encode).toEqual({ x: 'q', y: 'v' })
    expect(s.itemStyle).toEqual({ opacity: 0.5, color: '#f00' })
  })

  test('bubble maps to scatter with scaled triples', () => {
    const opt = chartOption(chart([{ type: 'bubble', encode: { x: 'x', y: 'y', size: 's' }, sizeRange: [8, 48] }], [[1, 2, 10], [2, 4, 20]], ['x', 'y', 's']), theme) as any
    const s = opt.series[0]
    expect(s.type).toBe('scatter')
    expect(s.data).toEqual([[1, 2, 10], [2, 4, 20]])
    expect(s.symbolSize([1, 2, 10])).toBe(8)
    expect(s.symbolSize([1, 2, 20])).toBe(48)
    expect(opt.xAxis[0].type).toBe('value')
    expect(opt.yAxis[0].type).toBe('value')
  })

  test('pie maps spec angle to ECharts angle', () => {
    const opt = chartOption(chart([{ type: 'pie', encode: { category: 'c', value: 'v' }, startAngle: 30, innerRadius: 0.4 }], [['a', 2]], ['c', 'v']), theme) as any
    expect(opt.series[0].startAngle).toBe(60)
    expect(opt.series[0].radius).toEqual(['40%', '70%'])
  })

  test('waterfall builds transparent cumulative anchors', () => {
    const opt = chartOption(chart([{ type: 'waterfall', encode: { x: 'name', y: 'amount' } }], [['open', 100], ['up', 40], ['down', -20]], ['name', 'amount']) as any, theme) as any
    expect(opt.series[0].data).toEqual([0, 100, 140])
    expect(opt.series[1].data.map((d: any) => d.value)).toEqual([100, 40, 20])
  })

  test('radar emits indicator on chart option, not series data', () => {
    const opt = chartOption(chart([{ type: 'radar', encode: { category: 'metric', y: 'a' } }], [['speed', 8]], ['metric', 'a']), theme) as any
    expect(opt.radar.indicator).toEqual([{ name: 'speed', max: 10, min: 0 }])
    expect(opt.series[0].__indicator).toBeUndefined()
  })
})
