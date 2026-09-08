"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { terminalList } from "@/lib/api"
import type {
  DbConversationSummary,
  WakeDraft,
  WakeRecord,
  WakeSchedule,
} from "@/lib/types"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { WakeProcessSelector } from "./wake-process-selector"
import { AutomationSubpageHeader } from "./automation-subpage-header"
import {
  AutomationSubpageForm,
  AutomationSubpageSurface,
} from "./automation-dialog-layout"
import { resolveWakeConversationId } from "@/lib/wake-wire"
import {
  delayToMs,
  formatClientTimezone,
  isAutoWakeName,
  msToDelayParts,
  parseDatetimeLocalToIso,
  toDatetimeLocalValue,
  type DelayUnit,
  validateWakeDraft,
} from "./wake-editor-utils"

type WakeScheduleKind = "after" | "at" | "process_exit"

function initialKind(wake: WakeRecord | null): WakeScheduleKind {
  return wake?.schedule.kind ?? "after"
}

function initialDelay(wake: WakeRecord | null) {
  if (wake?.schedule.kind === "after") return msToDelayParts(wake.schedule.delay_ms)
  return { amount: 30, unit: "minutes" as DelayUnit }
}

function initialScheduledAt(wake: WakeRecord | null) {
  if (wake?.schedule.kind === "at") return toDatetimeLocalValue(wake.schedule.at)
  const nextHour = new Date()
  nextHour.setMinutes(nextHour.getMinutes() + 60, 0, 0)
  return toDatetimeLocalValue(nextHour.toISOString())
}

function initialProcessId(wake: WakeRecord | null) {
  if (wake?.schedule.kind === "process_exit") {
    const id = wake.schedule.process_id
    return id == null ? "" : String(id)
  }
  return ""
}

function initialName(wake: WakeRecord | null) {
  if (!wake?.name) return ""
  if (isAutoWakeName(wake.name, wake.id)) return ""
  return wake.name
}

function buildSchedule(
  kind: WakeScheduleKind,
  delayAmount: string,
  delayUnit: DelayUnit,
  scheduledAt: string,
  processTerminalId: string
): WakeSchedule {
  if (kind === "after") {
    return {
      kind,
      delay_ms: delayToMs(Number(delayAmount), delayUnit),
    }
  }
  if (kind === "at") {
    return { kind, at: parseDatetimeLocalToIso(scheduledAt) }
  }
  return { kind, process_id: processTerminalId }
}

