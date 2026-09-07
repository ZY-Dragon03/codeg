"use client"

import { ArrowLeft } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

export function AutomationSubpageHeader({
  title,
  onBack,
}: {
  title: string
  onBack: () => void
}) {
  const t = useTranslations("EventAutomations")
  return (
    <div className="border-b border-border/70 pb-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 gap-1.5 text-muted-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" />
        {t("registry.backToList")}
      </Button>
      <h3 className="mt-2 text-lg font-semibold">{title}</h3>
    </div>
  )
}
