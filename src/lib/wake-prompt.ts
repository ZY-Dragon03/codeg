const DEFAULT_WAKE_PROMPT = "继续"

/** Normalize a user-authored wake message to the product default. */
export function normalizeWakePrompt(prompt: string | null | undefined): string {
  const trimmed = prompt?.trim() ?? ""
  return trimmed || DEFAULT_WAKE_PROMPT
}
