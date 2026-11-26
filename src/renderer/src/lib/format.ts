const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  // Whole bytes need no decimals; larger units show one decimal below 10.
  const digits = unit === 0 || value >= 10 ? 0 : 1
  return `${value.toFixed(digits)} ${UNITS[unit]}`
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'Unknown'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** "Nov 26, 9:10 PM". The year is added only when it is not the current one. */
export function formatDateTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Unknown'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown'
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit'
  })
}

/** "+1.2 GB" or "−300 MB". Uses a real minus sign. */
export function formatDelta(bytes: number): string {
  return `${bytes < 0 ? '−' : '+'}${formatBytes(Math.abs(bytes))}`
}

/** Shortens a long path in the middle so both the drive and the folder name stay visible. */
export function shortenPath(path: string, max = 60): string {
  if (path.length <= max) return path
  const keep = max - 1
  const head = Math.ceil(keep * 0.4)
  const tail = keep - head
  return `${path.slice(0, head)}…${path.slice(path.length - tail)}`
}
