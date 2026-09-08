"use client"

import { memo, useMemo, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { formatConversationTitle } from "@/lib/conversation-title"
import {
  compareForAutomationPicker,
  conversationPickerSearchValue,
} from "@/lib/conversation-picker-utils"
import { getAgentLabel } from "@/lib/custom-agents"
import type { DbConversationSummary } from "@/lib/types"
import type { FolderSelectOption } from "@/components/shared/folder-select"
import { cn } from "@/lib/utils"

export const ConversationOptionItem = memo(function ConversationOptionItem({
  conversation,
  folderLabel,
  selected,
  onSelect,
}: {
  conversation: DbConversationSummary
  folderLabel?: string | null
  selected: boolean
  onSelect: () => void
}) {
  const title =
    formatConversationTitle(conversation.title) ||
    `#${conversation.id}`
  const agent = getAgentLabel(conversation.agent_type)
  return (
    <CommandItem
      value={conversationPickerSearchValue(
        conversation,
        formatConversationTitle,
        agent,
        folderLabel
      )}
      onSelect={onSelect}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {agent}
          {folderLabel ? ` · ${folderLabel}` : ""}
        </span>
      </div>
      {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
    </CommandItem>
  )
})

export function ConversationSelect({
  conversations,
  folders,
  value,
  placeholder,
  onChange,
  className,
}: {
  conversations: readonly DbConversationSummary[]
  folders: readonly FolderSelectOption[]
  value: number
  placeholder: string
  onChange: (id: number) => void
  className?: string
}) {
  const t = useTranslations("EventAutomations")
  const [open, setOpen] = useState(false)
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders]
  )
  const sorted = useMemo(
    () => [...conversations].sort(compareForAutomationPicker),
    [conversations]
  )
  const selected = sorted.find((conversation) => conversation.id === value)
  const selectedTitle = selected
    ? formatConversationTitle(selected.title) || `#${selected.id}`
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">{selectedTitle}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,var(--radix-popover-content-available-width))] p-0">
        <Command>
          <CommandInput placeholder={t("editor.searchConversations")} />
          <CommandList className="max-h-64">
            <CommandEmpty>{t("editor.noConversationsFound")}</CommandEmpty>
            <CommandGroup>
              {sorted.map((conversation) => {
                const folder = folderById.get(conversation.folder_id)
                const folderLabel = folder?.alias ?? folder?.name ?? null
                return (
                  <ConversationOptionItem
                    key={conversation.id}
                    conversation={conversation}
                    folderLabel={folderLabel}
                    selected={conversation.id === value}
                    onSelect={() => {
                      onChange(conversation.id)
                      setOpen(false)
                    }}
                  />
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
