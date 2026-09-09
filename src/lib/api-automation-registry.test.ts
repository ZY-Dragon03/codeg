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

import {
  automationRegistryList,
  wakeCancel,
  wakeCreate,
  wakeDelete,
  wakeRearm,
  wakeUpdate,
} from "@/lib/api"
import { wakeSourceConversationId } from "@/components/automations/registry-item-utils"
import type { WakeRecord } from "@/lib/types"

/** Mirrors AutomationRegistryItem JSON from automation_registry.rs (camelCase). */
function backendRegistryWake(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    type: "wake",
    kind: "wake",
    name: "唤醒_11",
    status: "pending",
    enabled: true,
    creatorKind: "user",
    creatorId: null,
    provenance: "user",
    creator: null,
    applicable: null,
    priority: null,
    config: null,
    sourceConversationId: 42,
    targetConversationId: 42,
    target: "conversation:42",
    triggerKind: "timer_after",
    fireAt: "2026-09-09T12:01:00.000Z",
    schedule: { kind: "after", delay_ms: 60_000 },
    prompt: "check in",
    description: "one-shot wake",
    createdAt: "2026-09-09T12:00:00.000Z",
    updatedAt: "2026-09-09T12:00:00.000Z",
    error: null,
    ...overrides,
  }
}

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
    expect((wake as WakeRecord).schedule).toEqual({ kind: "after", delay_ms: 5000 })
  })

  it("normalizes camelCase registry wake rows from the backend", async () => {
    mocks.call.mockImplementation(async (method: string) => {
      if (method === "automation_registry_list") {
        return [backendRegistryWake()]
      }
      throw new Error(`unexpected method ${method}`)
    })

    const [wake] = await automationRegistryList()

    expect(wake).toMatchObject({
      id: 11,
      type: "wake",
      status: "pending",
      source_conversation_id: 42,
      target_conversation_id: 42,
      target: "conversation:42",
      error: null,
    })
    expect(wakeSourceConversationId(wake as WakeRecord)).toBe(42)
  })

  it("preserves failed wake error text from camelCase registry rows", async () => {
    mocks.call.mockImplementation(async (method: string) => {
      if (method === "automation_registry_list") {
        return [
          backendRegistryWake({
            status: "failed",
            enabled: false,
            error: "conversation not connected",
          }),
        ]
      }
      throw new Error(`unexpected method ${method}`)
    })

    const [wake] = await automationRegistryList()

    expect(wake).toMatchObject({
      status: "failed",
      error: "conversation not connected",
      target_conversation_id: 42,
    })
  })

  it("routes wake management calls with the normalized conversation id", async () => {
    mocks.call.mockImplementation(async (method: string) => {
      if (method === "automation_registry_list") {
        return [backendRegistryWake()]
      }
      if (method === "wake_cancel") return null
      if (method === "wake_delete") return null
      if (method === "wake_rearm") {
        return backendRegistryWake({ status: "pending", enabled: true })
      }
      throw new Error(`unexpected method ${method}`)
    })

    const [wake] = await automationRegistryList()
    const wakeRecord = wake as WakeRecord
    const sourceId = wakeSourceConversationId(wakeRecord)
    expect(sourceId).toBe(42)
    if (sourceId == null) throw new Error("wake source conversation missing")

    await wakeCancel(wakeRecord.id, sourceId)
    await wakeDelete(wakeRecord.id, sourceId)
    await wakeRearm(wakeRecord.id, sourceId)

    expect(mocks.call).toHaveBeenCalledWith("wake_cancel", {
      id: 11,
      sourceConversationId: 42,
    })
    expect(mocks.call).toHaveBeenCalledWith("wake_delete", {
      id: 11,
      sourceConversationId: 42,
    })
    expect(mocks.call).toHaveBeenCalledWith("wake_rearm", {
      id: 11,
      sourceConversationId: 42,
    })
  })

  it("keeps wake discriminant when registry rows include config null", async () => {
    mocks.call.mockImplementation(async (method: string) => {
      if (method === "automation_registry_list") {
        return [
          backendRegistryWake({
            id: 3,
            name: "唤醒_3",
            sourceConversationId: 9,
            targetConversationId: 9,
            target: "conversation:9",
            triggerKind: "timer_at",
            fireAt: "2026-09-08T12:00:00.000Z",
            schedule: { kind: "at", at: "2026-09-08T12:00:00.000Z" },
          }),
        ]
      }
      throw new Error(`unexpected method ${method}`)
    })

    const [wake] = await automationRegistryList()

    expect(wake).toMatchObject({
      id: 3,
      type: "wake",
      status: "pending",
      target_conversation_id: 9,
    })
  })

  it("uses the persisted source conversation when target aliases disagree", async () => {
    mocks.call.mockImplementation(async (method: string) => {
      if (method === "automation_registry_list") {
        return [
          backendRegistryWake({
            sourceConversationId: 42,
            targetConversationId: 99,
            target: "conversation:99",
          }),
        ]
      }
      throw new Error(`unexpected method ${method}`)
    })

    const [wake] = await automationRegistryList()

    expect((wake as WakeRecord).source_conversation_id).toBe(42)
    expect(wakeSourceConversationId(wake as WakeRecord)).toBe(42)
  })

  it("normalizes direct wake CRUD rows and keeps the persisted owner on update", async () => {
    mocks.call.mockImplementation(async (method: string, args?: Record<string, unknown>) => {
      if (method === "wake_create" || method === "wake_update") {
        expect(args?.draft).toMatchObject({ sourceConversationId: 42 })
        if (method === "wake_update") {
          expect(args?.sourceConversationId).toBe(42)
        }
        return {
          id: 21,
          source_conversation_id: 42,
          trigger_kind: "timer_after",
          fire_at: "2026-09-09T12:01:00.000Z",
          delay_ms: 60_000,
          prompt: "check in",
          status: "pending",
          created_at: "2026-09-09T12:00:00.000Z",
          updated_at: "2026-09-09T12:00:00.000Z",
        }
      }
      throw new Error(`unexpected method ${method}`)
    })

    const draft = {
      schedule: { kind: "after" as const, delay_ms: 60_000 },
      prompt: "check in",
      target_conversation_id: 99,
    }
    const created = await wakeCreate(draft, 42)
    const updated = await wakeUpdate(21, draft, 42)

    expect(created.source_conversation_id).toBe(42)
    expect(created.target_conversation_id).toBe(42)
    expect(updated.source_conversation_id).toBe(42)

    await wakeCreate({ ...draft, prompt: "  \n  " }, 42)
    expect(mocks.call).toHaveBeenLastCalledWith("wake_create", {
      draft: expect.objectContaining({
        sourceConversationId: 42,
        prompt: "继续",
      }),
    })
  })
})
