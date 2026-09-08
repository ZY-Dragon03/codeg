import { type ReactElement } from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { eventRulePreview, eventRuleValidate } from "@/lib/api"
import type { DbConversationSummary, EventRuleDraft } from "@/lib/types"
import { EventRuleEditor, newEventRuleDraft } from "./event-rule-editor"
import enMessages from "@/i18n/messages/en.json"

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

function withIntl(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>
  )
}

describe("EventRuleEditor", () => {
  beforeEach(() => vi.clearAllMocks())

  it("keeps editable keyword and prompt data in the saved draft", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      withIntl(
        <EventRuleEditor
          initialScope={{ kind: "conversation", conversation_id: 41 }}
          conversations={CONVERSATIONS}
          onSubmit={onSubmit}
        />
      )
    )

    fireEvent.click(screen.getByRole("button", { name: "Add keyword" }))
    fireEvent.change(screen.getByLabelText("Keyword 4"), {
      target: { value: "MY_CUSTOM_ERROR_123" },
    })
    fireEvent.change(screen.getByLabelText("Message to send"), {
      target: { value: "resume from the interruption" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

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
      withIntl(
        <EventRuleEditor
          initialScope={{ kind: "conversation", conversation_id: 41 }}
          conversations={CONVERSATIONS}
          onSubmit={vi.fn()}
        />
      )
    )
    fireEvent.click(screen.getByRole("button", { name: /Test match/ }))
    fireEvent.change(screen.getByLabelText("Sample content to test"), {
      target: { value: "TLS connection reset" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Run match test" }))
    await waitFor(() => expect(eventRulePreview).toHaveBeenCalledTimes(1))
    expect(eventRuleValidate).not.toHaveBeenCalled()
    expect(screen.getByText("✓ Would trigger")).toBeInTheDocument()
  })

  it("starts new automations enabled with the editable retry defaults", () => {
    const draft = newEventRuleDraft()
    expect(draft.enabled).toBe(true)
    expect(draft.config.guard).toEqual({ max_attempts: 3, cooldown_ms: 5000 })
    expect(draft.config.condition.text_contains).toContain("TLS")
    expect(draft.config.automation_type).toBe("content_detection")
    expect(draft.config.trigger).toBe("content_matched")
  })

  it("honors initialAutomationType for completion forwarding drafts", () => {
    const draft = newEventRuleDraft(undefined, {
      automationType: "forward_after_task_completion",
    })
    expect(draft.config.automation_type).toBe("forward_after_task_completion")
    expect(draft.config.trigger).toBe("turn_completed")
  })

  it("does not render an in-editor automation type switcher", () => {
    render(
      withIntl(
        <EventRuleEditor
          initialAutomationType="forward_after_task_completion"
          conversations={CONVERSATIONS}
          onSubmit={vi.fn()}
        />
      )
    )

    expect(
      screen.queryByText(enMessages.EventAutomations.editor.creationType)
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Content detection" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Forward after task completion" })
    ).not.toBeInTheDocument()
  })

  it("renders structured backend validation errors instead of object text", async () => {
    vi.mocked(eventRuleValidate).mockRejectedValue({
      code: "validation",
      message: "invalid event rule",
      detail: "invalid regex: unclosed character class",
    })
    render(
      withIntl(
        <EventRuleEditor conversations={CONVERSATIONS} onSubmit={vi.fn()} />
      )
    )

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(
      await screen.findByText("invalid regex: unclosed character class")
    ).toBeInTheDocument()
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument()
  })

  it("keeps advanced implementation settings collapsed by default", () => {
    render(
      withIntl(
        <EventRuleEditor conversations={CONVERSATIONS} onSubmit={vi.fn()} />
      )
    )

    expect(screen.queryByLabelText("Priority")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Advanced settings/ }))
    expect(screen.getByLabelText("Priority")).toBeInTheDocument()
    expect(screen.getByText("Listen in conversations")).toBeInTheDocument()
  })

  it("uses named workspace and agent selectors in advanced settings", () => {
    render(
      withIntl(
        <EventRuleEditor
          conversations={CONVERSATIONS}
          folders={[
            {
              id: 8,
              name: "codeg",
              alias: "Codeg",
              path: "F:/AI_PROJECTS/codeg",
            },
          ]}
          onSubmit={vi.fn()}
        />
      )
    )

    fireEvent.click(screen.getByRole("button", { name: /Advanced settings/ }))
    const listenSection = screen.getByText("Listen in conversations").closest(
      "div.grid"
    )!
    fireEvent.click(within(listenSection).getByRole("combobox"))
    fireEvent.click(screen.getByRole("option", { name: "Folder" }))
    const folderTrigger = screen.getByRole("button", {
      name: "Choose a folder",
    })
    fireEvent.click(folderTrigger)
    const folderOptions = screen.getAllByRole("option", { name: /Codeg/ })
    fireEvent.click(folderOptions[folderOptions.length - 1])
    expect(screen.getByRole("button", { name: /Codeg/ })).toBeInTheDocument()
  })

  it("hides keyword matching when the error content source is selected", () => {
    render(
      withIntl(
        <EventRuleEditor
          initialScope={{ kind: "conversation", conversation_id: 41 }}
          conversations={CONVERSATIONS}
          onSubmit={vi.fn()}
        />
      )
    )

    fireEvent.click(screen.getByRole("button", { name: "Errors" }))
    expect(screen.queryByLabelText("Keyword 1")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Error type")).toBeInTheDocument()
  })

  it("does not show match testing for completion forwarding", () => {
    render(
      withIntl(
        <EventRuleEditor
          initialAutomationType="forward_after_task_completion"
          conversations={CONVERSATIONS}
          onSubmit={vi.fn()}
        />
      )
    )

    expect(screen.queryByRole("button", { name: /Test match/ })).not.toBeInTheDocument()
    expect(screen.queryByText("Error message contains")).not.toBeInTheDocument()
  })
})
