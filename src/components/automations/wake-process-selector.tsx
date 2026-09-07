"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import type { DbConversationSummary, TerminalInfo } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  classifyProcessKind,
  formatStartedAt,
  matchesProcessKindFilter,
  matchesTerminalSearch,
  type ProcessKindFilter,
  sortTerminalsForWake,
  terminalPrimaryLabel,
  terminalSearchText,
} from "./wake-editor-utils"

function resolveConversationTitle(
  terminal: TerminalInfo,
  conversations: DbConversationSummary[],
  folderPaths: Map<number, string>
): string | null {
  const cwd = terminal.working_dir?.replace(/\\/g, "/").toLowerCase()
  if (!cwd) return null
  for (const conversation of conversations) {
    const folderPath = folderPaths.get(conversation.folder_id)?.replace(/\\/g, "/").toLowerCase()
    if (!folderPath) continue
    if (cwd === folderPath || cwd.startsWith(`${folderPath}/`)) {
      return conversation.title || `#${conversation.id}`
    }
  }
  return null
}

function processKindLabel(
  terminal: TerminalInfo,
  t: ReturnType<typeof useTranslations<"EventAutomations">>
) {
  const kind = classifyProcessKind(terminal.initial_command, terminal.shell)
  if (kind === "python") return t("wakeProcessKindPython")
  if (kind === "node") return t("wakeProcessKindNode")
  if (kind === "shell") return t("wakeProcessKindShell")
  if (kind === "rust") return t("wakeProcessKindRust")
  return t("wakeProcessKindOther")
}

export function WakeProcessSelector({
  terminals,
  conversations,
  folderPaths,
  preferredFolderPath,
  value,
  onChange,
  disabled,
}: {
  terminals: TerminalInfo[]
  conversations: DbConversationSummary[]
  folderPaths: Map<number, string>
  preferredFolderPath?: string | null
  value: string
  onChange: (terminalId: string) => void
  disabled?: boolean
}) {
  const t = useTranslations("EventAutomations")
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [kindFilter, setKindFilter] = useState<ProcessKindFilter>("all")

  const sorted = useMemo(
    () => sortTerminalsForWake(terminals, preferredFolderPath),
    [terminals, preferredFolderPath]
  )

  const visible = useMemo(() => {
    return sorted.filter((terminal) => {
      const conversationTitle = resolveConversationTitle(
        terminal,
        conversations,
        folderPaths
      )
      return (
        matchesProcessKindFilter(terminal, kindFilter) &&
        matchesTerminalSearch(terminal, search, conversationTitle)
      )
    })
  }, [sorted, kindFilter, search, conversations, folderPaths])

  const selected = sorted.find((terminal) => terminal.id === value) ?? null

  if (!terminals.length) {
    return (
      <p className="rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
        {t("wakeProcessEmpty")}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <Label>{t("wakeProcessWaitLabel")}</Label>
      <div className="flex flex-wrap gap-2">
        <Select
          value={kindFilter}
          onValueChange={(next) => setKindFilter(next as ProcessKindFilter)}
          disabled={disabled}
        >
          <SelectTrigger className="w-[9rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("wakeProcessKindAll")}</SelectItem>
            <SelectItem value="python">{t("wakeProcessKindPython")}</SelectItem>
            <SelectItem value="node">{t("wakeProcessKindNode")}</SelectItem>
            <SelectItem value="shell">{t("wakeProcessKindShell")}</SelectItem>
            <SelectItem value="rust">{t("wakeProcessKindRust")}</SelectItem>
            <SelectItem value="other">{t("wakeProcessKindOther")}</SelectItem>
          </SelectContent>
        </Select>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className="min-w-0 flex-1 justify-between"
            >
              <span className="truncate">
                {selected
                  ? terminalPrimaryLabel(selected)
                  : t("wakeProcessSelectPlaceholder")}
              </span>
              <ChevronDown className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(32rem,calc(100vw-2rem))] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                value={search}
                onValueChange={setSearch}
                placeholder={t("wakeProcessSearchPlaceholder")}
              />
              <CommandList>
                <CommandEmpty>{t("wakeProcessEmpty")}</CommandEmpty>
                <CommandGroup>
                  {visible.map((terminal) => {
                    const conversationTitle = resolveConversationTitle(
                      terminal,
                      conversations,
                      folderPaths
                    )
                    const startedAt = formatStartedAt(terminal.created_at, locale)
                    return (
                      <CommandItem
                        key={terminal.id}
                        value={terminalSearchText(terminal)}
                        onSelect={() => {
                          onChange(terminal.id)
                          setOpen(false)
                        }}
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate font-medium">
                            {terminalPrimaryLabel(terminal)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {processKindLabel(terminal, t)} · {t("wakeProcessRunning")}
                            {conversationTitle ? ` · ${conversationTitle}` : ""}
                          </span>
                          {terminal.working_dir ? (
                            <span
                              dir="ltr"
                              className="truncate text-xs text-muted-foreground"
                            >
                              {terminal.working_dir}
                            </span>
                          ) : null}
                          {startedAt ? (
                            <span className="text-xs text-muted-foreground">
                              {t("wakeProcessStartedAt", { time: startedAt })}
                            </span>
                          ) : null}
                          <span className="text-[10px] text-muted-foreground/70">
                            {terminal.id}
                          </span>
                        </div>
                        <Check
                          className={cn(
                            "size-4 shrink-0",
                            value === terminal.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
