import type { TerminalInfo } from "@/lib/types"

export type DelayUnit = "seconds" | "minutes" | "hours"
export type ProcessKindFilter =
  | "all"
  | "python"
  | "node"
  | "shell"
  | "rust"
  | "other"

const MS_PER_SECOND = 1000
const MS_PER_MINUTE = 60 * MS_PER_SECOND
const MS_PER_HOUR = 60 * MS_PER_MINUTE

export function delayToMs(amount: number, unit: DelayUnit): number {
  if (unit === "minutes") return amount * MS_PER_MINUTE
  if (unit === "hours") return amount * MS_PER_HOUR
  return amount * MS_PER_SECOND
}

export function msToDelayParts(ms: number): { amount: number; unit: DelayUnit } {
  const safe = Math.max(1, Math.round(ms))
  if (safe % MS_PER_HOUR === 0 && safe >= MS_PER_HOUR) {
    return { amount: safe / MS_PER_HOUR, unit: "hours" }
  }
  if (safe % MS_PER_MINUTE === 0 && safe >= MS_PER_MINUTE) {
    return { amount: safe / MS_PER_MINUTE, unit: "minutes" }
  }
  return { amount: Math.max(1, Math.round(safe / MS_PER_SECOND)), unit: "seconds" }
}

export function formatClientTimezone(): {
  timeZone: string
  offsetLabel: string
} {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  const offsetMinutes = -new Date().getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? "+" : "-"
  const abs = Math.abs(offsetMinutes)
  const hours = String(Math.floor(abs / 60)).padStart(2, "0")
  const minutes = String(abs % 60).padStart(2, "0")
  return {
    timeZone,
    offsetLabel: `UTC${sign}${hours}:${minutes}`,
  }
}

export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function parseDatetimeLocalToIso(value: string): string {
  const date = new Date(value)
  return date.toISOString()
}

export function classifyProcessKind(
  command: string | null | undefined,
  shell: string | null | undefined
): Exclude<ProcessKindFilter, "all"> {
  const haystack = `${command ?? ""} ${shell ?? ""}`.toLowerCase()
  if (/\bpython(?:3)?\b|\.py\b/.test(haystack)) return "python"
  if (/\bnode\b|\bnpm\b|\bpnpm\b|\byarn\b|\bbun\b|\.js\b/.test(haystack)) {
    return "node"
  }
  if (/\bcargo\b|\brustc\b/.test(haystack)) return "rust"
  if (
    /\b(bash|zsh|sh|fish|powershell|pwsh|cmd)\b/.test(haystack) ||
    (!command?.trim() && shell?.trim())
  ) {
    return "shell"
  }
  return "other"
}

export function terminalPrimaryLabel(terminal: TerminalInfo): string {
  const command = terminal.initial_command?.trim()
  if (command) {
    const firstLine = command.split(/\r?\n/)[0]?.trim()
    if (firstLine) return firstLine
  }
  const title = terminal.title?.trim()
  if (title && title !== "Terminal") return title
  const shell = terminal.shell?.trim()
  if (shell) return shell
  return terminal.id
}

export function terminalSearchText(terminal: TerminalInfo): string {
  return [
    terminal.id,
    terminal.title,
    terminal.initial_command,
    terminal.shell,
    terminal.working_dir,
    terminal.owner_window_label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

export function formatStartedAt(
  iso: string | null | undefined,
  locale?: string
): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
}

export function isAutoWakeName(name: string, wakeId?: number): boolean {
  const trimmed = name.trim()
  if (!trimmed) return true
  if (wakeId != null && trimmed === `唤醒_${wakeId}`) return true
  return /^唤醒_\d+$/.test(trimmed)
}

export function matchesProcessKindFilter(
  terminal: TerminalInfo,
  filter: ProcessKindFilter
): boolean {
  if (filter === "all") return true
  return (
    classifyProcessKind(terminal.initial_command, terminal.shell) === filter
  )
}

export function matchesTerminalSearch(
  terminal: TerminalInfo,
  query: string,
  conversationTitle?: string | null
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = `${terminalSearchText(terminal)} ${conversationTitle ?? ""}`
    .toLowerCase()
    .trim()
  return haystack.includes(needle)
}

export function sortTerminalsForWake(
  terminals: TerminalInfo[],
  preferredFolderPath?: string | null
): TerminalInfo[] {
  const normalizedPath = preferredFolderPath?.replace(/\\/g, "/").toLowerCase()
  return [...terminals].sort((left, right) => {
    const leftPreferred =
      normalizedPath &&
      left.working_dir?.replace(/\\/g, "/").toLowerCase().startsWith(normalizedPath)
    const rightPreferred =
      normalizedPath &&
      right.working_dir?.replace(/\\/g, "/").toLowerCase().startsWith(normalizedPath)
    if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1
    const leftCreated = left.created_at ? Date.parse(left.created_at) : 0
    const rightCreated = right.created_at ? Date.parse(right.created_at) : 0
    return rightCreated - leftCreated
  })
}

export type WakeValidationErrorKey =
  | "delayRequired"
  | "delayPositive"
  | "scheduledRequired"
  | "scheduledPast"
  | "processRequired"
  | "promptRequired"

export function validateWakeDraft(input: {
  kind: "after" | "at" | "process_exit"
  delayAmount: string
  scheduledAt: string
  processTerminalId: string
  prompt: string
  now?: Date
}): WakeValidationErrorKey | null {
  if (!input.prompt.trim()) return "promptRequired"
  if (input.kind === "after") {
    const amount = Number(input.delayAmount)
    if (!input.delayAmount.trim()) return "delayRequired"
    if (!Number.isFinite(amount) || amount <= 0) return "delayPositive"
    return null
  }
  if (input.kind === "at") {
    if (!input.scheduledAt.trim()) return "scheduledRequired"
    const when = new Date(input.scheduledAt)
    if (Number.isNaN(when.getTime())) return "scheduledRequired"
    const now = input.now ?? new Date()
    if (when.getTime() <= now.getTime()) return "scheduledPast"
    return null
  }
  if (!input.processTerminalId.trim()) return "processRequired"
  return null
}
