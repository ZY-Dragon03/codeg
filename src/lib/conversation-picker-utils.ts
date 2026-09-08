import type { DbConversationSummary } from "@/lib/types"
import { compareByRecency } from "@/components/canvas/canvas-model"

function activityRank(conversation: DbConversationSummary): number {
  if (conversation.status === "in_progress") return 0
  if (conversation.status === "pending_review") return 1
  return 2
}

/** Sort conversations for automation target pickers: active first, then recency. */
export function compareForAutomationPicker(
  a: DbConversationSummary,
  b: DbConversationSummary
): number {
  const rank = activityRank(a) - activityRank(b)
  if (rank !== 0) return rank
  return compareByRecency(a, b)
}

export function sortConversationsForAutomationPicker(
  conversations: readonly DbConversationSummary[]
): DbConversationSummary[] {
  return [...conversations].sort(compareForAutomationPicker)
}

export function conversationPickerSearchValue(
  conversation: DbConversationSummary,
  formatTitle: (title: string | null) => string,
  agentLabel: string,
  folderLabel?: string | null
): string {
  return [
    formatTitle(conversation.title),
    agentLabel,
    folderLabel ?? "",
    String(conversation.id),
  ]
    .join(" ")
    .toLowerCase()
}
