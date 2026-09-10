import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { AutomationSubpageHeader } from "./automation-subpage-header"
import { Button } from "@/components/ui/button"

/** Fixed outer automation dialog width (64rem / max-w-5xl), invariant across views. */
export const automationDialogContentClass =
  "w-[min(64rem,calc(100vw-2rem))] min-w-[min(64rem,calc(100vw-2rem))] max-w-[min(64rem,calc(100vw-2rem))] grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden"

/** Scrollable body inside the fixed-width dialog. */
export const automationDialogBodyClass =
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"

/** Inner scroll region for registry list or subpage editors. */
export const automationPanelScrollClass =
  "min-h-0 min-w-0 flex-1 scroll-pt-20 overflow-x-hidden overflow-y-auto"

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
    <div className={cn("w-full min-w-0 space-y-5 pt-1", className)}>
      {children}
    </div>
  )
}

export function AutomationSubpageTitle({ title }: { title: string }) {
  return <h2 className="text-lg font-semibold">{title}</h2>
}

export function AutomationEditorSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("scroll-mt-20 grid gap-3 rounded-xl border p-4", className)}>
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function AutomationEditorFooter({
  onCancel,
  onSave,
  cancelLabel,
  saveLabel,
  saving,
}: {
  onCancel?: () => void
  onSave: () => void
  cancelLabel: string
  saveLabel: string
  saving?: boolean
}) {
  return (
    <div className="flex justify-end gap-2 border-t pt-4">
      {onCancel ? (
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          {cancelLabel}
        </Button>
      ) : null}
      <Button type="button" disabled={saving} onClick={onSave}>
        {saveLabel}
      </Button>
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
      <AutomationSubpageHeader onBack={onBack!} />
      <AutomationSubpageForm className="flex flex-col gap-5">
        <AutomationSubpageTitle title={subpageTitle!} />
        {subpageToolbar}
        {children}
      </AutomationSubpageForm>
    </AutomationSubpageSurface>
  )
}
