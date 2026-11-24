import { formatBytes, isTextualFile, type ZenodoFile } from "../services/zenodo.ts"

export function FilePicker({
  files,
  selected,
  onChange,
  disabled = false,
  compact = false,
  className = "",
  legend = "Files to read",
  hint = "The main manuscript comes first, then supplements, other PDFs, and text sources, while they fit under 12 files and 8 MB. A zip stays unticked. Images are not read as text.",
}: {
  files: ZenodoFile[]
  selected: readonly string[]
  onChange: (keys: string[]) => void
  disabled?: boolean
  compact?: boolean
  className?: string
  legend?: string
  hint?: string
}) {
  const chosen = files.filter((file) => selected.includes(file.key))
  const bytes = chosen.reduce((total, file) => total + file.size, 0)
  return (
    <fieldset className={`file-fieldset ${className}`.trim()} disabled={disabled}>
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="mt-1 text-xs text-ink-soft">{hint}</p>
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
                      {textual ? "" : " · not read as text"}
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
