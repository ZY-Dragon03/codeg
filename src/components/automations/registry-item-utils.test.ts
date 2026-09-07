import { describe, expect, it } from "vitest"
import {
  isRegistryEventRule,
  isRegistryWake,
  isWakePending,
  isWakeTerminal,
  resolveRegistryItemKind,
} from "./registry-item-utils"
import type { AutomationRegistryItem } from "@/lib/types"

describe("registry-item-utils", () => {
  it("prefers explicit wake type even when config is null", () => {
    const item = {
      id: 1,
      type: "wake",
      name: "唤醒_1",
      enabled: true,
      status: "pending",
      config: null,
      schedule: { kind: "after", delay_ms: 30_000 },
      target_conversation_id: 42,
    } as AutomationRegistryItem

    expect(resolveRegistryItemKind(item)).toBe("wake")
    expect(isRegistryWake(item)).toBe(true)
    expect(isRegistryEventRule(item)).toBe(false)
  })

  it("classifies legacy wake rows without type", () => {
    const item = {
      id: 2,
      trigger_kind: "timer_at",
      status: "pending",
      schedule: { kind: "at", at: "2026-09-08T12:00:00.000Z" },
    } as AutomationRegistryItem

    expect(resolveRegistryItemKind(item)).toBe("wake")
  })

  it("tracks wake lifecycle states", () => {
    expect(
      isWakePending({
        id: 1,
        name: "x",
        enabled: true,
        status: "pending",
        schedule: { kind: "after", delay_ms: 1000 },
      })
    ).toBe(true)
    expect(
      isWakeTerminal({
        id: 1,
        name: "x",
        enabled: false,
        status: "cancelled",
        schedule: { kind: "after", delay_ms: 1000 },
      })
    ).toBe(true)
  })
})
