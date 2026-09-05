"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pencil, Plus, Trash2, ChevronDown } from "lucide-react"
import { useTranslations } from "next-intl"
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
import { getAgentLabel } from "@/lib/custom-agents"
import {
  ALL_AGENT_TYPES,
  type AgentType,
  type EventRule,
  type EventRuleDraft,
  type EventRuleLog,
} from "@/lib/types"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import type { FolderSelectOption } from "@/components/shared/folder-select"
import { EventRuleEditor } from "./event-rule-editor"

type Translator = (
  key: string,
  values?: Record<string, string | number>
) => string

function isApplicable(
  rule: EventRule,
  conversationId: number | null,
  folderId: number | null,
  agentType: string | null
) {
  if (conversationId == null && folderId == null && agentType == null) {
    return true
  }
  const scope = rule.config.scope
  if (scope.kind === "global") return true
  if (scope.kind === "conversation") {
    return scope.conversation_id === conversationId
  }
  if (scope.kind === "folder") return scope.folder_id === folderId
  return scope.agent_type === agentType
}

function conversationLabel(
  id: number,
  conversations: Awaited<ReturnType<typeof listAllConversations>>,
  t: Translator
) {
  return (
    conversations.find((conversation) => conversation.id === id)?.title ||
    t("editor.selectConversation")
  )
}

function scopeLabel(
  rule: EventRule,
  inherited: boolean,
  conversations: Awaited<ReturnType<typeof listAllConversations>>,
  folders: readonly FolderSelectOption[],
  t: Translator
) {
  const scope = rule.config.scope
  let label: string
  if (scope.kind === "global") label = t("scopeGlobal")
  else if (scope.kind === "conversation") {
    label =
      scope.conversation_id > 0
        ? conversationLabel(scope.conversation_id, conversations, t)
        : t("scopeConversation")
  } else if (scope.kind === "folder") {
    label =
      folders.find((folder) => folder.id === scope.folder_id)?.alias ||
      folders.find((folder) => folder.id === scope.folder_id)?.name ||
      t("editor.folderPlaceholder")
  } else {
    label = getAgentLabel(scope.agent_type)
  }
  if (!inherited) return label
  return t("inherited") + ": " + label
}

function conditionLabel(rule: EventRule, t: Translator) {
  const condition = rule.config.condition
  if (condition.kind === "contains") {
    return condition.match_mode === "all"
      ? t("conditionAll")
      : t("conditionAny")
  }
  if (condition.kind === "regex") return t("conditionRegex")
  if (condition.kind === "error_kind") return t("conditionErrorKind")
  return t("conditionNone")
}

function logStatusLabel(status: EventRuleLog["status"], t: Translator) {
  if (status === "fired") return t("logs.fired")
  if (status === "failed") return t("logs.failed")
  return t("logs.skipped")
}

function numberAfter(text: string, token: string) {
  const match = text.match(new RegExp(token + "\\s*[=:]\\s*(\\d+)", "i"))
  return match?.[1] ?? "?"
}

export function logReasonLabel(log: EventRuleLog, t: Translator) {
  const raw = [log.guard_reason, log.detail, log.action]
    .filter(Boolean)
    .join(" ")
  if (/max[_ ]attempts?/i.test(raw)) {
    return t("logs.reasonMaxAttempts", {
      count: numberAfter(raw, "max[_ ]attempts?"),
    })
  }
  if (/cooldown/i.test(raw)) {
    const milliseconds = Number(numberAfter(raw, "cooldown[_ ]?ms"))
    return t("logs.reasonCooldown", {
      seconds:
        Number.isFinite(milliseconds) && milliseconds > 0
          ? Math.round(milliseconds / 1000)
          : numberAfter(raw, "cooldown"),
    })
  }
  if (
    /no live connection|offline|unavailable|no connected idle runtime/i.test(
      raw
    )
  ) {
    return t("logs.reasonUnavailable")
  }
  return t("logs.reasonGeneric", {
    reason: t("logs.reasonUnavailable"),
  })
}

