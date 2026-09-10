"use client"

import { ArrowLeft } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

export function AutomationSubpageHeader({ onBack }: { onBack: () => void }) {
  const t = useTranslations("EventAutomations")
  return (
    <div className="sticky top-0 z-20 -mx-4 -mt-4 mb-4 min-w-0 border-b border-border/60 bg-background/95 px-4 pb-3 pt-4 backdrop-blur sm:-mx-5 sm:-mt-5 sm:px-5">
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
    </div>
  )
}
