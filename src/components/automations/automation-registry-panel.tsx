"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import {
  automationRegistryList,
  eventRuleCreate,
  eventRuleDelete,
  eventRuleListLogs,
  eventRuleSetEnabled,
  eventRuleUpdate,
  listAllConversations,
  wakeCancel,
  wakeCreate,
  wakeUpdate,
} from "@/lib/api"
import type {
  AutomationRegistryItem,
  EventRule,
  EventRuleDraft,
  EventRuleLog,
  WakeDraft,
  WakeRecord,
} from "@/lib/types"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { onTransportReconnect } from "@/lib/platform"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  EventRuleEditor,
  type EventRuleAutomationType,
} from "./event-rule-editor"
import { WakeEditor } from "./wake-editor"
import {
  isRegistryEventRule,
  isRegistryWake,
  isWakePending,
  isWakeTerminal,
  wakeScheduleDescription,
  wakeSourceConversationId,
} from "./registry-item-utils"

type SortKey = "active" | "applicable" | "priority" | "id"

function formatActionError(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}

function isNotFoundError(message: string): boolean {
  return /not found/i.test(message)
}

export function AutomationRegistryPanel({
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
  const locale = useLocale()
  const folders = useAppWorkspaceStore((state) => state.allFolders)
  const [items, setItems] = useState<AutomationRegistryItem[]>([])
  const [conversations, setConversations] = useState<
    Awaited<ReturnType<typeof listAllConversations>>
  >([])
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("active")
  const [editingRule, setEditingRule] = useState<EventRule | "new" | null>(null)
  const [newAutomationType, setNewAutomationType] =
    useState<EventRuleAutomationType>("content_detection")
  const [editingWake, setEditingWake] = useState<WakeRecord | "new" | null>(null)
  const [selectedLogRule, setSelectedLogRule] = useState<number | null>(null)
  const [logs, setLogs] = useState<EventRuleLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingDeleteRule, setPendingDeleteRule] = useState<EventRule | null>(
    null
  )
  const [pendingCancelWake, setPendingCancelWake] = useState<WakeRecord | null>(
    null
  )

  const load = useCallback(async () => {
    const [next, chats] = await Promise.all([
      automationRegistryList(),
      listAllConversations(),
    ])
    setItems(next)
    setConversations(chats)
  }, [])

  const reloadRegistry = useCallback(async () => {
    try {
      await load()
    } catch (cause) {
      setError(formatActionError(cause))
    }
  }, [load])

  useEffect(() => {
    void reloadRegistry().catch((cause) => {
      setError(formatActionError(cause))
    })
    const refresh = () => {
      void reloadRegistry()
    }
    window.addEventListener("focus", refresh)
    const off = onTransportReconnect(refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      off?.()
    }
  }, [reloadRegistry])

  const runAction = useCallback(
    async (
      action: () => Promise<void>,
      options?: { successMessage?: string; reload?: boolean }
    ) => {
      setError(null)
      try {
        await action()
        if (options?.reload ?? true) {
          await reloadRegistry()
        }
        if (options?.successMessage) {
          setNotice(options.successMessage)
        }
      } catch (cause) {
        const message = formatActionError(cause)
        if (isNotFoundError(message)) {
          setNotice(t("registry.itemAlreadyRemoved"))
          await reloadRegistry()
          return
        }
        setError(message)
      }
    },
    [reloadRegistry, t]
  )

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    const filtered = items.filter((item) => {
      if (!needle) return true
      const rule = isRegistryEventRule(item) ? item : null
      const wake = isRegistryWake(item) ? item : null
      const values = rule
        ? [
            "event_rule",
            rule.name,
            rule.creator,
            rule.provenance,
            rule.config.condition.regex,
            ...(rule.config.condition.text_contains ?? []),
            rule.config.action.prompt,
            rule.config.action.additional_prompt,
            ...(rule.config.action.target_conversation_ids ?? []).map((id) =>
              conversationsLabel(id, conversations)
            ),
          ]
        : wake
          ? [
              "wake",
              wake.name,
              wake.creator,
              wake.provenance,
              wake.prompt,
              wake.target,
              wake.description,
              wakeScheduleDescription(wake, locale),
            ]
          : []
      return values.filter(Boolean).join(" ").toLocaleLowerCase().includes(needle)
    })
    const applies = (item: AutomationRegistryItem) => {
      if (isRegistryEventRule(item)) {
        const scope = item.config.scope
        if (scope.kind === "global") return true
        if (scope.kind === "conversation") {
          return scope.conversation_id === conversationId
        }
        if (scope.kind === "folder") return scope.folder_id === folderId
        return scope.agent_type === agentType
      }
      const wake = item as WakeRecord
      return (
        wake.target_conversation_id == null ||
        wake.target_conversation_id === conversationId
      )
    }
    return filtered.sort((a, b) => {
      const aApplicable = Boolean(
        isRegistryEventRule(a) ? a.applicable ?? applies(a) : applies(a)
      )
      const bApplicable = Boolean(
        isRegistryEventRule(b) ? b.applicable ?? applies(b) : applies(b)
      )
      const aActive = isRegistryWake(a)
        ? isWakePending(a)
        : Boolean(a.enabled)
      const bActive = isRegistryWake(b)
        ? isWakePending(b)
        : Boolean(b.enabled)
      if (sort === "active") {
        return (
          Number(bActive) - Number(aActive) ||
          Number(bApplicable) - Number(aApplicable) ||
          (isRegistryEventRule(b) ? b.priority : 0) -
            (isRegistryEventRule(a) ? a.priority : 0) ||
          a.id - b.id
        )
      }
      if (sort === "applicable") {
        return (
          Number(bApplicable) - Number(aApplicable) ||
          Number(bActive) - Number(aActive) ||
          (isRegistryEventRule(b) ? b.priority : 0) -
            (isRegistryEventRule(a) ? a.priority : 0) ||
          a.id - b.id
        )
      }
      if (sort === "priority") {
        return (
          (isRegistryEventRule(b) ? b.priority : 0) -
            (isRegistryEventRule(a) ? a.priority : 0) ||
          Number(bActive) - Number(aActive) ||
          Number(bApplicable) - Number(aApplicable) ||
          a.id - b.id
        )
      }
      return (
        Number(bActive) - Number(aActive) ||
        Number(bApplicable) - Number(aApplicable) ||
        a.id - b.id
      )
    })
  }, [
    items,
    search,
    sort,
    conversations,
    conversationId,
    folderId,
    agentType,
    locale,
  ])

  const saveRule = async (draft: EventRuleDraft) => {
    if (editingRule === "new") await eventRuleCreate(draft)
    else if (editingRule) await eventRuleUpdate(editingRule.id, draft)
    setEditingRule(null)
    setNotice(t("registry.ruleSaved"))
    await reloadRegistry()
  }

  const saveWake = async (draft: WakeDraft) => {
    if (editingWake === "new") await wakeCreate(draft, conversationId)
    else if (editingWake) await wakeUpdate(editingWake.id, draft, conversationId)
    setEditingWake(null)
    setNotice(t("registry.wakeSaved"))
    await reloadRegistry()
  }

  const loadLogs = async (ruleId: number) => {
    setSelectedLogRule(ruleId)
    setLogsLoading(true)
    setError(null)
    try {
      const page = await eventRuleListLogs({
        ruleId,
        conversationId,
        limit: 25,
      })
      setLogs(page.items)
    } catch (cause) {
      const message = formatActionError(cause)
      if (isNotFoundError(message)) {
        setNotice(t("registry.itemAlreadyRemoved"))
        setSelectedLogRule(null)
        await reloadRegistry()
        return
      }
      setError(message)
    } finally {
      setLogsLoading(false)
    }
  }

  const initialScope =
    conversationId == null
      ? { kind: "global" as const }
      : { kind: "conversation" as const, conversation_id: conversationId }

  const openNewRule = (automationType: EventRuleAutomationType) => {
    setNewAutomationType(automationType)
    setEditingRule("new")
  }

  const ruleSubpageTitle =
    editingRule === "new"
      ? newAutomationType === "content_detection"
        ? t("registry.createContentDetection")
        : t("registry.createForwardAfterCompletion")
      : editingRule
        ? editingRule.name
        : t("editor.title")

  if (editingRule) {
    return (
      <div className="h-full overflow-auto px-1">
        <EventRuleEditor
          rule={editingRule === "new" ? null : editingRule}
          initialScope={editingRule === "new" ? initialScope : undefined}
          initialAutomationType={
            editingRule === "new" ? newAutomationType : undefined
          }
          subpageTitle={ruleSubpageTitle}
          conversations={conversations}
          folders={folders.map((f) => ({
            id: f.id,
            name: f.name,
            alias: f.alias,
            path: f.path,
          }))}
          agentTypes={[]}
          onSubmit={saveRule}
          onCancel={() => setEditingRule(null)}
        />
      </div>
    )
  }

  if (editingWake) {
    return (
      <WakeEditor
        wake={editingWake === "new" ? null : editingWake}
        defaultTargetConversationId={conversationId}
        conversations={conversations}
        subpageTitle={
          editingWake === "new" ? t("wakeEditorTitle") : t("wakeEditTitle")
        }
        onSubmit={saveWake}
        onCancel={() => setEditingWake(null)}
      />
    )
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-4"
      data-testid="automation-registry-panel"
    >
      {!dialog ? (
        <div>
          <h2 className="text-lg font-semibold">{t("registryTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("registryDescription")}
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("registrySearchPlaceholder")}
            aria-label={t("registrySearchPlaceholder")}
          />
        </div>
        <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t("sortActive")}</SelectItem>
            <SelectItem value="applicable">{t("sortApplicable")}</SelectItem>
            <SelectItem value="priority">{t("sortPriority")}</SelectItem>
            <SelectItem value="id">{t("sortId")}</SelectItem>
          </SelectContent>
        </Select>
        {dialog ? (
          <div className="relative">
            <Button size="sm" onClick={() => setAddMenuOpen((open) => !open)}>
              <Plus className="size-4" />
              {t("registryAddCustom")}
            </Button>
            {addMenuOpen ? (
              <div className="absolute right-0 top-full z-10 mt-1 grid min-w-48 gap-1 rounded-xl border bg-background p-1 shadow-lg">
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => {
                    setAddMenuOpen(false)
                    openNewRule("content_detection")
                  }}
                >
                  {t("editor.contentDetection")}
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => {
                    setAddMenuOpen(false)
                    openNewRule("forward_after_task_completion")
                  }}
                >
                  {t("editor.forwardAfterCompletion")}
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => {
                    setAddMenuOpen(false)
                    setEditingWake("new")
                  }}
                >
                  {t("newWake")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <Button size="sm" onClick={() => openNewRule("content_detection")}>
              <Plus className="size-4" />
              {t("newRule")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditingWake("new")}
            >
              <Plus className="size-4" />
              {t("newWake")}
            </Button>
          </>
        )}
      </div>
      {notice ? (
        <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
          {notice}
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
      <ul className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {visible.length ? (
          visible.map((item) => (
            <RegistryRow
              key={`${isRegistryEventRule(item) ? "event" : "wake"}-${item.id}`}
              item={item}
              conversations={conversations}
              conversationId={conversationId}
              folderId={folderId}
              agentType={agentType}
              locale={locale}
              onEdit={() =>
                isRegistryEventRule(item)
                  ? setEditingRule(item)
                  : setEditingWake(item)
              }
              onViewLogs={
                isRegistryEventRule(item)
                  ? () => void loadLogs(item.id)
                  : undefined
              }
              onRequestDelete={(rule) => setPendingDeleteRule(rule)}
              onRequestCancel={(wake) => setPendingCancelWake(wake)}
              onToggleEnabled={(rule, enabled) =>
                void runAction(
                  () => eventRuleSetEnabled(rule.id, enabled),
                  { successMessage: t("registry.ruleUpdated") }
                )
              }
            />
          ))
        ) : (
          <li className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            {t("registryEmpty")}
          </li>
        )}
      </ul>
      {selectedLogRule != null ? (
        <section className="rounded-xl border p-3">
          <h3 className="font-semibold">{t("logs.title")}</h3>
          {logsLoading ? null : logs.length ? (
            <ul className="mt-2 space-y-2">
              {logs.map((log) => (
                <li key={log.id} className="rounded-lg bg-muted/40 p-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{log.status}</span>
                    <time>{new Date(log.created_at).toLocaleString()}</time>
                  </div>
                  {log.detail ? <p>{log.detail}</p> : null}
                  {log.guard_reason ? (
                    <p className="text-muted-foreground">{log.guard_reason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t("logs.empty")}</p>
          )}
        </section>
      ) : null}

      <AlertDialog
        open={pendingDeleteRule != null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteRule(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("registry.deleteEventRuleTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirm", {
                rule: pendingDeleteRule?.name ?? t("event"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("editor.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const rule = pendingDeleteRule
                setPendingDeleteRule(null)
                if (!rule) return
                void runAction(
                  () => eventRuleDelete(rule.id),
                  { successMessage: t("registry.ruleDeleted") }
                )
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingCancelWake != null}
        onOpenChange={(open) => {
          if (!open) setPendingCancelWake(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("registry.cancelWakeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("registry.cancelWakeDescription", {
                name: pendingCancelWake?.name ?? t("wake"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("editor.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const wake = pendingCancelWake
                setPendingCancelWake(null)
                if (!wake) return
                const sourceId = wakeSourceConversationId(wake)
                if (!sourceId) {
                  setError(t("registry.wakeCancelMissingTarget"))
                  return
                }
                void runAction(
                  () => wakeCancel(wake.id, sourceId),
                  { successMessage: t("registry.wakeCancelled") }
                )
              }}
            >
              {t("registry.cancelWakeConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function conversationsLabel(
  id: number,
  conversations: Awaited<ReturnType<typeof listAllConversations>>
) {
  return conversations.find((conversation) => conversation.id === id)?.title ?? `#${id}`
}

function RegistryRow({
  item,
  conversations,
  conversationId,
  folderId,
  agentType,
  locale,
  onEdit,
  onViewLogs,
  onRequestDelete,
  onRequestCancel,
  onToggleEnabled,
}: {
  item: AutomationRegistryItem
  conversations: Awaited<ReturnType<typeof listAllConversations>>
  conversationId: number | null
  folderId: number | null
  agentType: string | null
  locale: string
  onEdit: () => void
  onViewLogs?: () => void
  onRequestDelete: (rule: EventRule) => void
  onRequestCancel: (wake: WakeRecord) => void
  onToggleEnabled: (rule: EventRule, enabled: boolean) => void
}) {
  const t = useTranslations("EventAutomations")
  const event = isRegistryEventRule(item)
  const wake = event ? null : (item as WakeRecord)
  const name = item.name || (event ? t("event") : t("wake"))
  const target = event
    ? item.config.action.target_conversation_ids
        ?.map(
          (id) => conversations.find((c) => c.id === id)?.title ?? `#${id}`
        )
        .join(", ")
    : wake?.target_conversation_id
      ? conversationsLabel(wake.target_conversation_id, conversations)
      : wake?.target
  const applicable = event
    ? item.config.scope.kind === "global" ||
      (item.config.scope.kind === "conversation" &&
        item.config.scope.conversation_id === conversationId) ||
      (item.config.scope.kind === "folder" &&
        item.config.scope.folder_id === folderId) ||
      (item.config.scope.kind === "agent_type" &&
        item.config.scope.agent_type === agentType)
    : wake?.target_conversation_id == null ||
      wake.target_conversation_id === conversationId
  const scopeText = event
    ? item.config.scope.kind === "global"
      ? t("scopeGlobal")
      : item.config.scope.kind === "conversation"
        ? item.config.scope.conversation_id === conversationId
          ? t("scopeConversation")
          : conversationsLabel(item.config.scope.conversation_id, conversations)
        : item.config.scope.kind === "folder"
          ? t("inherited") + ": " + item.config.scope.folder_id
          : t("inherited") + ": " + item.config.scope.agent_type
    : wake?.target ?? t("scopeConversation")

  const wakeStatusLabel = (() => {
    if (!wake) return null
    if (wake.status === "pending" || (wake.enabled && !wake.status)) {
      return t("registry.wakeStatusPending")
    }
    if (wake.status === "dispatching") return t("registry.wakeStatusDispatching")
    if (wake.status === "sent") return t("registry.wakeStatusSent")
    if (wake.status === "failed") return t("registry.wakeStatusFailed")
    if (wake.status === "cancelled") return t("registry.wakeStatusCancelled")
    return wake.enabled ? t("registry.wakeStatusPending") : t("registry.wakeStatusCancelled")
  })()

  const scheduleText = event
    ? `${t("priority")}: ${item.priority}`
    : wakeScheduleDescription(wake!, locale)

  return (
    <li className="rounded-xl border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{name}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
              {event ? t("event") : t("wake")}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
              {item.provenance ?? "user"}
            </span>
            {wakeStatusLabel ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px]">
                {wakeStatusLabel}
              </span>
            ) : null}
            {applicable ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px]">
                {t("scopeConversation")}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {scopeText} · {scheduleText}
            {target ? ` · ${target}` : ""}
          </p>
        </div>
        {event ? (
          <Switch
            checked={item.enabled}
            onCheckedChange={(enabled) => onToggleEnabled(item, enabled)}
            aria-label={item.enabled ? t("enabled") : t("disabled")}
          />
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{item.creator ?? t("registryUserCreated")}</span>
        <div className="flex gap-1">
          {onViewLogs ? (
            <Button size="sm" variant="ghost" onClick={onViewLogs}>
              {t("logs.title")}
            </Button>
          ) : null}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`${t("edit")} ${name}`}
            onClick={onEdit}
            disabled={wake ? isWakeTerminal(wake) : false}
          >
            <Pencil className="size-4" />
          </Button>
          {event ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`${t("delete")} ${name}`}
              onClick={() => onRequestDelete(item)}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
          {wake && isWakePending(wake) ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRequestCancel(wake)}
            >
              {t("registry.cancelWakeAction")}
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  )
}
