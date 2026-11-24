import { formatBytes, isImageFile, isTextualFile, type ZenodoFile } from "../services/zenodo.ts"

export function FilePicker({
  files,
  selected,
  onChange,
  disabled = false,
  compact = false,
  className = "",
  legend = "Files to read",
  hint = "The main manuscript comes first, then supplements, other PDFs, and text sources, while they fit under 12 files and 8 MB. A zip is ticked when it still fits, and text, code, and markdown inside it are read. Images are figures not read.",
  includeCodeData = true,
  onIncludeCodeData,
}: {
  files: ZenodoFile[]
  selected: readonly string[]
  onChange: (keys: string[]) => void
  disabled?: boolean
  compact?: boolean
  className?: string
  legend?: string
  hint?: string
  includeCodeData?: boolean
  onIncludeCodeData?: (include: boolean) => void
}) {
  const chosen = files.filter((file) => selected.includes(file.key))
  const bytes = chosen.reduce((total, file) => total + file.size, 0)
  const images = files.filter((file) => isImageFile(file))
  return (
    <fieldset className={`file-fieldset ${className}`.trim()} disabled={disabled}>
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="mt-1 text-xs text-ink-soft">{hint}</p>
      {onIncludeCodeData && (
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={includeCodeData}
            onChange={(event) => onIncludeCodeData(event.target.checked)}
          />
          <span>
            Include deposited code and data
            <span className="mt-0.5 block text-xs text-ink-soft">
              Zips, code, and data files are ticked when they still fit under 12 files and 8 MB. Text and code inside a zip are read. Turn this off to keep the manuscript only.
            </span>
          </span>
        </label>
      )}
      {images.length > 0 && (
        <p className="mt-2 text-xs text-ink">
          Figures not read. {images.length === 1 ? "One image file is" : `${images.length} image files are`} on this record and{" "}
          {images.length === 1 ? "is" : "are"} not scored as pictures. Captions and alt text from a PDF are included when the file exposes them.
        </p>
      )}
      <p className="mt-1 text-xs font-medium text-ink">
        {chosen.length} of {files.length} files · {formatBytes(bytes)} selected
      </p>
      <div className={compact ? "file-scroll file-scroll-compact mt-2" : "file-scroll mt-2"}>
        <ul className="space-y-1 text-sm">
          {files.map((file) => {
            const textual = isTextualFile(file)
            return (
              <li key={file.key}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    disabled={!textual}
                    checked={selected.includes(file.key)}
                    onChange={(event) => onChange(event.target.checked ? [...selected, file.key] : selected.filter((key) => key !== file.key))}
                  />
                  <span className="min-w-0 break-words">
                    {file.key}{" "}
                    <span className="text-ink-soft">
                      · {file.size > 0 ? formatBytes(file.size) : "size unknown"}
                      {isImageFile(file) ? " · figures not read" : textual ? "" : " · not read as text"}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </fieldset>
  )
}
