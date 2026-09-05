#!/usr/bin/env node

// A small, real ACP stdio agent used by Phase 1 Web/Desktop acceptance.
// It deliberately speaks only JSON-RPC over newline-delimited stdin/stdout.
// Behaviour is controlled by environment variables so the harness can exercise
// failure, recovery, dedup and guard paths without product-only injection APIs.

import fs from "node:fs"
import { dirname } from "node:path"
import readline from "node:readline"

const receiptPath = process.env.CODEG_E2E_FIXTURE_RECEIPT
const controlPath = process.env.CODEG_E2E_FIXTURE_CONTROL
const failurePlan = (process.env.CODEG_E2E_FIXTURE_FAILURES || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)
const busyMs = Number.parseInt(process.env.CODEG_E2E_FIXTURE_BUSY_MS || "0", 10)
const sessions = new Map()
let promptCount = 0
let activePromptCount = 0

function receipt(entry) {
  if (!receiptPath) return
  fs.mkdirSync(dirname(receiptPath), { recursive: true })
  fs.appendFileSync(
    receiptPath,
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`
  )
}

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`)
}

function textFromBlocks(blocks) {
  return (blocks || [])
    .filter((block) => block?.type === "text")
    .map((block) => block.text || "")
    .join("")
}

function control() {
  if (!controlPath || !fs.existsSync(controlPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(controlPath, "utf8"))
  } catch {
    return {}
  }
}

function update(sessionId, text) {
  send({
    method: "session/update",
    params: {
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text },
      },
    },
  })
}

async function delay(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms))
}

async function handle(request) {
  const { id, method, params = {} } = request
  if (!method) return

  if (method === "initialize") {
    receipt({ type: "initialize", params })
    send({
      id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: false },
        },
        agentInfo: { name: "Codeg Event Automation Fixture", version: "0.1.0" },
      },
    })
    return
  }

  if (method === "session/new") {
    const sessionId = `fixture-session-${Date.now()}-${Math.random().toString(16).slice(2)}`
    sessions.set(sessionId, { prompts: 0, cwd: params.cwd || null })
    receipt({ type: "session_new", id, sessionId, params })
    send({ id, result: { sessionId } })
    return
  }

  if (method === "session/load" || method === "session/resume") {
    const sessionId = params.sessionId || `fixture-session-${Date.now()}`
    sessions.set(
      sessionId,
      sessions.get(sessionId) || { prompts: 0, cwd: params.cwd || null }
    )
    receipt({ type: method.replace("/", "_"), id, sessionId, params })
    // LoadSessionResponse is an empty object in ACP 0.11; sessionId is the
    // request identity and must not be repeated in the response.
    send({ id, result: {} })
    return
  }

  if (method === "session/prompt") {
    const sessionId = params.sessionId || "unknown-session"
    const prompt = textFromBlocks(params.prompt)
    promptCount += 1
    activePromptCount += 1
    const startedAt = new Date().toISOString()
    receipt({
      type: "prompt_started",
      id,
      sessionId,
      count: promptCount,
      prompt,
      startedAt,
      activePromptCount,
    })
    const state = sessions.get(sessionId) || { prompts: 0 }
    state.prompts += 1
    sessions.set(sessionId, state)
    const config = control()
    const planned =
      config.outcomes?.[promptCount - 1] || failurePlan[promptCount - 1] || ""
    // An explicit success in a plan is authoritative, even if the prompt is a
    // TLS/custom-error sample. This lets one process run failure then recovery.
    const shouldFail = planned
      ? planned !== "success"
      : /MY_CUSTOM_ERROR_123|TLS/i.test(prompt)
    const delayMs = Number.parseInt(config.delay_ms ?? busyMs, 10) || 0
    const errorText =
      config.error_text ||
      process.env.CODEG_E2E_FIXTURE_ERROR_TEXT ||
      "MY_CUSTOM_ERROR_123 TLS"
    await delay(delayMs)
    if (shouldFail) {
      // Current Codeg ACP adapters carry a terminal turn failure on the prompt
      // response's AIR metadata. A raw JSON-RPC error aborts the connection
      // before TurnComplete, so it cannot exercise settle ordering or automatic
      // recovery. This is the same typed carrier consumed by real adapters.
      send({
        id,
        result: {
          stopReason: "end_turn",
          _meta: {
            jetbrains: {
              air: {
                version: 1,
                sessionFailure: {
                  id: `fixture-prompt-${promptCount}:error`,
                  revision: 1,
                  category: "connection",
                  severity: "error",
                  title: `${errorText} (fixture prompt ${promptCount})`,
                  actions: ["retry"],
                },
              },
            },
          },
        },
      })
      activePromptCount -= 1
      receipt({
        type: "prompt_response",
        id,
        sessionId,
        count: promptCount,
        outcome: "failed",
        finishedAt: new Date().toISOString(),
        activePromptCount,
      })
      return
    }
    update(sessionId, `fixture accepted: ${prompt}`)
    send({ id, result: { stopReason: "end_turn" } })
    activePromptCount -= 1
    receipt({
      type: "prompt_response",
      id,
      sessionId,
      count: promptCount,
      outcome: "success",
      finishedAt: new Date().toISOString(),
      activePromptCount,
    })
    return
  }

  if (method === "session/cancel") {
    receipt({ type: "cancel", id, params })
    send({ id, result: {} })
    return
  }

  // ACP clients may probe optional methods. Returning method-not-found keeps
  // the fixture honest while allowing Codeg to exercise its fallback paths.
  if (id !== undefined)
    send({
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    })
}

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})
input.on("line", (line) => {
  if (!line.trim()) return
  try {
    const request = JSON.parse(line)
    Promise.resolve(handle(request)).catch((error) => {
      receipt({ type: "handler_error", error: String(error) })
      if (request.id !== undefined)
        send({
          id: request.id,
          error: { code: -32603, message: String(error) },
        })
    })
  } catch (error) {
    receipt({ type: "parse_error", error: String(error), line })
  }
})

// Do not exit synchronously on EOF: a prompt handler may still be waiting on
// the configured busy delay before emitting its response/receipt.
