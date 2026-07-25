import type { IpcMainInvokeEvent } from 'electron'

/**
 * Long-running operations that report determinate progress to the renderer.
 */
export type ProgressOp = 'push' | 'pull' | 'import' | 'backup' | 'restore'

export interface ProgressPayload {
  op: ProgressOp
  phase: string
  current: number
  total: number
  percent: number
}

export type ProgressReporter = (current: number, total: number, phase?: string) => void

/**
 * Build a progress reporter bound to the invoking renderer. Each call emits a
 * `progress:update` event carrying a 0–100 percent so the UI can show a real
 * progress bar instead of an indeterminate spinner.
 */
export function progressReporter(event: IpcMainInvokeEvent, op: ProgressOp): ProgressReporter {
  return (current: number, total: number, phase = '') => {
    const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : 0
    try {
      event.sender.send('progress:update', { op, phase, current, total, percent } as ProgressPayload)
    } catch {
      // Renderer may have navigated away; progress is best-effort.
    }
  }
}
