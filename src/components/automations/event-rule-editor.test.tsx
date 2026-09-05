import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { eventRulePreview, eventRuleValidate } from "@/lib/api"
import type { DbConversationSummary, EventRuleDraft } from "@/lib/types"
import { EventRuleEditor, newEventRuleDraft } from "./event-rule-editor"

vi.mock("@/lib/api", () => ({
  eventRulePreview: vi.fn(),
  eventRuleValidate: vi.fn(),
}))

const CONVERSATIONS: DbConversationSummary[] = [
  {
    id: 41,
    folder_id: 8,
    title: "Current conversation",
    title_locked: false,
    agent_type: "claude_code",
    status: "active",
    kind: "regular",
    model: null,
    git_branch: null,
    external_id: null,
    message_count: 3,
    child_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    pinned_at: null,
  },
]

describe("EventRuleEditor", () => {
  beforeEach(() => vi.clearAllMocks())

  it("keeps editable keyword and prompt data in the saved draft", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <EventRuleEditor
        initialScope={{ kind: "conversation", conversation_id: 41 }}
        conversations={CONVERSATIONS}
        onSubmit={onSubmit}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Add keyword" }))
    fireEvent.change(screen.getByLabelText("Keyword 4"), {
      target: { value: "MY_CUSTOM_ERROR_123" },
    })
    fireEvent.change(screen.getByLabelText("Follow-up prompt"), {
      target: { value: "resume from the interruption" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }))

    await waitFor(() => expect(eventRuleValidate).toHaveBeenCalledTimes(1))
    const draft = onSubmit.mock.calls[0]?.[0] as EventRuleDraft
    expect(draft.config.scope).toEqual({
      kind: "conversation",
      conversation_id: 41,
    })
    expect(draft.config.condition.text_contains).toContain(
      "MY_CUSTOM_ERROR_123"
    )
    expect(draft.config.action.prompt).toBe("resume from the interruption")
  })

  it("uses backend preview without saving or sending", async () => {
    vi.mocked(eventRulePreview).mockResolvedValue({
      scope_matches: true,
      condition_matches: true,
      resolved_target_id: 41,
      target_exists: true,
      target_available: true,
      winner_rule_id: null,
      draft_is_winner: true,
      draft_is_shadowed: false,
      shadowed_rule_ids: [],
      guard_blocked: null,
    })
    render(
      <EventRuleEditor
        initialScope={{ kind: "conversation", conversation_id: 41 }}
        conversations={CONVERSATIONS}
        onSubmit={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText("Failed event text"), {
      target: { value: "TLS connection reset" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Preview without sending" })
    )
    await waitFor(() => expect(eventRulePreview).toHaveBeenCalledTimes(1))
    expect(eventRuleValidate).not.toHaveBeenCalled()
    expect(
      screen.getByText("This rule wins first-match ordering.")
    ).toBeInTheDocument()
  })

  it("starts the built-in-like draft disabled with the editable retry defaults", () => {
    const draft = newEventRuleDraft()
    expect(draft.enabled).toBe(false)
    expect(draft.config.guard).toEqual({ max_attempts: 3, cooldown_ms: 5000 })
    expect(draft.config.condition.text_contains).toContain("TLS")
  })

  it("renders structured backend validation errors instead of object text", async () => {
    vi.mocked(eventRuleValidate).mockRejectedValue({
      code: "validation",
      message: "invalid event rule",
      detail: "invalid regex: unclosed character class",
    })
    render(<EventRuleEditor conversations={CONVERSATIONS} onSubmit={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Save rule" }))

    expect(
      await screen.findByText("invalid regex: unclosed character class")
    ).toBeInTheDocument()
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument()
  })
})
