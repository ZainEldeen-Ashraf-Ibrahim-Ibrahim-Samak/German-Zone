import { useEffect, useState, useCallback } from 'react'

export type ProgressOp = 'push' | 'pull' | 'import' | 'backup' | 'restore'

export interface ProgressState {
  percent: number
  phase: string
  current: number
  total: number
}

const EMPTY: ProgressState = { percent: 0, phase: '', current: 0, total: 0 }

/**
 * Subscribe to main-process operation progress. Returns the latest progress per
 * operation plus a `reset(op)` to clear stale values before starting a new run.
 */
export function useProgress() {
  const [progress, setProgress] = useState<Record<string, ProgressState>>({})

  useEffect(() => {
    const off = window.api.onProgress?.((p) => {
      setProgress((prev) => ({
        ...prev,
        [p.op]: { percent: p.percent, phase: p.phase, current: p.current, total: p.total }
      }))
    })
    return () => { off?.() }
  }, [])

  const reset = useCallback((op: ProgressOp) => {
    setProgress((prev) => ({ ...prev, [op]: { ...EMPTY } }))
  }, [])

  const get = useCallback((op: ProgressOp): ProgressState => progress[op] ?? EMPTY, [progress])

  return { progress, get, reset }
}
