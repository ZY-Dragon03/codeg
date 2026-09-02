import type { SessionConfigOptionInfo } from "@/lib/types"

export function isComposerModelId(modelId: string | null | undefined): boolean {
  return (modelId ?? "").toLowerCase().includes("composer")
}

export function cursorCliModelId(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return null
  const base = trimmed.split("[")[0]?.trim() ?? ""
  return base || null
}

export function isEffortConfigOption(option: SessionConfigOptionInfo): boolean {
  const id = option.id.toLowerCase()
  const category = (option.category ?? "").toLowerCase()
  const name = option.name.toLowerCase()
  return (
    id === "effort" ||
    id === "reasoning_effort" ||
    id === "thought_level" ||
    category === "thought_level" ||
    category === "effort" ||
    name === "effort"
  )
}

export function effectiveModelConfigValue(
  options: SessionConfigOptionInfo[],
  overrideConfigValues: Record<string, string>
): string | null {
  const override = cursorCliModelId(overrideConfigValues.model)
  if (override) return override
  const modelOption = options.find(
    (option) => option.id === "model" || option.category === "model"
  )
  if (!modelOption || modelOption.kind.type !== "select") return null
  return cursorCliModelId(modelOption.kind.current_value)
}

export function shouldShowConfigOptionForModel(
  option: SessionConfigOptionInfo,
  effectiveModelId: string | null
): boolean {
  if (!isEffortConfigOption(option)) return true
  return !isComposerModelId(effectiveModelId)
}
