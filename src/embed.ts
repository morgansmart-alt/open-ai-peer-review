const SOURCE = "open-ai-peer-review"

/** Tell a parent frame how tall the page is, so an iframe can grow with the board. */
export function startEmbedResize(): void {
  if (window.parent === window) return
  document.documentElement.classList.add("embedded")

  const send = () => {
    const root = document.getElementById("root")
    const height = Math.ceil(root?.getBoundingClientRect().height ?? document.documentElement.scrollHeight)
    window.parent.postMessage({ source: SOURCE, type: "air-embed-height", height }, "*")
  }

  let frame = 0
  const schedule = () => {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      send()
    })
  }

  const root = document.getElementById("root")
  if (root) new ResizeObserver(schedule).observe(root)
  window.addEventListener("load", schedule)
  document.fonts?.ready.then(schedule).catch(() => undefined)
  schedule()
}
