"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Pencil, Plus, Search, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { automationRegistryList, eventRuleCreate, eventRuleDelete, eventRuleSetEnabled, eventRuleUpdate, listAllConversations, wakeCancel, wakeCreate, wakeUpdate } from "@/lib/api"
import type { AutomationRegistryEventRule, AutomationRegistryItem, EventRule, EventRuleDraft, WakeDraft, WakeRecord, WakeSchedule } from "@/lib/types"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { onTransportReconnect } from "@/lib/platform"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EventRuleEditor } from "./event-rule-editor"

type SortKey = "active" | "applicable" | "priority" | "id"
const isEventRule = (item: AutomationRegistryItem): item is AutomationRegistryEventRule => "config" in item

function wakeDescription(wake: WakeRecord): string {
  const schedule = wake.schedule
  if (schedule.kind === "after") return `after ${Math.round(schedule.delay_ms / 1000)}s`
  if (schedule.kind === "at") return `at ${new Date(schedule.at).toLocaleString()}`
  return "when process exits"
}

export function AutomationRegistryPanel() {
  const t = useTranslations("EventAutomations")
  const folders = useAppWorkspaceStore((state) => state.allFolders)
  const [items, setItems] = useState<AutomationRegistryItem[]>([])
  const [conversations, setConversations] = useState<Awaited<ReturnType<typeof listAllConversations>>>([])
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("active")
  const [editingRule, setEditingRule] = useState<EventRule | "new" | null>(null)
  const [editingWake, setEditingWake] = useState<WakeRecord | "new" | null>(null)
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
      const event = isEventRule(item)
      const rule = event ? item : null
      const wake = event ? null : item
      const values = event
        ? ["event_rule", rule.name, rule.creator, rule.provenance, rule.config.condition.regex, ...(rule.config.condition.text_contains ?? []), rule.config.action.prompt, rule.config.action.additional_prompt, ...(rule.config.action.target_conversation_ids ?? []).map((id) => conversationsLabel(id, conversations))]
        : ["wake", wake.name, wake.creator, wake.provenance, wake.prompt, wake.target, wake.description, wakeDescription(wake)]
      return values.filter(Boolean).join(" ").toLocaleLowerCase().includes(needle)
    })
    return filtered.sort((a, b) => {
      if (sort === "active") return Number(b.enabled) - Number(a.enabled) || b.id - a.id
      if (sort === "applicable") return Number(Boolean(b.applicable)) - Number(Boolean(a.applicable)) || b.id - a.id
      if (sort === "priority") return (isEventRule(b) ? b.priority : 0) - (isEventRule(a) ? a.priority : 0) || b.id - a.id
      return b.id - a.id
    })
  }, [items, search, sort, conversations])

  const saveRule = async (draft: EventRuleDraft) => {
    if (editingRule === "new") await eventRuleCreate(draft)
    else if (editingRule) await eventRuleUpdate(editingRule.id, draft)
    setEditingRule(null); await load()
  }
  const saveWake = async (draft: WakeDraft) => {
    if (editingWake === "new") await wakeCreate(draft)
    else if (editingWake) await wakeUpdate(editingWake.id, draft)
    setEditingWake(null); await load()
  }

  if (editingRule) return <div className="h-full overflow-auto"><EventRuleEditor rule={editingRule === "new" ? null : editingRule} conversations={conversations} folders={folders.map((f) => ({ id: f.id, name: f.name, alias: f.alias, path: f.path }))} agentTypes={[]} onSubmit={saveRule} onCancel={() => setEditingRule(null)} /></div>
  if (editingWake) return <WakeEditor wake={editingWake === "new" ? null : editingWake} conversations={conversations} onSubmit={saveWake} onCancel={() => setEditingWake(null)} />

  return <div className="flex h-full min-h-0 flex-col gap-4" data-testid="automation-registry-panel">
    <div><h2 className="text-lg font-semibold">{t("registryTitle")}</h2><p className="text-sm text-muted-foreground">{t("registryDescription")}</p></div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1"><Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("registrySearchPlaceholder")} aria-label={t("registrySearchPlaceholder")} /></div>
      <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{t("sortActive")}</SelectItem><SelectItem value="applicable">{t("sortApplicable")}</SelectItem><SelectItem value="priority">{t("sortPriority")}</SelectItem><SelectItem value="id">{t("sortId")}</SelectItem></SelectContent></Select>
      <Button size="sm" onClick={() => setEditingRule("new")}><Plus className="size-4" />{t("newRule")}</Button><Button size="sm" variant="outline" onClick={() => setEditingWake("new")}><Plus className="size-4" />{t("newWake")}</Button>
    </div>
    {error ? <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
    <ul className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">{visible.length ? visible.map((item) => <RegistryRow key={`${isEventRule(item) ? "event" : "wake"}-${item.id}`} item={item} conversations={conversations} onReload={load} onEdit={() => isEventRule(item) ? setEditingRule(item) : setEditingWake(item)} />) : <li className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{t("registryEmpty")}</li>}</ul>
  </div>
}

