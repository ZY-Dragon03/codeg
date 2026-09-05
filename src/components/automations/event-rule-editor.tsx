"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Plus, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { eventRulePreview, eventRuleValidate } from "@/lib/api"
import { toErrorMessage } from "@/lib/app-error"
import { getAgentLabel } from "@/lib/custom-agents"
import { ALL_AGENT_TYPES, type AgentType } from "@/lib/types"
import type {
  DbConversationSummary,
  EventRule,
  EventRuleDraft,
  EventRulePreview,
  EventRuleScope,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  FolderSelect,
  type FolderSelectOption,
} from "@/components/shared/folder-select"
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
  scope: EventRuleScope = { kind: "global" },
  defaults?: { name?: string; prompt?: string; keywords?: string[] }
): EventRuleDraft {
  return {
    name: defaults?.name ?? "Retry failed turn",
    enabled: false,
    priority: 0,
    config: {
      scope,
      trigger: "turn_failed",
      condition: {
        kind: "contains",
        match_mode: "any",
        text_contains: defaults?.keywords ?? [
          "RetriableError",
          "TLS",
          "connection reset",
        ],
      },
      action: {
        kind: "send_to_conversation",
        conversation_ref: "source_conversation",
        prompt: defaults?.prompt ?? "继续",
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

function needsAdvanced(
  rule: EventRule | null | undefined,
  scope: EventRuleScope
) {
  if (!rule) return false
  return (
    rule.priority !== 0 ||
    scope.kind !== "global" ||
    rule.config.condition.kind !== "contains" ||
    rule.config.condition.match_mode !== "any" ||
    rule.config.action.conversation_ref !== "source_conversation"
  )
}

export function EventRuleEditor({
  rule,
  initialScope,
  conversations,
  folders = [],
  agentTypes = ALL_AGENT_TYPES,
  onSubmit,
  onCancel,
}: {
  rule?: EventRule | null
  initialScope?: EventRuleScope
  conversations: DbConversationSummary[]
  folders?: readonly FolderSelectOption[]
  agentTypes?: readonly AgentType[]
  onSubmit: (draft: EventRuleDraft) => Promise<void>
  onCancel?: () => void
}) {
  const t = useTranslations("EventAutomations")
  const [draft, setDraft] = useState<EventRuleDraft>(() =>
    rule
      ? copyDraft(rule)
      : newEventRuleDraft(initialScope, {
          name: t("editor.defaultName"),
          prompt: t("editor.defaultPrompt"),
          keywords: ["RetriableError", "TLS", "connection reset"],
        })
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sampleText, setSampleText] = useState("")
  const [sampleErrorKind, setSampleErrorKind] = useState("")
  const [sampleConversationId, setSampleConversationId] = useState<number>(
    initialScope?.kind === "conversation" ? initialScope.conversation_id : 0
  )
  const [preview, setPreview] = useState<EventRulePreview | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(() =>
    needsAdvanced(
      rule,
      rule?.config.scope ?? initialScope ?? { kind: "global" }
    )
  )
  const [previewOpen, setPreviewOpen] = useState(false)
  const [technicalOpen, setTechnicalOpen] = useState(false)
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
  const folderOptions = useMemo(() => {
    if (
      scope.kind !== "folder" ||
      folders.some((folder) => folder.id === scope.folder_id)
    ) {
      return folders
    }
    return [
      ...folders,
      {
        id: scope.folder_id,
        name: t("editor.folderPlaceholder"),
        alias: null,
        path: null,
      },
    ]
  }, [folders, scope, t])
  const agentOptions = useMemo(() => {
    const values = new Set<AgentType>(agentTypes)
    conversations.forEach((conversation) => values.add(conversation.agent_type))
    if (scope.kind === "agent_type") values.add(scope.agent_type)
    return [...values].sort((a, b) =>
      getAgentLabel(a).localeCompare(getAgentLabel(b))
    )
  }, [agentTypes, conversations, scope])

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
      if (!fallbackConversation) throw new Error(t("editor.selectSample"))
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
  const targetTitle = preview?.resolved_target_id
    ? conversations.find(
        (conversation) => conversation.id === preview.resolved_target_id
      )?.title || t("editor.selectConversation")
    : t("editor.sourceConversation")

  return (
    <div className="flex flex-col gap-5" data-testid="event-rule-editor">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("editor.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("editor.description")}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          {draft.enabled ? t("editor.enabled") : t("editor.disabled")}
          <Switch
            checked={draft.enabled}
            onCheckedChange={(enabled) => update((d) => ({ ...d, enabled }))}
            aria-label={
              draft.enabled ? t("editor.enabled") : t("editor.disabled")
            }
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

      <fieldset className="grid gap-3 rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">
          {t("editor.when")}
        </legend>
        <p className="text-sm text-muted-foreground">
          {t("editor.whenDescription")}
        </p>
        <div className="grid gap-2">
          <Label>{t("editor.errorContains")}</Label>
          {condition.kind === "contains" ? (
            <>
              <div className="flex items-center gap-2">
                <Select
                  value={condition.match_mode}
                  onValueChange={(match_mode) =>
                    setCondition({
                      ...condition,
                      match_mode: match_mode as "any" | "all",
                    })
                  }
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">{t("editor.any")}</SelectItem>
                    <SelectItem value="all">{t("editor.all")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {keywords.map((keyword, index) => (
                <div className="flex gap-2" key={String(index) + "-" + keyword}>
                  <Input
                    aria-label={t("editor.keyword") + " " + (index + 1)}
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
                    aria-label={t("editor.removeKeyword", { count: index + 1 })}
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
                  setCondition({
                    ...condition,
                    text_contains: [...keywords, ""],
                  })
                }
              >
                <Plus className="size-4" /> {t("editor.addKeyword")}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(
                condition.kind === "none"
                  ? "conditionNone"
                  : condition.kind === "regex"
                    ? "conditionRegex"
                    : "conditionErrorKind"
              )}
            </p>
          )}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">
          {t("editor.then")}
        </legend>
        <p className="text-sm text-muted-foreground">
          {t("editor.destinationHint")}
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="event-rule-prompt">{t("editor.prompt")}</Label>
          <Textarea
            id="event-rule-prompt"
            placeholder={t("editor.promptPlaceholder")}
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
        <p className="text-xs text-muted-foreground">
          {t("editor.sourceConversation")}
        </p>
      </fieldset>

      <fieldset className="grid gap-3 rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">
          {t("editor.limits")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="event-rule-max-attempts">
              {t("editor.maxAttempts")}
            </Label>
            <Input
              id="event-rule-max-attempts"
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
            <Label htmlFor="event-rule-cooldown">{t("editor.cooldown")}</Label>
            <Input
              id="event-rule-cooldown"
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
          {t("editor.limitsHint", {
            count: draft.config.guard.max_attempts,
            seconds: Math.round(draft.config.guard.cooldown_ms / 1000),
          })}
        </p>
      </fieldset>

      <Collapsible
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        className="rounded-xl border p-4"
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between px-0 hover:bg-transparent"
          >
            <span>
              <span className="block text-left font-semibold">
                {t("editor.test")}
              </span>
              <span className="block text-left text-xs font-normal text-muted-foreground">
                {t("editor.testDescription")}
              </span>
            </span>
            <ChevronDown
              className={
                previewOpen
                  ? "size-4 rotate-180 transition-transform"
                  : "size-4 transition-transform"
              }
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-3 pt-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>{t("editor.sampleConversation")}</Label>
              <ConversationSelect
                conversations={sortedConversations}
                folders={folders}
                value={sampleConversationId}
                placeholder={t("editor.selectConversation")}
                onChange={setSampleConversationId}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="event-rule-sample-error">
                {t("editor.sampleErrorKind")}
              </Label>
              <Input
                id="event-rule-sample-error"
                value={sampleErrorKind}
                onChange={(e) => setSampleErrorKind(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="event-rule-sample-text">
              {t("editor.failedText")}
            </Label>
            <Textarea
              id="event-rule-sample-text"
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
            />
          </div>
          <Button variant="outline" className="w-fit" onClick={runPreview}>
            {t("editor.runPreview")}
          </Button>
          {preview ? (
            <div className="grid gap-2 rounded-xl bg-muted p-3 text-sm">
              <p>
                {preview.scope_matches
                  ? t("preview.scopeMatch")
                  : t("preview.scopeMiss")}
              </p>
              <p>
                {preview.condition_matches
                  ? t("preview.conditionMatch")
                  : t("preview.conditionMiss")}
              </p>
              {preview.draft_is_winner ? (
                <p className="font-medium">{t("preview.willRun")}</p>
              ) : null}
              {preview.draft_is_shadowed ? (
                <p>
                  {t("preview.shadowed", {
                    rule: preview.winner_rule_id ?? "?",
                  })}
                </p>
              ) : null}
              {!preview.draft_is_winner && !preview.draft_is_shadowed ? (
                <p>{t("preview.noWinner")}</p>
              ) : null}
              {!preview.target_exists ? (
                <p>{t("preview.targetMissing")}</p>
              ) : !preview.target_available ? (
                <p>{t("preview.targetUnavailable", { target: targetTitle })}</p>
              ) : (
                <p>{t("preview.targetReady", { target: targetTitle })}</p>
              )}
              {preview.draft_is_winner &&
              preview.target_exists &&
              preview.target_available ? (
                <p>
                  {t("preview.sendPrompt", {
                    target: targetTitle,
                    reason: action.prompt,
                  })}
                </p>
              ) : null}
              {preview.guard_blocked ? (
                <p>
                  {t("preview.guardBlocked", { reason: preview.guard_blocked })}
                </p>
              ) : null}
              <Collapsible open={technicalOpen} onOpenChange={setTechnicalOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-fit px-0 text-xs"
                  >
                    {t("preview.technical")}{" "}
                    <ChevronDown
                      className={
                        technicalOpen
                          ? "size-3 rotate-180 transition-transform"
                          : "size-3 transition-transform"
                      }
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="grid gap-1 pt-2 text-xs text-muted-foreground">
                  <span>scope_matches: {String(preview.scope_matches)}</span>
                  <span>
                    condition_matches: {String(preview.condition_matches)}
                  </span>
                  <span>
                    resolved_target_id: {String(preview.resolved_target_id)}
                  </span>
                  <span>target_exists: {String(preview.target_exists)}</span>
                  <span>
                    target_available: {String(preview.target_available)}
                  </span>
                  <span>winner_rule_id: {String(preview.winner_rule_id)}</span>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        className="rounded-xl border p-4"
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between px-0 hover:bg-transparent"
          >
            <span>
              <span className="block text-left font-semibold">
                {t("editor.advanced")}
              </span>
              <span className="block text-left text-xs font-normal text-muted-foreground">
                {t("editor.advancedDescription")}
              </span>
            </span>
            <ChevronDown
              className={
                advancedOpen
                  ? "size-4 rotate-180 transition-transform"
                  : "size-4 transition-transform"
              }
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-4 pt-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="event-rule-name">{t("editor.name")}</Label>
              <Input
                id="event-rule-name"
                placeholder={t("editor.namePlaceholder")}
                value={draft.name}
                onChange={(e) =>
                  update((d) => ({ ...d, name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="event-rule-priority">
                {t("editor.priority")}
              </Label>
              <Input
                id="event-rule-priority"
                type="number"
                value={draft.priority}
                onChange={(e) =>
                  update((d) => ({
                    ...d,
                    priority: Number(e.target.value) || 0,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("editor.priorityHint")}
              </p>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("editor.scope")}</Label>
            <Select
              value={scope.kind}
              onValueChange={(value) =>
                setScope(scopeWithKind(value as EventRuleScope["kind"], scope))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">{t("scopeGlobal")}</SelectItem>
                <SelectItem value="conversation">
                  {t("scopeConversation")}
                </SelectItem>
                <SelectItem value="folder">{t("scopeFolder")}</SelectItem>
                <SelectItem value="agent_type">{t("scopeAgent")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("editor.scopeHint")}
            </p>
          </div>
          {scope.kind === "conversation" ? (
            <div className="grid gap-1.5">
              <Label>{t("scopeConversation")}</Label>
              <ConversationSelect
                conversations={sortedConversations}
                folders={folders}
                value={scope.conversation_id}
                placeholder={t("editor.selectConversation")}
                onChange={(id) =>
                  setScope({ kind: "conversation", conversation_id: id })
                }
              />
            </div>
          ) : null}
          {scope.kind === "folder" ? (
            <div className="grid gap-1.5">
              <Label>{t("editor.folder")}</Label>
              <FolderSelect
                folders={folderOptions}
                value={scope.folder_id}
                variant="field"
                placeholder={t("editor.folderPlaceholder")}
                title={t("editor.folder")}
                onChange={(id) => setScope({ kind: "folder", folder_id: id })}
              />
            </div>
          ) : null}
          {scope.kind === "agent_type" ? (
            <div className="grid gap-1.5">
              <Label>{t("editor.agent")}</Label>
              <Select
                value={scope.agent_type}
                onValueChange={(agent_type) =>
                  setScope({ kind: "agent_type", agent_type })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("editor.agentPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {agentOptions.map((agent) => (
                    <SelectItem value={agent} key={agent}>
                      {getAgentLabel(agent)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label>{t("editor.errorContains")}</Label>
            <Select
              value={condition.kind}
              onValueChange={(kind) =>
                setCondition(
                  kind === "contains"
                    ? { kind, match_mode: "any", text_contains: keywords }
                    : kind === "regex"
                      ? {
                          kind,
                          match_mode: "any",
                          regex: condition.regex ?? "",
                        }
                      : kind === "error_kind"
                        ? {
                            kind,
                            match_mode: "any",
                            error_kind: condition.error_kind ?? "",
                          }
                        : { kind: "none", match_mode: "any" }
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("conditionNone")}</SelectItem>
                <SelectItem value="contains">
                  {t("conditionContains")}
                </SelectItem>
                <SelectItem value="regex">{t("conditionRegex")}</SelectItem>
                <SelectItem value="error_kind">
                  {t("conditionErrorKind")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {condition.kind === "regex" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="event-rule-regex">{t("conditionRegex")}</Label>
              <Input
                id="event-rule-regex"
                value={condition.regex ?? ""}
                onChange={(e) =>
                  setCondition({ ...condition, regex: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("editor.scopeHint")}
              </p>
            </div>
          ) : null}
          {condition.kind === "error_kind" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="event-rule-error-kind">
                {t("conditionErrorKind")}
              </Label>
              <Input
                id="event-rule-error-kind"
                value={condition.error_kind ?? ""}
                onChange={(e) =>
                  setCondition({ ...condition, error_kind: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("editor.scopeHint")}
              </p>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label>{t("editor.destination")}</Label>
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
                  {t("editor.sourceConversation")}
                </SelectItem>
                <SelectItem value="specific_conversation">
                  {t("editor.specificConversation")}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("editor.destinationHint")}
            </p>
          </div>
          {action.conversation_ref === "specific_conversation" ? (
            <div className="grid gap-1.5">
              <Label>{t("editor.specificConversation")}</Label>
              <ConversationSelect
                conversations={sortedConversations}
                folders={folders}
                value={action.conversation_id ?? 0}
                placeholder={t("editor.selectConversation")}
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
        </CollapsibleContent>
      </Collapsible>

      <div className="flex justify-end gap-2 border-t pt-4">
        {onCancel ? (
          <Button variant="outline" onClick={onCancel}>
            {t("editor.cancel")}
          </Button>
        ) : null}
        <Button disabled={saving} onClick={save}>
          {saving ? t("editor.saving") : t("editor.save")}
        </Button>
      </div>
    </div>
  )
}

function ConversationSelect({
  conversations,
  folders,
  value,
  placeholder,
  onChange,
}: {
  conversations: DbConversationSummary[]
  folders: readonly FolderSelectOption[]
  value: number
  placeholder: string
  onChange: (id: number) => void
}) {
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders]
  )
  return (
    <Select
      value={value ? String(value) : ""}
      onValueChange={(id) => onChange(Number(id))}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {conversations.map((conversation) => {
          const folder = folderById.get(conversation.folder_id)
          const title = conversation.title || placeholder
          const metadata = [
            getAgentLabel(conversation.agent_type),
            folder?.alias ?? folder?.name,
          ]
            .filter(Boolean)
            .join(" · ")
          return (
            <SelectItem value={String(conversation.id)} key={conversation.id}>
              {title}
              {metadata ? " · " + metadata : ""}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
