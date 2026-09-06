import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
}))

vi.mock("@/lib/transport", () => ({
  getTransport: () => ({ call: mocks.call }),
  getShellTransport: () => ({ call: vi.fn() }),
  isDesktop: () => false,
  isRemoteDesktopMode: () => false,
  getActiveRemoteConnectionId: () => null,
  notifyRemoteDesktopUnauthorized: vi.fn(),
}))

import { automationRegistryList } from "@/lib/api"

describe("automationRegistryList compatibility", () => {
  beforeEach(() => {
    mocks.call.mockReset()
  })

  it("normalizes legacy wake_list rows before the registry panel consumes them", async () => {
    mocks.call.mockImplementation(async (method: string) => {
      if (method === "automation_registry_list") throw new Error("method unavailable")
      if (method === "event_rule_list") return []
      if (method === "wake_list") {
        return [{
          id: 17,
          source_conversation_id: 42,
          creator_kind: "agent",
          creator_id: "connection-42",
          trigger_kind: "timer_after",
          fire_at: "2026-09-06T12:00:05.000Z",
          prompt: "WAKE",
          status: "pending",
          created_at: "2026-09-06T12:00:00.000Z",
          updated_at: "2026-09-06T12:00:00.000Z",
        }]
      }
      throw new Error(`unexpected method ${method}`)
    })

    const [wake] = await automationRegistryList()

    expect(wake).toMatchObject({
      id: 17,
      type: "wake",
      name: "WAKE",
      enabled: true,
      provenance: "agent",
      creator: "agent:connection-42",
      target: "conversation:42",
      target_conversation_id: 42,
    })
    expect(wake.schedule).toEqual({ kind: "after", delay_ms: 5000 })
  })
})
