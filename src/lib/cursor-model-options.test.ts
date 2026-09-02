import { describe, expect, it } from "vitest"

import type { SessionConfigOptionInfo } from "@/lib/types"
import {
  cursorCliModelId,
  effectiveModelConfigValue,
  isComposerModelId,
  isEffortConfigOption,
  shouldShowConfigOptionForModel,
} from "./cursor-model-options"

function selectOption(
  id: string,
  name: string,
  current: string,
  extras: Partial<SessionConfigOptionInfo> = {}
): SessionConfigOptionInfo {
  return {
    id,
    name,
    description: null,
    category: extras.category ?? null,
    kind: {
      type: "select",
      current_value: current,
      options: [{ value: current, name: current, description: null }],
      groups: [],
    },
  }
}

describe("cursor-model-options", () => {
  it("treats Composer family ids as Composer", () => {
    expect(isComposerModelId("composer-2.5")).toBe(true)
    expect(isComposerModelId("grok-composer-2.5-fast")).toBe(true)
    expect(isComposerModelId("grok-4.6")).toBe(false)
  })

  it("strips Cursor parameterized suffixes", () => {
    expect(cursorCliModelId("composer-2.5[fast=true]")).toBe("composer-2.5")
    expect(cursorCliModelId("grok-4.6")).toBe("grok-4.6")
    expect(cursorCliModelId("  ")).toBeNull()
  })

  it("prefers the saved model override over the probe default", () => {
    const options = [
      selectOption("model", "Model", "grok-4.6", { category: "model" }),
      selectOption("effort", "Effort", "medium"),
    ]
    expect(effectiveModelConfigValue(options, { model: "composer-2.5" })).toBe(
      "composer-2.5"
    )
    expect(effectiveModelConfigValue(options, {})).toBe("grok-4.6")
  })

  it("hides Effort when the effective model is Composer", () => {
    const effort = selectOption("effort", "Effort", "medium")
    const fast = selectOption("fast", "Fast", "false")
    expect(isEffortConfigOption(effort)).toBe(true)
    expect(isEffortConfigOption(fast)).toBe(false)
    expect(shouldShowConfigOptionForModel(effort, "composer-2.5")).toBe(false)
    expect(shouldShowConfigOptionForModel(fast, "composer-2.5")).toBe(true)
    expect(shouldShowConfigOptionForModel(effort, "grok-4.6")).toBe(true)
  })
})
