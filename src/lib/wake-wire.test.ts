import { describe, expect, it } from "vitest"
import {
  parseConversationTarget,
  resolveWakeConversationId,
} from "@/lib/wake-wire"

describe("wake-wire", () => {
  it("parses conversation targets from registry target strings", () => {
    expect(parseConversationTarget("conversation:42")).toBe(42)
    expect(parseConversationTarget(" agent:7 ")).toBeNull()
    expect(parseConversationTarget(null)).toBeNull()
  })

  it("prefers explicit ids over target string fallbacks", () => {
    expect(
      resolveWakeConversationId({
        targetConversationId: 9,
        target: "conversation:42",
      })
    ).toBe(9)
  })

  it("reads camelCase registry conversation ids", () => {
    expect(
      resolveWakeConversationId({
        targetConversationId: 17,
      })
    ).toBe(17)
  })

  it("reads snake_case wake_list conversation ids", () => {
    expect(
      resolveWakeConversationId({
        source_conversation_id: 5,
      })
    ).toBe(5)
  })

  it("falls back to target when ids are absent", () => {
    expect(
      resolveWakeConversationId({
        target: "conversation:88",
      })
    ).toBe(88)
  })
})
