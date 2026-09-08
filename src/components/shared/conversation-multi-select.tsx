"use client"

import { useMemo, useState } from "react"
import { X } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command"
import { formatConversationTitle } from "@/lib/conversation-title"
import {
  compareForAutomationPicker,
  conversationPickerSearchValue,
} from "@/lib/conversation-picker-utils"
import { getAgentLabel } from "@/lib/custom-agents"
import type { DbConversationSummary } from "@/lib/types"
import type { FolderSelectOption } from "@/components/shared/folder-select"
import { ConversationOptionItem } from "@/components/shared/conversation-select"
import { cn } from "@/lib/utils"

export function ConversationMultiSelect({
  conversations,
  folders,
  value,
  onChange,
  className,
}: {
  conversations: readonly DbConversationSummary[]
  folders: readonly FolderSelectOption[]
  value: readonly number[]
  onChange: (ids: number[]) => void
  className?: string
}) {
  const t = useTranslations("EventAutomations")
  const [query, setQuery] = useState("")
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders]
  )
  const byId = useMemo(
    () => new Map(conversations.map((conversation) => [conversation.id, conversation])),
    [conversations]
  )
  const selectedIds = useMemo(() => new Set(value), [value])
  const sorted = useMemo(
    () => [...conversations].sort(compareForAutomationPicker),
    [conversations]
  )
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return sorted
    return sorted.filter((conversation) => {
      const folder = folderById.get(conversation.folder_id)
      const folderLabel = folder?.alias ?? folder?.name ?? null
      return conversationPickerSearchValue(
        conversation,
        formatConversationTitle,
        getAgentLabel(conversation.agent_type),
        folderLabel
      ).includes(needle)
    })
  }, [folderById, query, sorted])

  const toggle = (id: number) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  const chipLabel = (conversation: DbConversationSummary) =>
    formatConversationTitle(conversation.title) || `#${conversation.id}`

  return (
    <div className={cn("grid gap-2", className)}>
      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const conversation = byId.get(id)
            if (!conversation) {
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  #{id}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-background"
                    aria-label={t("editor.removeSelectedConversation")}
                    onClick={() => toggle(id)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )
            }
            return (
              <span
                key={id}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
              >
                <span className="truncate">{chipLabel(conversation)}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-background"
                  aria-label={t("editor.removeSelectedConversation")}
                  onClick={() => toggle(id)}
                >
                  <X className="size-3" />
                </button>
              </span>
            )
          })}
        </div>
      ) : null}
      <Command className="rounded-lg border">
        <CommandInput
          placeholder={t("editor.searchConversations")}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-56">
          <CommandEmpty>{t("editor.noConversationsFound")}</CommandEmpty>
          <CommandGroup>
            {filtered.map((conversation) => {
              const folder = folderById.get(conversation.folder_id)
              const folderLabel = folder?.alias ?? folder?.name ?? null
              const checked = selectedIds.has(conversation.id)
              return (
                <ConversationOptionItem
                  key={conversation.id}
                  conversation={conversation}
                  folderLabel={folderLabel}
                  selected={checked}
                  onSelect={() => toggle(conversation.id)}
                />
              )
            })}
          </CommandGroup>
        </CommandList>
      </Command>
      <p className="text-xs text-muted-foreground">
        {t("editor.selectedConversationCount", { count: value.length })}
      </p>
    </div>
  )
}
