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
import { Checkbox } from "@/components/ui/checkbox"
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
      automation_type: "content_detection",
      scope,
      trigger: "content_matched",
      condition: {
        kind: "contains",
        source: "ai_output",
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
        target_conversation_ids: [],
        include_source_context: false,
        include_recent_user_message: false,
        include_final_report: false,
        additional_prompt: null,
        recent_user_message_ignore_rules: [
          { kind: "exact", value: "继续" },
          { kind: "exact", value: "continue" },
        ],
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
          {t("editor.creationType")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant={
              (draft.config.automation_type ?? "content_detection") ===
              "content_detection"
                ? "default"
                : "outline"
            }
            onClick={() =>
              update((d) => ({
                ...d,
                config: {
                  ...d.config,
                  automation_type: "content_detection",
                  trigger: "content_matched",
                },
              }))
            }
          >
            {t("editor.contentDetection")}
          </Button>
          <Button
            type="button"
            variant={
              draft.config.automation_type === "forward_after_task_completion"
                ? "default"
                : "outline"
            }
            onClick={() =>
              update((d) => ({
                ...d,
                config: {
                  ...d.config,
                  automation_type: "forward_after_task_completion",
                  trigger: "turn_completed",
                },
              }))
            }
          >
            {t("editor.forwardAfterCompletion")}
          </Button>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">
          {t("editor.when")}
        </legend>
        <p className="text-sm text-muted-foreground">
          {t("editor.whenDescription")}
        </p>
        {draft.config.automation_type !== "forward_after_task_completion" ? (
          <div className="grid gap-2">
            <Label>{t("editor.contentSource")}</Label>
            <div className="flex flex-wrap gap-2">
              {(["ai_output", "error", "both"] as const).map((source) => (
                <Button
                  type="button"
                  key={source}
                  size="sm"
                  variant={
                    (condition.source ?? "ai_output") === source
                      ? "default"
                      : "outline"
                  }
                  onClick={() => setCondition({ ...condition, source })}
                >
                  {source === "ai_output"
                    ? t("editor.sourceAiOutput")
                    : source === "error"
                      ? t("editor.sourceError")
                      : t("editor.sourceBoth")}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
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
        <div className="grid gap-2 rounded-lg bg-muted/40 p-3">
          <Label>{t("editor.payload")}</Label>
          {(
            [
              ["include_source_context", t("editor.includeSourceContext")],
              [
                "include_recent_user_message",
                t("editor.includeRecentUserMessage"),
              ],
              ["include_final_report", t("editor.includeFinalReport")],
            ] as const
          ).map(([key, label]) => (
            <label className="flex items-center gap-2 text-sm" key={key}>
              <Checkbox
                checked={Boolean(action[key])}
                onCheckedChange={(checked) =>
                  update((d) => ({
                    ...d,
                    config: {
                      ...d.config,
                      action: {
                        ...d.config.action,
                        [key]: checked === true,
                      },
                    },
                  }))
                }
              />
              {label}
            </label>
          ))}
          <Label htmlFor="event-rule-additional-prompt">
            {t("editor.additionalPrompt")}
          </Label>
          <Textarea
            id="event-rule-additional-prompt"
            value={action.additional_prompt ?? ""}
            onChange={(e) =>
              update((d) => ({
                ...d,
                config: {
                  ...d.config,
                  action: {
                    ...d.config.action,
                    additional_prompt: e.target.value,
                  },
                },
              }))
            }
          />
          <div className="grid gap-2 rounded-lg border bg-background p-3">
            <Label>{t("editor.recentUserIgnore")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("editor.recentUserIgnoreHint")}
            </p>
            {(action.recent_user_message_ignore_rules ?? []).map(
              (rule, index) => (
                <div className="flex gap-2" key={`${index}-${rule.kind}`}>
                  <div className="flex shrink-0 gap-1" role="group">
                    {(
                      [
                        ["exact", t("editor.ignoreExact")],
                        ["contains", t("editor.ignoreContains")],
                        ["regex", t("editor.ignoreRegex")],
                      ] as const
                    ).map(([kind, label]) => (
                      <Button
                        key={kind}
                        type="button"
                        size="sm"
                        variant={rule.kind === kind ? "default" : "outline"}
                        aria-pressed={rule.kind === kind}
                        onClick={() =>
                          update((d) => ({
                            ...d,
                            config: {
                              ...d.config,
                              action: {
                                ...d.config.action,
                                recent_user_message_ignore_rules: (
                                  d.config.action
                                    .recent_user_message_ignore_rules ?? []
                                ).map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, kind } : item
                                ),
                              },
                            },
                          }))
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <Input
                    value={rule.value}
                    aria-label={t("editor.recentUserIgnore")}
                    onChange={(e) =>
                      update((d) => ({
                        ...d,
                        config: {
                          ...d.config,
                          action: {
                            ...d.config.action,
                            recent_user_message_ignore_rules: (
                              d.config.action
                                .recent_user_message_ignore_rules ?? []
                            ).map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, value: e.target.value }
                                : item
                            ),
                          },
                        },
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("editor.removeIgnoreRule")}
                    onClick={() =>
                      update((d) => ({
                        ...d,
                        config: {
                          ...d.config,
                          action: {
                            ...d.config.action,
                            recent_user_message_ignore_rules: (
                              d.config.action
                                .recent_user_message_ignore_rules ?? []
                            ).filter((_, itemIndex) => itemIndex !== index),
                          },
                        },
                      }))
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              )
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() =>
                update((d) => ({
                  ...d,
                  config: {
                    ...d.config,
                    action: {
                      ...d.config.action,
                      recent_user_message_ignore_rules: [
                        ...(d.config.action.recent_user_message_ignore_rules ??
                          []),
                        { kind: "exact", value: "" },
                      ],
                    },
                  },
                }))
              }
            >
              <Plus className="size-4" /> {t("editor.addIgnoreRule")}
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>{t("editor.additionalTargets")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("editor.additionalTargetsHint")}
          </p>
          <div className="grid max-h-48 gap-2 overflow-auto rounded-lg border p-2">
            {sortedConversations.map((conversation) => {
              const checked = (action.target_conversation_ids ?? []).includes(
                conversation.id
              )
              const metadata = [
                getAgentLabel(conversation.agent_type),
                folders.find((folder) => folder.id === conversation.folder_id)
                  ?.alias,
              ]
                .filter(Boolean)
                .join(" · ")
              return (
                <label
                  className="flex items-start gap-2 text-sm"
                  key={conversation.id}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) =>
                      update((d) => {
                        const current =
                          d.config.action.target_conversation_ids ?? []
                        const ids =
                          next === true
                            ? [...new Set([...current, conversation.id])]
                            : current.filter((id) => id !== conversation.id)
                        return {
                          ...d,
                          config: {
                            ...d.config,
                            action: {
                              ...d.config.action,
                              target_conversation_ids: ids,
                            },
                          },
                        }
                      })
                    }
                  />
                  <span>
                    {conversation.title || t("editor.selectConversation")}
                    {metadata ? (
                      <span className="block text-xs text-muted-foreground">
                        {metadata}
                      </span>
                    ) : null}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
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
                    ? {
                        kind,
                        source: condition.source ?? "ai_output",
                        match_mode: "any",
                        text_contains: keywords,
                      }
                    : kind === "regex"
                      ? {
                          kind,
                          source: condition.source ?? "ai_output",
                          match_mode: "any",
                          regex: condition.regex ?? "",
                        }
                      : kind === "error_kind"
                        ? {
                            kind,
                            source: "error",
                            match_mode: "any",
                            error_kind: condition.error_kind ?? "",
                            error_severity: condition.error_severity ?? "",
                            error_title: condition.error_title ?? "",
                            error_details: condition.error_details ?? "",
                          }
                        : {
                            kind: "none",
                            source: condition.source ?? "ai_output",
                            match_mode: "any",
                          }
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
              <Label htmlFor="event-rule-error-severity">
                {t("editor.errorSeverity")}
              </Label>
              <Input
                id="event-rule-error-severity"
                value={condition.error_severity ?? ""}
                onChange={(e) =>
                  setCondition({ ...condition, error_severity: e.target.value })
                }
              />
              <Label htmlFor="event-rule-error-title">
                {t("editor.errorTitle")}
              </Label>
              <Input
                id="event-rule-error-title"
                value={condition.error_title ?? ""}
                onChange={(e) =>
                  setCondition({ ...condition, error_title: e.target.value })
                }
              />
              <Label htmlFor="event-rule-error-details">
                {t("editor.errorDetails")}
              </Label>
              <Textarea
                id="event-rule-error-details"
                value={condition.error_details ?? ""}
                onChange={(e) =>
                  setCondition({ ...condition, error_details: e.target.value })
                }
              />
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
