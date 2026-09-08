/** Shared parsing for wake rows returned by automation_registry_list (camelCase)
 * and legacy wake_list (snake_case). */

export type WakeWireFields = {
  target_conversation_id?: number | null
  targetConversationId?: number | null
  source_conversation_id?: number | null
  sourceConversationId?: number | null
  target?: string | null
}

export function parseConversationTarget(
  target: string | null | undefined
): number | null {
  if (!target) return null
  const match = /^conversation:(\d+)$/.exec(target.trim())
  if (!match) return null
  const id = Number(match[1])
  return Number.isFinite(id) && id > 0 ? id : null
}

export function resolveWakeConversationId(
  raw: WakeWireFields
): number | null {
  const direct =
    raw.target_conversation_id ??
    raw.targetConversationId ??
    raw.source_conversation_id ??
    raw.sourceConversationId ??
    null
  if (direct != null && direct > 0) return direct
  return parseConversationTarget(raw.target)
}