function isInheritedScope(
  rule: EventRule,
  conversationId: number | null,
  folderId: number | null,
  agentType: string | null
) {
  const kind = rule.config.scope.kind
  if (conversationId != null) return kind !== "conversation"
  if (folderId != null) return kind === "global" || kind === "agent_type"
  if (agentType != null) return kind === "global"
  return false
}

export function EventAutomationsPanel({
  conversationId = null,
  folderId = null,
  agentType = null,
  dialog = false,
}: {
  conversationId?: number | null
  folderId?: number | null
  agentType?: string | null
  dialog?: boolean
}) {
  const t = useTranslations("EventAutomations")
  const translate = t as unknown as Translator
  const allFolders = useAppWorkspaceStore((state) => state.allFolders)
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

  const folderOptions = useMemo<FolderSelectOption[]>(
    () =>
      allFolders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        alias: folder.alias,
        path: folder.path,
      })),
    [allFolders]
  )
  const agentTypes = useMemo<AgentType[]>(() => {
    const values = new Set<AgentType>(ALL_AGENT_TYPES)
    conversations.forEach((conversation) => values.add(conversation.agent_type))
    if (agentType) values.add(agentType)
    return [...values]
  }, [agentType, conversations])

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
      rules.filter((rule) =>
        isApplicable(rule, conversationId, folderId, agentType)
      ),
    [rules, conversationId, folderId, agentType]
  )
  const initialScope =
    conversationId == null
      ? ({ kind: "global" } as const)
      : ({ kind: "conversation", conversation_id: conversationId } as const)
  const cannotCreate = dialog && conversationId == null

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
    if (!window.confirm(t("deleteConfirm", { rule: rule.name }))) return
    try {
      await eventRuleDelete(rule.id)
      if (selected?.id === rule.id) setSelected(null)
      await load()
    } catch (cause) {
      setError(toErrorMessage(cause))
    }
  }

  return (
    <div
      className="flex min-h-0 flex-col gap-4"
      data-testid="event-automations-panel"
    >
      {!dialog ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{t("title")}</h2>
            <p className="text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> {t("newRule")}
          </Button>
        </div>
      ) : null}
      {cannotCreate ? (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
          {t("header.disabledTooltip")}
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
                  ? "new-" + (conversationId ?? "global")
                  : "edit-" + editing.id
              }
              rule={editing === "new" ? null : editing}
              initialScope={editing === "new" ? initialScope : undefined}
              conversations={conversations}
              folders={folderOptions}
              agentTypes={agentTypes}
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
                visibleRules.map((rule) => {
                  const inherited = isInheritedScope(
                    rule,
                    conversationId,
                    folderId,
                    agentType
                  )
                  const displayName =
                    rule.builtin_key === "retriable_error_auto_resume"
                      ? t("builtin.name")
                      : rule.name
                  return (
                    <li
                      key={rule.id}
                      className={
                        "rounded-xl border p-3 " +
                        (selected?.id === rule.id ? "border-primary" : "")
                      }
                    >
                      <button
                        className="w-full text-left"
                        onClick={() => setSelected(rule)}
                      >
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{displayName}</span>
                          <span className="text-xs text-muted-foreground">
                            {rule.enabled
                              ? t("status.enabled")
                              : t("status.disabled")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {scopeLabel(
                            rule,
                            inherited,
                            conversations,
                            folderOptions,
                            translate
                          )}{" "}
                          · {conditionLabel(rule, translate)}
                        </p>
                        {rule.builtin_key === "retriable_error_auto_resume" ? (
                          <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {t("builtin.badge")}
                          </span>
                        ) : null}
                      </button>
                      <div className="mt-3 flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs">
                          {rule.enabled
                            ? t("status.enabled")
                            : t("status.disabled")}
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={() => void toggle(rule)}
                            aria-label={
                              rule.enabled
                                ? t("status.enabled")
                                : t("status.disabled")
                            }
                          />
                        </label>
                        <div className="flex gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t("edit") + " " + displayName}
                            onClick={() => setEditing(rule)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t("delete") + " " + displayName}
                            onClick={() => void remove(rule)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  )
                })
              ) : (
                <li className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                  {t("empty")}
                </li>
              )}
            </ul>
          </ScrollArea>
          <RuleDetail
            rule={selected}
            scopeText={
              selected
                ? scopeLabel(
                    selected,
                    isInheritedScope(
                      selected,
                      conversationId,
                      folderId,
                      agentType
                    ),
                    conversations,
                    folderOptions,
                    translate
                  )
                : ""
            }
            displayName={
              selected?.builtin_key === "retriable_error_auto_resume"
                ? t("builtin.name")
                : (selected?.name ?? "")
            }
            conversations={conversations}
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
  scopeText,
  displayName,
  conversations,
  logs,
  nextCursor,
  loadMore,
  onEdit,
}: {
  rule: EventRule | null
  scopeText: string
  displayName: string
  conversations: Awaited<ReturnType<typeof listAllConversations>>
  logs: EventRuleLog[]
  nextCursor: number | null
  loadMore: () => void
  onEdit: () => void
}) {
  const t = useTranslations("EventAutomations")
  const translate = t as unknown as Translator
  const [technicalLog, setTechnicalLog] = useState<number | null>(null)
  const locale = typeof navigator === "undefined" ? "en" : navigator.language
  if (!rule)
    return (
      <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
        {t("selectRule")}
      </div>
    )
  return (
    <ScrollArea className="min-h-0">
      <div className="flex flex-col gap-4 pr-3">
        <div className="rounded-xl border p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">{displayName}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {scopeText} ·{" "}
                {rule.enabled ? t("status.enabled") : t("status.disabled")}
              </p>
              {rule.builtin_key === "retriable_error_auto_resume" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("builtin.description")}
                </p>
              ) : null}
            </div>
            <Button size="sm" variant="outline" onClick={onEdit}>
              {t("edit")}
            </Button>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm">
            {rule.config.action.prompt}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <h3 className="font-semibold">{t("logs.title")}</h3>
          {logs.length ? (
            <ul className="mt-3 flex flex-col gap-3">
              {logs.map((log) => {
                const source = conversationLabel(
                  log.source_conversation_id,
                  conversations,
                  translate
                )
                const target =
                  log.resolved_target_id == null
                    ? t("logs.reasonUnavailable")
                    : conversationLabel(
                        log.resolved_target_id,
                        conversations,
                        translate
                      )
                return (
                  <li key={log.id} className="border-l-2 pl-3 text-sm">
                    <div className="flex flex-wrap gap-x-2">
                      <span className="font-medium">
                        {logStatusLabel(log.status, translate)}
                      </span>
                      <span className="text-muted-foreground">
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(log.created_at))}
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      {t("logs.source", { reason: source })}
                    </p>
                    <p className="text-muted-foreground">
                      {t("logs.target", { target })}
                    </p>
                    <p className="text-sm">
                      {log.prompt_snapshot ?? logReasonLabel(log, translate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {logReasonLabel(log, translate)}
                    </p>
                    <Collapsible
                      open={technicalLog === log.id}
                      onOpenChange={(open) =>
                        setTechnicalLog(open ? log.id : null)
                      }
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 px-0 text-xs"
                        >
                          {t("logs.technical", {
                            reason: t("logs.reasonUnavailable"),
                          })}{" "}
                          <ChevronDown
                            className={
                              technicalLog === log.id
                                ? "size-3 rotate-180"
                                : "size-3"
                            }
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="grid gap-1 pt-1 text-xs text-muted-foreground">
                        <span>
                          source_conversation_id: {log.source_conversation_id}
                        </span>
                        <span>
                          resolved_target_id: {String(log.resolved_target_id)}
                        </span>
                        <span>action: {log.action ?? "—"}</span>
                        <span>guard_reason: {log.guard_reason ?? "—"}</span>
                        <span>detail: {log.detail ?? "—"}</span>
                      </CollapsibleContent>
                    </Collapsible>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("logs.empty")}
            </p>
          )}
          {nextCursor != null ? (
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={loadMore}
            >
              {t("logs.loadMore")}
            </Button>
          ) : null}
        </div>
      </div>
    </ScrollArea>
  )
}
