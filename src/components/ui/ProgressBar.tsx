interface ProgressBarProps {
  /** 0–100 */
  percent: number
  label?: string
  /** Optional "12 / 40" style detail shown next to the percentage. */
  detail?: string
}

/**
 * Determinate progress bar with a numeric percentage, used for long-running
 * operations (push, pull, import, backup, restore) instead of a bare spinner.
 */
export function ProgressBar({ percent, label, detail }: ProgressBarProps) {
  const value = Math.min(100, Math.max(0, Math.round(percent)))
  return (
    <div className="w-full space-y-1" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex justify-between items-center text-xs text-slate-500">
        <span className="truncate">{label}</span>
        <span className="font-semibold text-slate-700 tabular-nums">
          {detail ? `${detail} · ` : ''}{value}%
        </span>
      </div>
      <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-200 ease-out"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}
