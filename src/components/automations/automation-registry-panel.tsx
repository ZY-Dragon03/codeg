"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Pencil, Plus, Search, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { automationRegistryList, eventRuleCreate, eventRuleDelete, eventRuleListLogs, eventRuleSetEnabled, eventRuleUpdate, listAllConversations, wakeCancel, wakeCreate, wakeUpdate } from "@/lib/api"
import type { AutomationRegistryEventRule, AutomationRegistryItem, EventRule, EventRuleDraft, EventRuleLog, WakeDraft, WakeRecord, WakeSchedule } from "@/lib/types"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { onTransportReconnect } from "@/lib/platform"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EventRuleEditor } from "./event-rule-editor"

type SortKey = "active" | "applicable" | "priority" | "id"
const isEventRule = (item: AutomationRegistryItem): item is AutomationRegistryEventRule => "config" in item
const isWake = (item: AutomationRegistryItem): item is WakeRecord & { type?: "wake" } => !isEventRule(item)

function wakeDescription(wake: WakeRecord): string {
  const schedule = wake.schedule
  if (schedule.kind === "after") return `after ${Math.round(schedule.delay_ms / 1000)}s`
  if (schedule.kind === "at") return `at ${new Date(schedule.at).toLocaleString()}`
  return "when process exits"
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
  const folders = useAppWorkspaceStore((state) => state.allFolders)
  const [items, setItems] = useState<AutomationRegistryItem[]>([])
  const [conversations, setConversations] = useState<Awaited<ReturnType<typeof listAllConversations>>>([])
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("active")
  const [editingRule, setEditingRule] = useState<EventRule | "new" | null>(null)
  const [editingWake, setEditingWake] = useState<WakeRecord | "new" | null>(null)
  const [selectedLogRule, setSelectedLogRule] = useState<number | null>(null)
  const [logs, setLogs] = useState<EventRuleLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [next, chats] = await Promise.all([automationRegistryList(), listAllConversations()])
      setItems(next)
      setConversations(chats)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])
  useEffect(() => {
    void load()
    const refresh = () => void load()
    window.addEventListener("focus", refresh)
    const off = onTransportReconnect(refresh)
    return () => { window.removeEventListener("focus", refresh); off?.() }
  }, [load])

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    const filtered = items.filter((item) => {
      if (!needle) return true
      const rule = isEventRule(item) ? item : null
      const wake = isWake(item) ? item : null
      const values = rule
        ? ["event_rule", rule.name, rule.creator, rule.provenance, rule.config.condition.regex, ...(rule.config.condition.text_contains ?? []), rule.config.action.prompt, rule.config.action.additional_prompt, ...(rule.config.action.target_conversation_ids ?? []).map((id) => conversationsLabel(id, conversations))]
        : wake ? ["wake", wake.name, wake.creator, wake.provenance, wake.prompt, wake.target, wake.description, wakeDescription(wake)] : []
      return values.filter(Boolean).join(" ").toLocaleLowerCase().includes(needle)
    })
    const applies = (item: AutomationRegistryItem) => {
      if (isEventRule(item)) {
        const scope = item.config.scope
        if (scope.kind === "global") return true
        if (scope.kind === "conversation") return scope.conversation_id === conversationId
        if (scope.kind === "folder") return scope.folder_id === folderId
        return scope.agent_type === agentType
      }
      return item.target_conversation_id == null || item.target_conversation_id === conversationId
    }
    return filtered.sort((a, b) => {
      const aApplicable = Boolean(isEventRule(a) ? a.applicable ?? applies(a) : applies(a))
      const bApplicable = Boolean(isEventRule(b) ? b.applicable ?? applies(b) : applies(b))
      if (sort === "active") return Number(b.enabled) - Number(a.enabled) || Number(bApplicable) - Number(aApplicable) || (isEventRule(b) ? b.priority : 0) - (isEventRule(a) ? a.priority : 0) || a.id - b.id
      if (sort === "applicable") return Number(bApplicable) - Number(aApplicable) || Number(b.enabled) - Number(a.enabled) || (isEventRule(b) ? b.priority : 0) - (isEventRule(a) ? a.priority : 0) || a.id - b.id
      if (sort === "priority") return (isEventRule(b) ? b.priority : 0) - (isEventRule(a) ? a.priority : 0) || Number(b.enabled) - Number(a.enabled) || Number(bApplicable) - Number(aApplicable) || a.id - b.id
      return Number(b.enabled) - Number(a.enabled) || Number(bApplicable) - Number(aApplicable) || a.id - b.id
    })
  }, [items, search, sort, conversations, conversationId, folderId, agentType])

  const saveRule = async (draft: EventRuleDraft) => {
    if (editingRule === "new") await eventRuleCreate(draft)
    else if (editingRule) await eventRuleUpdate(editingRule.id, draft)
    setEditingRule(null); await load()
  }
  const saveWake = async (draft: WakeDraft) => {
    if (editingWake === "new") await wakeCreate(draft, conversationId)
    else if (editingWake) await wakeUpdate(editingWake.id, draft, conversationId)
    setEditingWake(null); await load()
  }
  const loadLogs = async (ruleId: number) => {
    setSelectedLogRule(ruleId)
    setLogsLoading(true)
    try {
      const page = await eventRuleListLogs({ ruleId, conversationId, limit: 25 })
      setLogs(page.items)
    } finally {
      setLogsLoading(false)
    }
  }

  const initialScope = conversationId == null ? { kind: "global" as const } : { kind: "conversation" as const, conversation_id: conversationId }
  if (editingRule) return <div className="h-full overflow-auto"><EventRuleEditor rule={editingRule === "new" ? null : editingRule} initialScope={editingRule === "new" ? initialScope : undefined} conversations={conversations} folders={folders.map((f) => ({ id: f.id, name: f.name, alias: f.alias, path: f.path }))} agentTypes={[]} onSubmit={saveRule} onCancel={() => setEditingRule(null)} /></div>
  if (editingWake) return <WakeEditor wake={editingWake === "new" ? null : editingWake} defaultTargetConversationId={conversationId} conversations={conversations} onSubmit={saveWake} onCancel={() => setEditingWake(null)} />

  return <div className="flex h-full min-h-0 flex-col gap-4" data-testid="automation-registry-panel">
    {!dialog ? <div><h2 className="text-lg font-semibold">{t("registryTitle")}</h2><p className="text-sm text-muted-foreground">{t("registryDescription")}</p></div> : null}
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1"><Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("registrySearchPlaceholder")} aria-label={t("registrySearchPlaceholder")} /></div>
      <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{t("sortActive")}</SelectItem><SelectItem value="applicable">{t("sortApplicable")}</SelectItem><SelectItem value="priority">{t("sortPriority")}</SelectItem><SelectItem value="id">{t("sortId")}</SelectItem></SelectContent></Select>
      {dialog ? <div className="relative"><Button size="sm" onClick={() => setAddMenuOpen((open) => !open)}><Plus className="size-4" />{t("registryAddCustom")}</Button>{addMenuOpen ? <div className="absolute right-0 top-full z-10 mt-1 grid min-w-48 gap-1 rounded-xl border bg-background p-1 shadow-lg"><Button variant="ghost" className="justify-start" onClick={() => { setAddMenuOpen(false); setEditingRule("new") }}>{t("editor.contentDetection")}</Button><Button variant="ghost" className="justify-start" onClick={() => { setAddMenuOpen(false); setEditingRule("new") }}>{t("editor.forwardAfterCompletion")}</Button><Button variant="ghost" className="justify-start" onClick={() => { setAddMenuOpen(false); setEditingWake("new") }}>{t("newWake")}</Button></div> : null}</div> : <><Button size="sm" onClick={() => setEditingRule("new")}><Plus className="size-4" />{t("newRule")}</Button><Button size="sm" variant="outline" onClick={() => setEditingWake("new")}><Plus className="size-4" />{t("newWake")}</Button></>}
    </div>
    {error ? <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
     <ul className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">{visible.length ? visible.map((item) => <RegistryRow key={`${isEventRule(item) ? "event" : "wake"}-${item.id}`} item={item} conversations={conversations} conversationId={conversationId} folderId={folderId} agentType={agentType} onReload={load} onEdit={() => isEventRule(item) ? setEditingRule(item) : setEditingWake(item)} onViewLogs={isEventRule(item) ? () => void loadLogs(item.id) : undefined} />) : <li className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{t("registryEmpty")}</li>}</ul>
     {selectedLogRule != null ? <section className="rounded-xl border p-3"><h3 className="font-semibold">{t("logs.title")}</h3>{logsLoading ? null : logs.length ? <ul className="mt-2 space-y-2">{logs.map((log) => <li key={log.id} className="rounded-lg bg-muted/40 p-2 text-xs"><div className="flex justify-between gap-2"><span className="font-medium">{log.status}</span><time>{new Date(log.created_at).toLocaleString()}</time></div>{log.detail ? <p>{log.detail}</p> : null}{log.guard_reason ? <p className="text-muted-foreground">{log.guard_reason}</p> : null}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{t("logs.empty")}</p>}</section> : null}
  </div>
}

function conversationsLabel(id: number, conversations: Awaited<ReturnType<typeof listAllConversations>>) {
  return conversations.find((conversation) => conversation.id === id)?.title ?? `#${id}`
}

function RegistryRow({ item, conversations, conversationId, folderId, agentType, onReload, onEdit, onViewLogs }: { item: AutomationRegistryItem; conversations: Awaited<ReturnType<typeof listAllConversations>>; conversationId: number | null; folderId: number | null; agentType: string | null; onReload: () => Promise<void>; onEdit: () => void; onViewLogs?: () => void }) {
  const t = useTranslations("EventAutomations")
  const event = isEventRule(item)
  const wake = event ? null : item
  const name = item.name || (event ? t("event") : t("wake"))
  const target = event ? item.config.action.target_conversation_ids?.map((id) => conversations.find((c) => c.id === id)?.title ?? `#${id}`).join(", ") : wake?.target
  const applicable = event ? (item.config.scope.kind === "global" || (item.config.scope.kind === "conversation" && item.config.scope.conversation_id === conversationId) || (item.config.scope.kind === "folder" && item.config.scope.folder_id === folderId) || (item.config.scope.kind === "agent_type" && item.config.scope.agent_type === agentType)) : wake?.target_conversation_id == null || wake.target_conversation_id === conversationId
  const scopeText = event ? item.config.scope.kind === "global" ? t("scopeGlobal") : item.config.scope.kind === "conversation" ? (item.config.scope.conversation_id === conversationId ? t("scopeConversation") : conversationsLabel(item.config.scope.conversation_id, conversations)) : item.config.scope.kind === "folder" ? t("inherited") + ": " + item.config.scope.folder_id : t("inherited") + ": " + item.config.scope.agent_type : wake?.target ?? t("scopeConversation")
  return <li className="rounded-xl border p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{name}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{event ? t("event") : t("wake")}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{item.provenance ?? "user"}</span>{applicable ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px]">{t("scopeConversation")}</span> : null}</div><p className="mt-1 text-xs text-muted-foreground">{scopeText} · {event ? `${t("priority")}: ${item.priority}` : wakeDescription(wake!)}{target ? ` · ${target}` : ""}</p></div><Switch checked={item.enabled} disabled={!item.enabled && !event} onCheckedChange={async (enabled) => { if (event) await eventRuleSetEnabled(item.id, enabled); else if (!enabled && wake) await wakeCancel(item.id, wake.target_conversation_id ?? undefined); await onReload() }} aria-label={item.enabled ? t("enabled") : t("disabled")} /></div><div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{item.creator ?? t("registryUserCreated")}</span><div className="flex gap-1">{onViewLogs ? <Button size="sm" variant="ghost" onClick={onViewLogs}>{t("logs.title")}</Button> : null}<Button size="icon-sm" variant="ghost" aria-label={`${t("edit")} ${name}`} onClick={onEdit}><Pencil className="size-4" /></Button><Button size="icon-sm" variant="ghost" aria-label={`${t("delete")} ${name}`} onClick={async () => { if (event) await eventRuleDelete(item.id); else if (wake) await wakeCancel(item.id, wake.target_conversation_id ?? undefined); await onReload() }}><X className="size-4" /></Button></div></div></li>
}

function WakeEditor({ wake, defaultTargetConversationId, conversations, onSubmit, onCancel }: { wake: WakeRecord | null; defaultTargetConversationId: number | null; conversations: Awaited<ReturnType<typeof listAllConversations>>; onSubmit: (draft: WakeDraft) => Promise<void>; onCancel: () => void }) {
  const t = useTranslations("EventAutomations")
  const [name, setName] = useState(wake?.name ?? "")
  const [prompt, setPrompt] = useState(wake?.prompt ?? "")
  const [kind, setKind] = useState<WakeScheduleKind>(wake?.schedule.kind ?? "after")
  const [value, setValue] = useState(() => wake?.schedule.kind === "after" ? String(Math.round(wake.schedule.delay_ms / 1000)) : wake?.schedule.kind === "at" ? wake.schedule.at.slice(0, 16) : String(wake?.schedule.process_id ?? ""))
  const [target, setTarget] = useState(String(wake?.target_conversation_id ?? defaultTargetConversationId ?? ""))
  const submit = async () => { const schedule: WakeSchedule = kind === "after" ? { kind, delay_ms: Math.max(1, Number(value) || 1) * 1000 } : kind === "at" ? { kind, at: new Date(value).toISOString() } : { kind, process_id: value.trim() || null }; await onSubmit({ name: name.trim() || t("wake"), prompt, schedule, target_conversation_id: target ? Number(target) : null, enabled: true }) }
  return <div className="mx-auto flex max-w-xl flex-col gap-4"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{t("wakeEditorTitle")}</h3><Button size="icon-sm" variant="ghost" onClick={onCancel}><X className="size-4" /></Button></div><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("wakeNamePlaceholder")} /><Select value={kind} onValueChange={(v) => setKind(v as WakeScheduleKind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="after">{t("wakeAfter")}</SelectItem><SelectItem value="at">{t("wakeAt")}</SelectItem><SelectItem value="process_exit">{t("wakeProcessExit")}</SelectItem></SelectContent></Select><Input type={kind === "at" ? "datetime-local" : kind === "after" ? "number" : "text"} value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("wakeValuePlaceholder")} /><Select value={target} onValueChange={setTarget}><SelectTrigger><SelectValue placeholder={t("wakeTargetPlaceholder")} /></SelectTrigger><SelectContent>{conversations.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title || `#${c.id}`}</SelectItem>)}</SelectContent></Select><Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t("wakePromptPlaceholder")} /><div className="flex justify-end gap-2"><Button variant="outline" onClick={onCancel}>{t("editor.cancel")}</Button><Button onClick={() => void submit()}>{t("editor.save")}</Button></div></div>
}

type WakeScheduleKind = "after" | "at" | "process_exit"
