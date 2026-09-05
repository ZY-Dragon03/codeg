import { type ReactElement } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import zhCN from "@/i18n/messages/zh-CN.json"
import type { EventRule, EventRuleLog } from "@/lib/types"
import { EventAutomationsPanel } from "./event-automations-panel"

const h = vi.hoisted(() => ({
  eventRuleList: vi.fn(),
  eventRuleListLogs: vi.fn(),
  eventRuleCreate: vi.fn(),
  eventRuleValidate: vi.fn(),
  listAllConversations: vi.fn(),
  eventRuleDelete: vi.fn(),
  eventRuleSetEnabled: vi.fn(),
  eventRuleUpdate: vi.fn(),
}))

vi.mock("@/lib/api", () => h)
vi.mock("@/lib/platform", () => ({
  onTransportReconnect: () => undefined,
}))
vi.mock("@/stores/app-workspace-store", () => {
  const state = {
    allFolders: [
      {
        id: 8,
        name: "codeg",
        alias: "Codeg",
        path: "F:/AI_PROJECTS/codeg",
      },
    ],
  }
  const useStore = (selector: (value: typeof state) => unknown) =>
    selector(state)
  return { useAppWorkspaceStore: useStore }
})

const CONVERSATION = {
  id: 41,
  folder_id: 8,
  title: "当前会话",
  title_locked: false,
  agent_type: "claude_code",
  status: "active",
  kind: "regular",
  model: null,
  git_branch: null,
  external_id: null,
  message_count: 2,
  child_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  pinned_at: null,
} as const

const RULE: EventRule = {
  id: 7,
  name: "network resume",
  builtin_key: "retriable_error_auto_resume",
  enabled: true,
  priority: 0,
  config: {
    scope: { kind: "global" },
    trigger: "turn_failed",
    condition: {
      kind: "contains",
      match_mode: "any",
      text_contains: ["TLS"],
    },
    action: {
      kind: "send_to_conversation",
      conversation_ref: "source_conversation",
      prompt: "Continue",
    },
    guard: { max_attempts: 3, cooldown_ms: 5000 },
  },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

function withIntl(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="zh-CN" messages={zhCN}>
      {ui}
    </NextIntlClientProvider>
  )
}

describe("EventAutomationsPanel product surface", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.eventRuleList.mockResolvedValue([])
    h.eventRuleListLogs.mockResolvedValue({ items: [], next_cursor: null })
    h.listAllConversations.mockResolvedValue([CONVERSATION])
    h.eventRuleValidate.mockResolvedValue(undefined)
    h.eventRuleCreate.mockResolvedValue(RULE)
    h.eventRuleSetEnabled.mockResolvedValue(undefined)
    h.eventRuleUpdate.mockResolvedValue(RULE)
    h.eventRuleDelete.mockResolvedValue(undefined)
  })

  it("renders the Chinese workflow without implementation labels", async () => {
    render(withIntl(<EventAutomationsPanel />))

    expect(
      await screen.findByText(zhCN.EventAutomations.title)
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: zhCN.EventAutomations.newRule })
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        /Event Automation|turn_failed|send_to_conversation|Guard|Execution logs/i
      )
    ).not.toBeInTheDocument()
  })

  it("creates a conversation-scoped rule from the current conversation", async () => {
    render(
      withIntl(
        <EventAutomationsPanel conversationId={CONVERSATION.id} folderId={8} />
      )
    )

    await waitFor(() => expect(h.eventRuleList).toHaveBeenCalled())
    fireEvent.click(
      screen.getByRole("button", { name: zhCN.EventAutomations.newRule })
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(zhCN.EventAutomations.editor.advanced),
      })
    )
    fireEvent.click(
      screen.getByRole("button", { name: zhCN.EventAutomations.editor.save })
    )

    await waitFor(() => expect(h.eventRuleCreate).toHaveBeenCalled())
    expect(h.eventRuleCreate.mock.calls[0][0].config.scope).toEqual({
      kind: "conversation",
      conversation_id: CONVERSATION.id,
    })
  })

  it("maps built-in run history to user language and hides raw status values", async () => {
    const log: EventRuleLog = {
      id: 11,
      rule_id: RULE.id,
      source_conversation_id: CONVERSATION.id,
      status: "skipped",
      detail: null,
      resolved_target_id: CONVERSATION.id,
      trigger: "turn_failed",
      action: "send_to_conversation",
      prompt_snapshot: "Continue",
      guard_reason: "skipped_max_attempts",
      created_at: "2026-01-01T00:00:00Z",
    }
    h.eventRuleList.mockResolvedValue([RULE])
    h.eventRuleListLogs.mockResolvedValue({ items: [log], next_cursor: null })
    render(withIntl(<EventAutomationsPanel conversationId={41} />))

    expect(
      await screen.findByText(zhCN.EventAutomations.builtin.badge)
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getAllByRole("button", { name: /网络错误后自动继续/ })[0]
    )
    expect(
      await screen.findByText(zhCN.EventAutomations.logs.skipped)
    ).toBeInTheDocument()
    expect(screen.queryByText("skipped_max_attempts")).not.toBeInTheDocument()
  })
})
