import * as React from 'react'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (color: string) => void
  description?: string
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  label,
  value,
  onChange,
  description
}) => {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="flex items-center gap-3">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-2 flex-1">
          <div
            className="h-8 w-8 rounded-lg border border-slate-200 shadow-sm flex-shrink-0"
            style={{ backgroundColor: value }}
          />
          <input
            type="text"
            value={value}
            onChange={(e) => {
              const hex = e.target.value
              if (/^#[0-9A-Fa-f]{0,6}$/.test(hex)) {
                onChange(hex)
              }
            }}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            placeholder="#000000"
            maxLength={7}
          />
        </div>
      </div>
      {description && (
        <p className="text-xs text-slate-400">{description}</p>
      )}
    </div>
  )
}
