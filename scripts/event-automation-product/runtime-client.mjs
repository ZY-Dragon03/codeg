import { randomUUID } from "node:crypto"

// Fixture setup and read-only assertions may use the real product API.
// Rule configuration is intentionally forbidden here: acceptance must use UI.
export function runtimeClient({ page, baseUrl, token, desktop = false }) {
  return async function call(command, args = {}) {
    if (/^event_rule_(create|update|set_enabled|delete)$/.test(command)) {
      throw new Error(`Rule mutation ${command} must be performed through UI`)
    }
    if (desktop) {
      return page.evaluate(
        ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
        { command, args }
      )
    }
    const response = await fetch(`${baseUrl}/api/${command}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(120000),
    })
    const body = await response.text()
    if (!response.ok) throw new Error(`${command} ${response.status}: ${body}`)
    return body ? JSON.parse(body) : null
  }
}

export async function registerFixture(call, { receiptPath, controlPath }) {
  await call("acp_save_custom_agent", {
    params: {
      registryId: "codeg-event-automation-fixture",
      name: "Event Automation Acceptance Fixture",
      version: "0.1.0",
      distributionKind: "npx",
      spec: {
        npx: {
          package: "codeg-event-automation-fixture@0.1.0",
          cmd: "codeg-event-automation-fixture",
          args: [],
          env: {
            CODEG_E2E_FIXTURE_RECEIPT: receiptPath,
            CODEG_E2E_FIXTURE_CONTROL: controlPath,
          },
        },
      },
      source: "manual",
      supportsMcp: false,
    },
  })
}

export async function createFixtureConversation(call, { folderPath, title }) {
  const folder = await call("open_folder", { path: folderPath })
  const agentType = "custom:codeg-event-automation-fixture"
  const conversationId = await call("create_conversation", {
    folderId: folder.id,
    agentType,
    title,
  })
  const connectionId = await call("acp_connect", {
    agentType,
    workingDir: folderPath,
  })
  return { folderId: folder.id, conversationId, connectionId, agentType, title }
}

export async function sendFixturePrompt(call, conversation, text) {
  return call("acp_prompt", {
    connectionId: conversation.connectionId,
    conversationId: conversation.conversationId,
    folderId: conversation.folderId,
    clientMessageId: randomUUID(),
    blocks: [{ type: "text", text }],
  })
}
