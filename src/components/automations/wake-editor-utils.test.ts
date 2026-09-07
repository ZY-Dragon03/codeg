import { describe, expect, it } from "vitest"
import {
  classifyProcessKind,
  delayToMs,
  formatClientTimezone,
  isAutoWakeName,
  matchesProcessKindFilter,
  matchesTerminalSearch,
  msToDelayParts,
  parseDatetimeLocalToIso,
  sortTerminalsForWake,
  terminalPrimaryLabel,
  toDatetimeLocalValue,
  validateWakeDraft,
} from "./wake-editor-utils"
import type { TerminalInfo } from "@/lib/types"

describe("wake-editor-utils", () => {
  it("converts delay units to milliseconds", () => {
    expect(delayToMs(30, "minutes")).toBe(1_800_000)
    expect(delayToMs(2, "hours")).toBe(7_200_000)
    expect(delayToMs(45, "seconds")).toBe(45_000)
  })

  it("round-trips delay parts", () => {
    expect(msToDelayParts(1_800_000)).toEqual({ amount: 30, unit: "minutes" })
  })

  it("formats client timezone with offset", () => {
    const info = formatClientTimezone()
    expect(info.timeZone.length).toBeGreaterThan(0)
    expect(info.offsetLabel).toMatch(/^UTC[+-]\d{2}:\d{2}$/)
  })

  it("parses datetime-local in local timezone", () => {
    const iso = parseDatetimeLocalToIso("2026-09-08T09:30")
    expect(iso).toMatch(/T/)
    expect(toDatetimeLocalValue(iso)).toBe("2026-09-08T09:30")
  })

  it("detects auto wake names", () => {
    expect(isAutoWakeName("", 3)).toBe(true)
    expect(isAutoWakeName("唤醒_12", 12)).toBe(true)
    expect(isAutoWakeName("Morning check", 12)).toBe(false)
  })

  it("classifies process kinds from command metadata", () => {
    expect(classifyProcessKind("python experiment.py", null)).toBe("python")
    expect(classifyProcessKind("node server.js", null)).toBe("node")
    expect(classifyProcessKind("cargo run", null)).toBe("rust")
  })

  it("validates wake draft fields", () => {
    expect(
      validateWakeDraft({
        kind: "after",
        delayAmount: "",
        scheduledAt: "",
        processTerminalId: "",
        prompt: "go",
      })
    ).toBe("delayRequired")
    expect(
      validateWakeDraft({
        kind: "after",
        delayAmount: "0",
        scheduledAt: "",
        processTerminalId: "",
        prompt: "go",
      })
    ).toBe("delayPositive")
    expect(
      validateWakeDraft({
        kind: "at",
        delayAmount: "",
        scheduledAt: "2020-01-01T10:00",
        processTerminalId: "",
        prompt: "go",
        now: new Date("2026-01-01T00:00"),
      })
    ).toBe("scheduledPast")
    expect(
      validateWakeDraft({
        kind: "process_exit",
        delayAmount: "",
        scheduledAt: "",
        processTerminalId: "",
        prompt: "go",
      })
    ).toBe("processRequired")
  })

  it("filters and sorts terminals for wake selection", () => {
    const terminals: TerminalInfo[] = [
      {
        id: "a",
        title: "Terminal",
        working_dir: "F:/AI_PROJECTS/codeg",
        initial_command: "python experiment.py",
        created_at: "2026-09-08T10:00:00.000Z",
      },
      {
        id: "b",
        title: "Terminal",
        working_dir: "F:/other",
        initial_command: "node server.js",
        created_at: "2026-09-08T11:00:00.000Z",
      },
    ]
    const sorted = sortTerminalsForWake(terminals, "F:/AI_PROJECTS/codeg")
    expect(sorted[0]?.id).toBe("a")
    expect(
      matchesProcessKindFilter(terminals[0], "python")
    ).toBe(true)
    expect(
      matchesTerminalSearch(terminals[0], "experiment.py")
    ).toBe(true)
    expect(terminalPrimaryLabel(terminals[0])).toBe("python experiment.py")
  })
})
