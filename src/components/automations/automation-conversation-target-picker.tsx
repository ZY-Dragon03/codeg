"use client"

import { useTranslations } from "next-intl"
import type {
  AutomationTargetMode,
  DbConversationSummary,
} from "@/lib/types"
import type { FolderSelectOption } from "@/components/shared/folder-select"
import { ConversationMultiSelect } from "@/components/shared/conversation-multi-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { resolveTargetIds } from "./automation-targets"

export function AutomationConversationTargetPicker({
  currentConversationId,
  conversations,
  folders,
  mode,
  selectedIds,
  onModeChange,
  onSelectedIdsChange,
}: {
  currentConversationId?: number | null
  conversations: readonly DbConversationSummary[]
  folders: readonly FolderSelectOption[]
  mode: AutomationTargetMode
  selectedIds: readonly number[]
  onModeChange: (mode: AutomationTargetMode) => void
  onSelectedIdsChange: (ids: number[]) => void
}) {
  const t = useTranslations("EventAutomations")
  const snapshotIds = resolveTargetIds(
    mode,
    currentConversationId,
    selectedIds,
    conversations
  )

  return (
    <section className="scroll-mt-20 grid gap-3 rounded-xl border p-4">
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">{t("editor.sendToConversations")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("editor.sendToConversationsHint")}
        </p>
      </div>
      <RadioGroup
        value={mode}
        onValueChange={(value) => onModeChange(value as AutomationTargetMode)}
        className="grid gap-2"
      >
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <RadioGroupItem value="current" className="mt-0.5" />
          <span className="grid gap-0.5">
            <span className="font-medium">{t("editor.targetCurrent")}</span>
            <span className="text-xs text-muted-foreground">
              {t("editor.targetCurrentHint")}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <RadioGroupItem value="all_current" className="mt-0.5" />
          <span className="grid gap-0.5">
            <span className="font-medium">{t("editor.targetAllCurrent")}</span>
            <span className="text-xs text-muted-foreground">
              {t("editor.targetAllCurrentHint", { count: snapshotIds.length })}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <RadioGroupItem value="specific_multiple" className="mt-0.5" />
          <span className="grid gap-0.5">
            <span className="font-medium">{t("editor.targetSpecific")}</span>
            <span className="text-xs text-muted-foreground">
              {t("editor.targetSpecificHint")}
            </span>
          </span>
        </label>
      </RadioGroup>
      {mode === "specific_multiple" ? (
        <ConversationMultiSelect
          conversations={conversations}
          folders={folders}
          value={selectedIds}
          onChange={onSelectedIdsChange}
        />
      ) : null}
    </section>
  )
}
