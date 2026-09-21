/**
 * FilePreviewer — preset composition of the Previewer building blocks.
 * Styling and part arrangement live here; logic lives in Previewer.tsx.
 */
import {
  PreviewerRoot, PreviewerOverlay, PreviewerPanel, PreviewerHeader,
  PreviewerTitle, PreviewerClose, PreviewerBody, PreviewerError,
  PreviewerImage, PreviewerBinary, PreviewerCode, PreviewerFooter,
  PreviewerStats, PreviewerLanguage,
} from './Previewer'
import type { FileSource } from './load'

export function FilePreviewer({ source, selectedFile, onClose }: {
  source: FileSource | null
  selectedFile: string | null
  onClose: () => void
}) {
  return (
    <PreviewerRoot source={source} file={selectedFile} onClose={onClose}>
      <PreviewerOverlay />
      <PreviewerPanel>
        <PreviewerHeader>
          <PreviewerTitle />
          <PreviewerClose />
        </PreviewerHeader>
        <PreviewerBody>
          <PreviewerError />
          <PreviewerImage />
          <PreviewerBinary />
          <PreviewerCode />
        </PreviewerBody>
        <PreviewerFooter>
          <PreviewerStats />
          <PreviewerLanguage />
        </PreviewerFooter>
      </PreviewerPanel>
    </PreviewerRoot>
  )
}
