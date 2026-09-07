import type {
  AutomationRegistryEventRule,
  AutomationRegistryItem,
  WakeRecord,
  WakeSchedule,
} from "@/lib/types"
import { formatClientTimezone } from "./wake-editor-utils"

export type RegistryItemKind = "event_rule" | "wake"

/** Prefer explicit backend discriminant; fall back only for legacy payloads. */
export function resolveRegistryItemKind(
  item: AutomationRegistryItem
): RegistryItemKind {
  if (item.type === "wake") return "wake"
  if (item.type === "event_rule") return "event_rule"

  const legacy = item as AutomationRegistryItem & {
    kind?: string
    trigger_kind?: string | null
    schedule?: WakeSchedule | null
    config?: AutomationRegistryEventRule["config"] | null
  }

  if (legacy.kind === "wake" || legacy.trigger_kind) return "wake"
  if (legacy.schedule && !legacy.config?.scope) return "wake"
  if (legacy.config?.scope) return "event_rule"
  return "event_rule"
}

export function isRegistryEventRule(
  item: AutomationRegistryItem
): item is AutomationRegistryEventRule {
  return resolveRegistryItemKind(item) === "event_rule"
}

export function isRegistryWake(
  item: AutomationRegistryItem
): item is WakeRecord & { type?: "wake" } {
  return resolveRegistryItemKind(item) === "wake"
}

export function isWakePending(wake: WakeRecord): boolean {
  if (wake.status === "pending" || wake.status === "dispatching") return true
  return wake.enabled && wake.status != "sent" && wake.status != "failed" && wake.status != "cancelled"
}

export function isWakeTerminal(wake: WakeRecord): boolean {
  return (
    wake.status === "sent" ||
    wake.status === "failed" ||
    wake.status === "cancelled" ||
    (!wake.enabled &&
      wake.status != null &&
      wake.status !== "pending" &&
      wake.status !== "dispatching")
  )
}

export function wakeScheduleDescription(
  wake: WakeRecord,
  locale?: string
): string {
  const schedule = wake.schedule
  if (schedule.kind === "after") {
    return `after ${Math.round(schedule.delay_ms / 1000)}s`
  }
  if (schedule.kind === "at") {
    const when = new Date(schedule.at)
    const { timeZone, offsetLabel } = formatClientTimezone()
    return `${when.toLocaleString(locale)} (${timeZone} ${offsetLabel})`
  }
  return "when a Codeg terminal task exits"
}

export function wakeSourceConversationId(wake: WakeRecord): number | null {
  return wake.target_conversation_id ?? null
}
