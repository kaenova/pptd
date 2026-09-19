export interface ComponentSelection {
  slide: number
  componentId: string
  x: number
  y: number
}

export interface SelectFeature {
  handleOnSelect: (components: string, comments: string) => void
}

export function selectionLabel(selection: Pick<ComponentSelection, 'slide' | 'componentId'>): string {
  return `slide ${selection.slide + 1} > component id: ${selection.componentId}`
}
