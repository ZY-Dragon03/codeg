"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import {
  eventRuleCreate,
  eventRuleDelete,
  eventRuleList,
  eventRuleListLogs,
  eventRuleSetEnabled,
  eventRuleUpdate,
  listAllConversations,
} from "@/lib/api"
import { onTransportReconnect } from "@/lib/platform"
import { toErrorMessage } from "@/lib/app-error"
import type { EventRule, EventRuleDraft, EventRuleLog } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { EventRuleEditor } from "./event-rule-editor"

function isApplicable(rule: EventRule, conversationId: number | null) {
  if (conversationId == null) return rule.config.scope.kind === "global"
  return (
    rule.config.scope.kind === "global" ||
    (rule.config.scope.kind === "conversation" &&
      rule.config.scope.conversation_id === conversationId)
  )
}
function scopeLabel(rule: EventRule) {
  const scope = rule.config.scope
  if (scope.kind === "global") return "Global"
  if (scope.kind === "conversation")
    return `Conversation #${scope.conversation_id}`
  if (scope.kind === "folder") return `Folder #${scope.folder_id}`
  return `Agent ${scope.agent_type}`
}

export function EventAutomationsPanel({
  conversationId = null,
  dialog = false,
}: {
  conversationId?: number | null
  dialog?: boolean
}) {
  const [rules, setRules] = useState<EventRule[]>([])
  const [conversations, setConversations] = useState<
    Awaited<ReturnType<typeof listAllConversations>>
  >([])
  const [editing, setEditing] = useState<EventRule | "new" | null>(null)
  const [selected, setSelected] = useState<EventRule | null>(null)
  const [logs, setLogs] = useState<EventRuleLog[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)

  const load = useCallback(async () => {
    const id = ++request.current
    try {
      const [nextRules, nextConversations] = await Promise.all([
        eventRuleList(),
        listAllConversations(),
      ])
      if (id !== request.current) return
      setRules(nextRules)
      setConversations(nextConversations)
      setSelected((current) =>
        current ? (nextRules.find((r) => r.id === current.id) ?? null) : null
      )
    } catch (cause) {
      if (id === request.current) setError(toErrorMessage(cause))
    }
  }, [])
  useEffect(() => {
    // Queue the initial request after commit. Besides keeping render pure, this
    // gives a dialog opening during a tab switch a stable mounted target.
    const initialLoad = window.setTimeout(() => void load(), 0)
    const focus = () => void load()
    window.addEventListener("focus", focus)
    const offReconnect = onTransportReconnect(focus)
    return () => {
      window.clearTimeout(initialLoad)
      window.removeEventListener("focus", focus)
      offReconnect?.()
    }
  }, [load])
  const loadLogs = useCallback(
    async (ruleId: number, cursor: number | null = null) => {
      const page = await eventRuleListLogs({
        ruleId,
        conversationId,
        cursor,
        limit: 25,
      })
      setLogs((current) => (cursor ? [...current, ...page.items] : page.items))
      setNextCursor(page.next_cursor)
    },
    [conversationId]
  )
  useEffect(() => {
    const initialLogs = window.setTimeout(() => {
      if (selected) void loadLogs(selected.id)
      else setLogs([])
    }, 0)
    return () => window.clearTimeout(initialLogs)
  }, [selected, loadLogs])
  const visibleRules = useMemo(
    () =>
      conversationId == null
        ? rules
        : rules.filter((rule) => isApplicable(rule, conversationId)),
    [rules, conversationId]
  )
  const save = async (draft: EventRuleDraft) => {
    setError(null)
    try {
      const saved =
        editing === "new"
          ? await eventRuleCreate(draft)
          : editing
            ? await eventRuleUpdate(editing.id, draft)
            : null
      await load()
      if (saved) setSelected(saved)
      setEditing(null)
    } catch (cause) {
      setError(toErrorMessage(cause))
      throw cause
    }
  }
  const toggle = async (rule: EventRule) => {
    try {
      await eventRuleSetEnabled(rule.id, !rule.enabled)
      await load()
    } catch (cause) {
      setError(toErrorMessage(cause))
    }
  }
  const remove = async (rule: EventRule) => {
    if (!window.confirm(`Delete ${rule.name}?`)) return
    try {
      await eventRuleDelete(rule.id)
      if (selected?.id === rule.id) setSelected(null)
      await load()
    } catch (cause) {
      setError(toErrorMessage(cause))
    }
  }
  const initialScope =
    conversationId == null
      ? { kind: "global" as const }
      : { kind: "conversation" as const, conversation_id: conversationId }
  const cannotCreate = dialog && conversationId == null
  return (
    <div
      className="flex min-h-0 flex-col gap-4"
      data-testid="event-automations-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Event Automations</h2>
          <p className="text-sm text-muted-foreground">
            Only turn_failed is available in Phase 1.
          </p>
        </div>
        <Button
          size="sm"
          disabled={cannotCreate}
          title={
            cannotCreate
              ? "Send a message first to persist this conversation."
              : undefined
          }
          onClick={() => setEditing("new")}
        >
          <Plus className="size-4" /> New event rule
        </Button>
      </div>
      {cannotCreate ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
          Save this conversation before creating a conversation-scoped rule.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {editing ? (
        <ScrollArea className={dialog ? "max-h-[65dvh]" : "flex-1"}>
          <div className="pr-3">
            <EventRuleEditor
              key={
                editing === "new"
                  ? `new-${conversationId ?? "global"}`
                  : `edit-${editing.id}`
              }
              rule={editing === "new" ? null : editing}
              initialScope={editing === "new" ? initialScope : undefined}
              conversations={conversations}
              onSubmit={save}
              onCancel={() => setEditing(null)}
            />
          </div>
        </ScrollArea>
      ) : (
        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(20rem,1.2fr)]">
          <ScrollArea className={dialog ? "max-h-[55dvh]" : "min-h-0"}>
            <ul className="flex flex-col gap-2 pr-3">
              {visibleRules.length ? (
                visibleRules.map((rule) => (
                  <li
                    key={rule.id}
                    className={`rounded-xl border p-3 ${selected?.id === rule.id ? "border-primary" : ""}`}
                  >
                    <button
                      className="w-full text-left"
                      onClick={() => setSelected(rule)}
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{rule.name}</span>
                        <span className="text-xs text-muted-foreground">
                          priority {rule.priority}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {scopeLabel(rule)} · {rule.config.condition.kind}
                      </p>
                    </button>
                    <div className="mt-3 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs">
                        {rule.enabled ? "Enabled" : "Disabled"}
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() => void toggle(rule)}
                        />
                      </label>
                      <div className="flex gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Edit ${rule.name}`}
                          onClick={() => setEditing(rule)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Delete ${rule.name}`}
                          onClick={() => void remove(rule)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))
              ) : (
                <li className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                  No event rules yet.
                </li>
              )}
            </ul>
          </ScrollArea>
          <RuleDetail
            rule={selected}
            logs={logs}
            nextCursor={nextCursor}
            loadMore={() =>
              selected && nextCursor != null
                ? loadLogs(selected.id, nextCursor)
                : undefined
            }
            onEdit={() => selected && setEditing(selected)}
          />
        </div>
      )}
    </div>
  )
}

function RuleDetail({
  rule,
  logs,
  nextCursor,
  loadMore,
  onEdit,
}: {
  rule: EventRule | null
  logs: EventRuleLog[]
  nextCursor: number | null
  loadMore: () => void
  onEdit: () => void
}) {
  if (!rule)
    return (
      <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
        Select a rule to see its configuration and execution logs.
      </div>
    )
  return (
    <ScrollArea className="min-h-0">
      <div className="flex flex-col gap-4 pr-3">
        <div className="rounded-xl border p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">{rule.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {scopeLabel(rule)} · priority {rule.priority} ·{" "}
                {rule.enabled ? "enabled" : "disabled"}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit
            </Button>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm">
            {rule.config.action.prompt}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            First matching rule wins. Guard blocks do not fall through to later
            rules.
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <h3 className="font-semibold">Execution logs</h3>
          {logs.length ? (
            <ul className="mt-3 flex flex-col gap-3">
              {logs.map((log) => (
                <li key={log.id} className="border-l-2 pl-3 text-sm">
                  <div className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{log.status}</span>
                    <span className="text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    source #{log.source_conversation_id} →{" "}
                    {log.resolved_target_id == null
                      ? "unavailable"
                      : `#${log.resolved_target_id}`}{" "}
                    · {log.guard_reason ?? log.action ?? "unavailable"}
                  </p>
                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {log.prompt_snapshot ?? log.detail ?? "unavailable"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No execution history.
            </p>
          )}
          {nextCursor != null ? (
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={loadMore}
            >
              Load more
            </Button>
          ) : null}
        </div>
      </div>
    </ScrollArea>
  )
}