function conversationsLabel(id: number, conversations: Awaited<ReturnType<typeof listAllConversations>>) {
  return conversations.find((conversation) => conversation.id === id)?.title ?? `#${id}`
}

function RegistryRow({ item, conversations, onReload, onEdit }: { item: AutomationRegistryItem; conversations: Awaited<ReturnType<typeof listAllConversations>>; onReload: () => Promise<void>; onEdit: () => void }) {
  const t = useTranslations("EventAutomations")
  const event = isEventRule(item)
  const wake = event ? null : item
  const name = item.name || (event ? t("event") : t("wake"))
  const target = event ? item.config.action.target_conversation_ids?.map((id) => conversations.find((c) => c.id === id)?.title ?? `#${id}`).join(", ") : wake?.target
  return <li className="rounded-xl border p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{name}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{event ? t("event") : t("wake")}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{item.provenance ?? "user"}</span></div><p className="mt-1 text-xs text-muted-foreground">{event ? `${t("priority")}: ${item.priority}` : wakeDescription(wake!)}{target ? ` · ${target}` : ""}</p></div><Switch checked={item.enabled} onCheckedChange={async (enabled) => { if (event) await eventRuleSetEnabled(item.id, enabled); else if (!enabled) await wakeCancel(item.id); await onReload() }} aria-label={item.enabled ? t("enabled") : t("disabled")} /></div><div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{item.creator ?? t("registryUserCreated")}</span><div className="flex gap-1"><Button size="icon-sm" variant="ghost" aria-label={`${t("edit")} ${name}`} onClick={onEdit}><Pencil className="size-4" /></Button><Button size="icon-sm" variant="ghost" aria-label={`${t("delete")} ${name}`} onClick={async () => { if (event) await eventRuleDelete(item.id); else await wakeCancel(item.id); await onReload() }}><X className="size-4" /></Button></div></div></li>
}

function WakeEditor({ wake, conversations, onSubmit, onCancel }: { wake: WakeRecord | null; conversations: Awaited<ReturnType<typeof listAllConversations>>; onSubmit: (draft: WakeDraft) => Promise<void>; onCancel: () => void }) {
  const t = useTranslations("EventAutomations")
  const [name, setName] = useState(wake?.name ?? "")
  const [prompt, setPrompt] = useState(wake?.prompt ?? "")
  const [kind, setKind] = useState<WakeScheduleKind>(wake?.schedule.kind ?? "after")
  const [value, setValue] = useState(() => wake?.schedule.kind === "after" ? String(Math.round(wake.schedule.delay_ms / 1000)) : wake?.schedule.kind === "at" ? wake.schedule.at.slice(0, 16) : String(wake?.schedule.process_id ?? ""))
  const [target, setTarget] = useState(String(wake?.target_conversation_id ?? ""))
  const submit = async () => { const schedule: WakeSchedule = kind === "after" ? { kind, delay_ms: Math.max(1, Number(value) || 1) * 1000 } : kind === "at" ? { kind, at: new Date(value).toISOString() } : { kind, process_id: Number(value) || null }; await onSubmit({ name: name.trim() || t("wake"), prompt, schedule, target_conversation_id: target ? Number(target) : null, enabled: true }) }
  return <div className="mx-auto flex max-w-xl flex-col gap-4"><div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{t("wakeEditorTitle")}</h3><Button size="icon-sm" variant="ghost" onClick={onCancel}><X className="size-4" /></Button></div><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("wakeNamePlaceholder")} /><Select value={kind} onValueChange={(v) => setKind(v as WakeScheduleKind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="after">{t("wakeAfter")}</SelectItem><SelectItem value="at">{t("wakeAt")}</SelectItem><SelectItem value="process_exit">{t("wakeProcessExit")}</SelectItem></SelectContent></Select><Input type={kind === "at" ? "datetime-local" : "number"} value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("wakeValuePlaceholder")} /><Select value={target} onValueChange={setTarget}><SelectTrigger><SelectValue placeholder={t("wakeTargetPlaceholder")} /></SelectTrigger><SelectContent>{conversations.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title || `#${c.id}`}</SelectItem>)}</SelectContent></Select><Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t("wakePromptPlaceholder")} /><div className="flex justify-end gap-2"><Button variant="outline" onClick={onCancel}>{t("cancel")}</Button><Button onClick={() => void submit()}>{t("save")}</Button></div></div>
}

type WakeScheduleKind = "after" | "at" | "process_exit"