export function WakeEditor({
  wake,
  defaultTargetConversationId,
  conversations,
  subpageTitle,
  rearmNotice,
  saveLabel,
  onSubmit,
  onCancel,
}: {
  wake: WakeRecord | null
  defaultTargetConversationId: number | null
  conversations: DbConversationSummary[]
  subpageTitle: string
  rearmNotice?: "past_at" | "stale_process"
  saveLabel?: string
  onSubmit: (draft: WakeDraft) => Promise<void>
  onCancel: () => void
}) {
  const t = useTranslations("EventAutomations")
  const folders = useAppWorkspaceStore((state) => state.allFolders)
  const timezone = useMemo(() => formatClientTimezone(), [])
  const folderPaths = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.path])),
    [folders]
  )
  const preferredFolderPath = useMemo(() => {
    const conversationId =
      resolveWakeConversationId({
        target_conversation_id: wake?.target_conversation_id,
        target: wake?.target,
      }) ?? defaultTargetConversationId
    if (!conversationId) return null
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation) return null
    return folderPaths.get(conversation.folder_id) ?? null
  }, [wake, defaultTargetConversationId, conversations, folderPaths])

  const [name, setName] = useState(() => initialName(wake))
  const [prompt, setPrompt] = useState(wake?.prompt ?? "")
  const [kind, setKind] = useState<WakeScheduleKind>(() => initialKind(wake))
  const [delayAmount, setDelayAmount] = useState(() =>
    String(initialDelay(wake).amount)
  )
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(
    () => initialDelay(wake).unit
  )
  const [scheduledAt, setScheduledAt] = useState(() => initialScheduledAt(wake))
  const [processTerminalId, setProcessTerminalId] = useState(() =>
    initialProcessId(wake)
  )
  const [targetConversationId, setTargetConversationId] = useState(() =>
    String(
      resolveWakeConversationId({
        target_conversation_id: wake?.target_conversation_id,
        target: wake?.target,
      }) ?? defaultTargetConversationId ?? ""
    )
  )
  const [terminals, setTerminals] = useState<Awaited<ReturnType<typeof terminalList>>>(
    []
  )
  const [loadingTerminals, setLoadingTerminals] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingTerminals(true)
    void terminalList()
      .then((items) => {
        if (!cancelled) setTerminals(items)
      })
      .catch(() => {
        if (!cancelled) setTerminals([])
      })
      .finally(() => {
        if (!cancelled) setLoadingTerminals(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const validationKey = validateWakeDraft({
    kind,
    delayAmount,
    scheduledAt,
    processTerminalId,
    prompt,
  })

  const validationMessage = validationKey
    ? t(`wakeValidation.${validationKey}`)
    : null

  const submit = async () => {
    const issue = validateWakeDraft({
      kind,
      delayAmount,
      scheduledAt,
      processTerminalId,
      prompt,
    })
    if (issue) {
      setError(t(`wakeValidation.${issue}`))
      return
    }
    const targetId = Number(targetConversationId)
    if (!targetConversationId || !Number.isFinite(targetId) || targetId <= 0) {
      setError(t("wakeValidation.targetRequired"))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const trimmedName = name.trim()
      await onSubmit({
        display_name: trimmedName.length > 0 ? trimmedName : null,
        schedule: buildSchedule(
          kind,
          delayAmount,
          delayUnit,
          scheduledAt,
          processTerminalId
        ),
        prompt: prompt.trim(),
        target_conversation_id: targetId,
        enabled: true,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AutomationSubpageSurface data-testid="wake-editor">
      <AutomationSubpageHeader title={subpageTitle} onBack={onCancel} />

      <AutomationSubpageForm>
      {rearmNotice ? (
        <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
          {rearmNotice === "past_at"
            ? t("registry.wakeRearmPastAtNotice")
            : t("registry.wakeRearmStaleProcessNotice")}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="wake-name">{t("wakeNameLabel")}</Label>
        <Input
          id="wake-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("wakeNamePlaceholder")}
        />
        <p className="text-xs text-muted-foreground">{t("wakeNameOptionalHint")}</p>
      </div>

      <div className="space-y-3">
        <Label>{t("wakeTriggerLabel")}</Label>
        <RadioGroup
          value={kind}
          onValueChange={(value) => setKind(value as WakeScheduleKind)}
          className="grid gap-2"
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="after" />
            {t("wakeAfter")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="at" />
            {t("wakeAt")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="process_exit" />
            {t("wakeProcessExit")}
          </label>
        </RadioGroup>
      </div>

      {kind === "after" ? (
        <div className="space-y-2">
          <Label>{t("wakeAfter")}</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={delayAmount}
              onChange={(event) => setDelayAmount(event.target.value)}
              className="w-28"
            />
            <Select
              value={delayUnit}
              onValueChange={(value) => setDelayUnit(value as DelayUnit)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seconds">{t("wakeDelayUnitSeconds")}</SelectItem>
                <SelectItem value="minutes">{t("wakeDelayUnitMinutes")}</SelectItem>
                <SelectItem value="hours">{t("wakeDelayUnitHours")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {kind === "at" ? (
        <div className="space-y-2">
          <Label htmlFor="wake-at">{t("wakeAt")}</Label>
          <Input
            id="wake-at"
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            {t("wakeTimezoneLabel", {
              timeZone: timezone.timeZone,
              offset: timezone.offsetLabel,
            })}
          </p>
        </div>
      ) : null}

      {kind === "process_exit" ? (
        loadingTerminals ? (
          <p className="text-sm text-muted-foreground">{t("wakeProcessLoading")}</p>
        ) : (
          <WakeProcessSelector
            terminals={terminals}
            conversations={conversations}
            folderPaths={folderPaths}
            preferredFolderPath={preferredFolderPath}
            value={processTerminalId}
            onChange={setProcessTerminalId}
          />
        )
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="wake-prompt">{t("wakePromptLabel")}</Label>
        <Textarea
          id="wake-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t("wakePromptPlaceholder")}
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("wakeTargetLabel")}</Label>
        <Select value={targetConversationId} onValueChange={setTargetConversationId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("wakeTargetPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {conversations.map((conversation) => (
              <SelectItem key={conversation.id} value={String(conversation.id)}>
                {conversation.title || `#${conversation.id}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {validationMessage || error ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? validationMessage}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          {t("editor.cancel")}
        </Button>
        <Button onClick={() => void submit()} disabled={submitting}>
          {saveLabel ?? t("editor.save")}
        </Button>
      </div>
      </AutomationSubpageForm>
    </AutomationSubpageSurface>
  )
}
