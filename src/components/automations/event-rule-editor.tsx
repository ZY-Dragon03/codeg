"use client"

import { useMemo, useState } from "react"
import { Plus, X } from "lucide-react"
import { eventRulePreview, eventRuleValidate } from "@/lib/api"
import { toErrorMessage } from "@/lib/app-error"
import type {
  DbConversationSummary,
  EventRule,
  EventRuleDraft,
  EventRulePreview,
  EventRuleScope,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

export function newEventRuleDraft(
  scope: EventRuleScope = { kind: "global" }
): EventRuleDraft {
  return {
    name: "Retry failed turn",
    enabled: false,
    priority: 0,
    config: {
      scope,
      trigger: "turn_failed",
      condition: {
        kind: "contains",
        match_mode: "any",
        text_contains: ["RetriableError", "TLS", "connection reset"],
      },
      action: {
        kind: "send_to_conversation",
        conversation_ref: "source_conversation",
        prompt: "继续",
      },
      guard: { max_attempts: 3, cooldown_ms: 5000 },
    },
  }
}

function copyDraft(rule: EventRule | EventRuleDraft): EventRuleDraft {
  return JSON.parse(
    JSON.stringify({
      name: rule.name,
      enabled: rule.enabled,
      priority: rule.priority,
      config: rule.config,
    })
  ) as EventRuleDraft
}

function scopeValue(scope: EventRuleScope) {
  return scope.kind
}

function scopeWithKind(
  kind: EventRuleScope["kind"],
  current: EventRuleScope
): EventRuleScope {
  if (kind === "global") return { kind }
  if (kind === "conversation")
    return {
      kind,
      conversation_id: current.kind === kind ? current.conversation_id : 0,
    }
  if (kind === "folder")
    return { kind, folder_id: current.kind === kind ? current.folder_id : 0 }
  return {
    kind,
    agent_type: current.kind === kind ? current.agent_type : "claude_code",
  }
}

export function EventRuleEditor({
  rule,
  initialScope,
  conversations,
  onSubmit,
  onCancel,
}: {
  rule?: EventRule | null
  initialScope?: EventRuleScope
  conversations: DbConversationSummary[]
  onSubmit: (draft: EventRuleDraft) => Promise<void>
  onCancel?: () => void
}) {
  const [draft, setDraft] = useState<EventRuleDraft>(() =>
    rule ? copyDraft(rule) : newEventRuleDraft(initialScope)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sampleText, setSampleText] = useState("")
  const [sampleErrorKind, setSampleErrorKind] = useState("")
  const [sampleConversationId, setSampleConversationId] = useState<number>(
    initialScope?.kind === "conversation" ? initialScope.conversation_id : 0
  )
  const [preview, setPreview] = useState<EventRulePreview | null>(null)
  const scope = draft.config.scope
  const condition = draft.config.condition
  const action = draft.config.action
  const keywords = condition.text_contains ?? []
  const sortedConversations = useMemo(
    () =>
      [...conversations].sort((a, b) =>
        (a.title ?? "").localeCompare(b.title ?? "")
      ),
    [conversations]
  )

  const update = (fn: (current: EventRuleDraft) => EventRuleDraft) => {
    setDraft((current) => fn(current))
    setError(null)
    setPreview(null)
  }
  const setScope = (next: EventRuleScope) =>
    update((current) => ({
      ...current,
      config: { ...current.config, scope: next },
    }))
  const setCondition = (next: EventRuleDraft["config"]["condition"]) =>
    update((current) => ({
      ...current,
      config: { ...current.config, condition: next },
    }))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await eventRuleValidate(draft)
      await onSubmit(draft)
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }
  const runPreview = async () => {
    setError(null)
    try {
      const fallbackConversation =
        sampleConversationId ||
        (scope.kind === "conversation"
          ? scope.conversation_id
          : (conversations[0]?.id ?? 0))
      if (!fallbackConversation)
        throw new Error("Select a sample conversation first.")
      const result = await eventRulePreview(rule?.id ?? null, draft, {
        conversationId: fallbackConversation,
        text: sampleText,
        errorKind: sampleErrorKind || null,
      })
      setPreview(result)
    } catch (cause) {
      setError(toErrorMessage(cause))
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="event-rule-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Event Automation</h2>
          <p className="text-sm text-muted-foreground">
            Rules run after a failed turn has settled.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Enabled
          <Switch
            checked={draft.enabled}
            onCheckedChange={(enabled) => update((d) => ({ ...d, enabled }))}
          />
        </label>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <fieldset className="grid gap-3 border-t pt-4">
        <legend className="text-xs font-semibold tracking-wide text-muted-foreground">
          WHEN
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="event-rule-name">Rule name</Label>
            <Input
              id="event-rule-name"
              value={draft.name}
              onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Trigger</Label>
            <Input value="turn_failed" readOnly aria-label="Trigger" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Priority</Label>
            <Input
              type="number"
              value={draft.priority}
              onChange={(e) =>
                update((d) => ({ ...d, priority: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Scope</Label>
            <Select
              value={scopeValue(scope)}
              onValueChange={(value) =>
                setScope(scopeWithKind(value as EventRuleScope["kind"], scope))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="conversation">Conversation</SelectItem>
                <SelectItem value="folder">Folder</SelectItem>
                <SelectItem value="agent_type">Agent type</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {scope.kind === "conversation" ? (
          <div className="grid gap-1.5">
            <Label>Scoped conversation</Label>
            <ConversationSelect
              conversations={sortedConversations}
              value={scope.conversation_id}
              onChange={(id) =>
                setScope({ kind: "conversation", conversation_id: id })
              }
            />
          </div>
        ) : null}
        {scope.kind === "folder" ? (
          <div className="grid gap-1.5">
            <Label>Folder id</Label>
            <Input
              type="number"
              value={scope.folder_id}
              onChange={(e) =>
                setScope({
                  kind: "folder",
                  folder_id: Number(e.target.value) || 0,
                })
              }
            />
          </div>
        ) : null}
        {scope.kind === "agent_type" ? (
          <div className="grid gap-1.5">
            <Label>Agent type</Label>
            <Input
              value={scope.agent_type}
              onChange={(e) =>
                setScope({ kind: "agent_type", agent_type: e.target.value })
              }
            />
          </div>
        ) : null}
        {scope.kind === "global" ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Global rules affect every conversation that matches.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-3 border-t pt-4">
        <legend className="text-xs font-semibold tracking-wide text-muted-foreground">
          IF
        </legend>
        <div className="grid gap-1.5">
          <Label>Condition</Label>
          <Select
            value={condition.kind}
            onValueChange={(kind) =>
              setCondition(
                kind === "contains"
                  ? { kind, match_mode: "any", text_contains: [] }
                  : kind === "regex"
                    ? { kind, match_mode: "any", regex: "" }
                    : kind === "error_kind"
                      ? { kind, match_mode: "any", error_kind: "" }
                      : { kind: "none", match_mode: "any" }
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="contains">Contains</SelectItem>
              <SelectItem value="regex">Regex</SelectItem>
              <SelectItem value="error_kind">Error Kind</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {condition.kind === "contains" ? (
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Keywords</Label>
              <Select
                value={condition.match_mode}
                onValueChange={(match_mode) =>
                  setCondition({
                    ...condition,
                    match_mode: match_mode as "any" | "all",
                  })
                }
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">ANY</SelectItem>
                  <SelectItem value="all">ALL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {keywords.map((keyword, index) => (
              <div className="flex gap-2" key={`${index}-${keyword}`}>
                <Input
                  aria-label={`Keyword ${index + 1}`}
                  value={keyword}
                  onChange={(e) => {
                    const next = [...keywords]
                    next[index] = e.target.value
                    setCondition({ ...condition, text_contains: next })
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove keyword"
                  onClick={() =>
                    setCondition({
                      ...condition,
                      text_contains: keywords.filter((_, i) => i !== index),
                    })
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() =>
                setCondition({ ...condition, text_contains: [...keywords, ""] })
              }
            >
              <Plus className="size-4" /> Add keyword
            </Button>
          </div>
        ) : null}
        {condition.kind === "regex" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="event-rule-regex">Regular expression</Label>
            <Input
              id="event-rule-regex"
              value={condition.regex ?? ""}
              onChange={(e) =>
                setCondition({ ...condition, regex: e.target.value })
              }
            />
          </div>
        ) : null}
        {condition.kind === "error_kind" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="event-rule-error-kind">Error kind</Label>
            <Input
              id="event-rule-error-kind"
              value={condition.error_kind ?? ""}
              onChange={(e) =>
                setCondition({ ...condition, error_kind: e.target.value })
              }
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-3 border-t pt-4">
        <legend className="text-xs font-semibold tracking-wide text-muted-foreground">
          THEN
        </legend>
        <div className="grid gap-1.5">
          <Label>Action</Label>
          <Input value="Send to existing conversation" readOnly />
        </div>
        <div className="grid gap-1.5">
          <Label>Target</Label>
          <Select
            value={action.conversation_ref}
            onValueChange={(conversation_ref) =>
              update((d) => ({
                ...d,
                config: {
                  ...d.config,
                  action: {
                    ...d.config.action,
                    conversation_ref:
                      conversation_ref as typeof action.conversation_ref,
                    conversation_id:
                      conversation_ref === "specific_conversation"
                        ? (d.config.action.conversation_id ?? 0)
                        : null,
                  },
                },
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="source_conversation">
                This conversation
              </SelectItem>
              <SelectItem value="specific_conversation">
                Specific conversation
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {action.conversation_ref === "specific_conversation" ? (
          <div className="grid gap-1.5">
            <Label>Specific conversation</Label>
            <ConversationSelect
              conversations={sortedConversations}
              value={action.conversation_id ?? 0}
              onChange={(id) =>
                update((d) => ({
                  ...d,
                  config: {
                    ...d.config,
                    action: { ...d.config.action, conversation_id: id },
                  },
                }))
              }
            />
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="event-rule-prompt">Follow-up prompt</Label>
          <Textarea
            id="event-rule-prompt"
            value={action.prompt}
            onChange={(e) =>
              update((d) => ({
                ...d,
                config: {
                  ...d.config,
                  action: { ...d.config.action, prompt: e.target.value },
                },
              }))
            }
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 border-t pt-4">
        <legend className="text-xs font-semibold tracking-wide text-muted-foreground">
          GUARD
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Max attempts</Label>
            <Input
              type="number"
              min="1"
              value={draft.config.guard.max_attempts}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  config: {
                    ...d.config,
                    guard: {
                      ...d.config.guard,
                      max_attempts: Number(e.target.value) || 0,
                    },
                  },
                }))
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Cooldown (seconds)</Label>
            <Input
              type="number"
              min="0"
              value={Math.round(draft.config.guard.cooldown_ms / 1000)}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  config: {
                    ...d.config,
                    guard: {
                      ...d.config.guard,
                      cooldown_ms:
                        Math.max(0, Number(e.target.value) || 0) * 1000,
                    },
                  },
                }))
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Attempts are per rule and source conversation. A blocked winner does
          not fall back to another rule.
        </p>
      </fieldset>

      <fieldset className="grid gap-3 border-t pt-4">
        <legend className="text-xs font-semibold tracking-wide text-muted-foreground">
          PREVIEW
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Sample conversation</Label>
            <ConversationSelect
              conversations={sortedConversations}
              value={sampleConversationId}
              onChange={setSampleConversationId}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Sample error kind</Label>
            <Input
              aria-label="Sample error kind"
              value={sampleErrorKind}
              onChange={(e) => setSampleErrorKind(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Failed event text</Label>
          <Textarea
            aria-label="Failed event text"
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
          />
        </div>
        <Button variant="outline" className="w-fit" onClick={runPreview}>
          Preview without sending
        </Button>
        {preview ? (
          <div className="rounded-xl bg-muted p-3 text-sm">
            <p>
              Scope: {preview.scope_matches ? "matched" : "did not match"};
              condition:{" "}
              {preview.condition_matches ? "matched" : "did not match"}.
            </p>
            <p>
              Target:{" "}
              {!preview.target_exists
                ? "missing"
                : preview.target_available
                  ? (preview.resolved_target_id ?? "source")
                  : `${preview.resolved_target_id ?? "source"} exists but has no connected idle runtime`}
              .
            </p>
            <p>
              {preview.draft_is_winner
                ? "This rule wins first-match ordering."
                : preview.draft_is_shadowed
                  ? `Shadowed by rule #${preview.winner_rule_id ?? "?"}.`
                  : "No matching winner."}
            </p>
            {preview.shadowed_rule_ids.length ? (
              <p>Shadowed rule ids: {preview.shadowed_rule_ids.join(", ")}.</p>
            ) : null}
            {preview.guard_blocked ? (
              <p>
                Guard blocks the winner: {preview.guard_blocked}; no fallback
                occurs.
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <div className="flex justify-end gap-2 border-t pt-4">
        {onCancel ? (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save rule"}
        </Button>
      </div>
    </div>
  )
}

function ConversationSelect({
  conversations,
  value,
  onChange,
}: {
  conversations: DbConversationSummary[]
  value: number
  onChange: (id: number) => void
}) {
  return (
    <Select
      value={value ? String(value) : ""}
      onValueChange={(id) => onChange(Number(id))}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select a conversation" />
      </SelectTrigger>
      <SelectContent>
        {conversations.map((conversation) => (
          <SelectItem value={String(conversation.id)} key={conversation.id}>
            {conversation.title || `Conversation #${conversation.id}`} ·{" "}
            {conversation.agent_type} · folder {conversation.folder_id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
