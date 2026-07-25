import * as React from 'react'

interface ImageUploadProps {
  label: string
  currentPath?: string | null
  accept?: string
  onUpload: () => Promise<{ path: string } | null>
  onPathChange?: (path: string) => void
  description?: string
  preview?: boolean
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  label,
  currentPath,
  onUpload,
  onPathChange,
  description,
  preview = true
}) => {
  const [isUploading, setIsUploading] = React.useState(false)

  const handleUpload = async () => {
    setIsUploading(true)
    try {
      const result = await onUpload()
      if (result && onPathChange) {
        onPathChange(result.path)
      }
    } finally {
      setIsUploading(false)
    }
  }

  const previewUrl = currentPath
    ? currentPath.startsWith('http') || currentPath.startsWith('data:')
      ? currentPath
      : `asset://${currentPath}`
    : null

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{label}</label>

      <div className="flex items-center gap-4">
        {/* Preview thumbnail */}
        {preview && (
          <div className="h-16 w-16 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="h-full w-full object-contain"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <span className="text-2xl text-slate-300">🖼️</span>
            )}
          </div>
        )}

        <div className="flex-1 space-y-2">
          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <span className="animate-spin inline-block w-3 h-3 border-2 border-slate-300 border-t-primary rounded-full" />
                <span>جاري الرفع... / Uploading...</span>
              </>
            ) : (
              <>
                <span>📁</span>
                <span>اختر ملف / Browse</span>
              </>
            )}
          </button>

          {currentPath && (
            <p className="text-xs text-slate-400 font-mono truncate max-w-xs">
              📌 {currentPath.split('/').pop()}
            </p>
          )}
        </div>
      </div>

      {description && (
        <p className="text-xs text-slate-400">{description}</p>
      )}
    </div>
  )
}
