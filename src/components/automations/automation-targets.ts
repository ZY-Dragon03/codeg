import type {
  AutomationTargetMode,
  DbConversationSummary,
  EventRuleAction,
  WakeRecord,
} from "@/lib/types"
import { sortConversationsForAutomationPicker } from "@/lib/conversation-picker-utils"

/** Keep target ids deterministic and safe to send over the wire. */
export function normalizeTargetIds(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))]
}

/** Resolve the concrete snapshot represented by a shared target picker. */
export function resolveTargetIds(
  mode: AutomationTargetMode,
  currentConversationId: number | null | undefined,
  selectedIds: readonly number[],
  conversations: readonly DbConversationSummary[]
): number[] {
  if (mode === "current") {
    return currentConversationId && currentConversationId > 0
      ? [currentConversationId]
      : []
  }
  if (mode === "all_current") {
    return normalizeTargetIds(
      sortConversationsForAutomationPicker(conversations).map(
        (conversation) => conversation.id
      )
    )
  }
  return normalizeTargetIds(selectedIds)
}

export function targetModeFromEventAction(
  action: Pick<
    EventRuleAction,
    "conversation_ref" | "conversation_id" | "target_conversation_ids"
  >
): AutomationTargetMode {
  if (action.conversation_ref === "all_current_conversations") {
    return "all_current"
  }
  if (
    action.conversation_ref === "specific_conversation" ||
    (action.target_conversation_ids?.length ?? 0) > 0
  ) {
    return "specific_multiple"
  }
  return "current"
}

export function selectedIdsFromEventAction(
  action: Pick<
    EventRuleAction,
    "conversation_ref" | "conversation_id" | "target_conversation_ids"
  >
): number[] {
  const ids = normalizeTargetIds(action.target_conversation_ids ?? [])
  if (ids.length > 0) return ids
  return action.conversation_ref === "specific_conversation" &&
    action.conversation_id &&
    action.conversation_id > 0
    ? [action.conversation_id]
    : []
}

export function targetModeFromWake(wake: Pick<WakeRecord, "target_mode" | "target_conversation_ids">): AutomationTargetMode {
  if (wake.target_mode === "all_current") return "all_current"
  if (wake.target_mode === "specific_multiple") return "specific_multiple"
  return (wake.target_conversation_ids?.length ?? 0) > 1
    ? "specific_multiple"
    : "current"
}

export function selectedIdsFromWake(
  wake: Pick<WakeRecord, "target_mode" | "target_conversation_ids" | "target_conversation_id">
): number[] {
  const ids = normalizeTargetIds(wake.target_conversation_ids ?? [])
  if (ids.length > 0) return ids
  return wake.target_mode === "specific_multiple" &&
    wake.target_conversation_id &&
    wake.target_conversation_id > 0
    ? [wake.target_conversation_id]
    : []
}
