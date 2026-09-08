import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { AutomationSubpageHeader } from "./automation-subpage-header"

/** Fixed outer automation dialog width (64rem / max-w-5xl), invariant across views. */
export const automationDialogContentClass =
  "w-[min(64rem,calc(100vw-2rem))] min-w-[min(64rem,calc(100vw-2rem))] max-w-[min(64rem,calc(100vw-2rem))] grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden"

/** Scrollable body inside the fixed-width dialog. */
export const automationDialogBodyClass =
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"

/** Inner scroll region for registry list or subpage editors. */
export const automationPanelScrollClass =
  "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"

export function AutomationSubpageSurface({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "w-full min-w-0 rounded-xl border border-border/70 bg-muted/15 p-4 sm:p-5",
        className
      )}
    >
      {children}
    </div>
  )
}

export function AutomationSubpageForm({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "mt-4 w-full min-w-0 space-y-5 border-t border-border/70 pt-4",
        className
      )}
    >
      {children}
    </div>
  )
}

export function AutomationEditorShell({
  inSubpage,
  subpageTitle,
  onBack,
  standaloneHeader,
  subpageToolbar,
  children,
}: {
  inSubpage: boolean
  subpageTitle?: string
  onBack?: () => void
  standaloneHeader?: ReactNode
  subpageToolbar?: ReactNode
  children: ReactNode
}) {
  if (!inSubpage) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        {standaloneHeader}
        {children}
      </div>
    )
  }

  return (
    <AutomationSubpageSurface>
      <AutomationSubpageHeader title={subpageTitle!} onBack={onBack!} />
      <AutomationSubpageForm className="flex flex-col gap-5">
        {subpageToolbar}
        {children}
      </AutomationSubpageForm>
    </AutomationSubpageSurface>
  )
}
