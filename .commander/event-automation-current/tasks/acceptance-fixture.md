# Phase 1 ACP acceptance fixture

## Status

Implemented under `scripts/event-automation-e2e/` and self-tested on 2026-09-05.
The fixture is an ordinary local npm package. It is not a Codeg test-only
transport and does not add an event injection endpoint or write the Codeg DB.

## Install and register

Use an isolated data root for each acceptance run:

```powershell
pwsh -NoLogo -NoProfile -NonInteractive -File `
  scripts/event-automation-e2e/setup-fixture.ps1 `
  -DataRoot C:\path\to\isolated-e2e `
  -ReceiptPath C:\path\to\isolated-e2e\fixture-receipts.jsonl
```

The script runs `npm install --global --prefix <DataRoot>\npm-global
<repo>\scripts\event-automation-e2e\fixture-package` and prints the prefix
and command path. Set `NPM_CONFIG_PREFIX` in the shell that starts Codeg (the
script cannot mutate a parent PowerShell process):

```powershell
$env:NPM_CONFIG_PREFIX = 'C:\path\to\isolated-e2e\npm-global'
$env:CODEG_E2E_FIXTURE_RECEIPT = 'C:\path\to\isolated-e2e\fixture-receipts.jsonl'
```

Start Codeg from that same environment. This causes the existing
`resolve_npx_command` and
`verify_agent_installed` paths to find the generated command shim; there is no
PATH or production registry bypass.

Register through the existing custom-agent API/UI with this definition:

```json
{
  "registryId": "codeg-event-automation-fixture",
  "name": "Codeg Event Automation Fixture",
  "version": "0.1.0",
  "distributionKind": "npx",
  "spec": {
    "npx": {
      "package": "codeg-event-automation-fixture@0.1.0",
      "cmd": "codeg-event-automation-fixture",
      "args": [],
      "env": {}
    }
  },
  "source": "manual",
  "supportsMcp": false
}
```

The package is installed in the isolated npm prefix before registration. The
custom-agent save and connect calls therefore exercise the supported npx
definition, command resolution, installation verification, ACP spawn, and
connection lifecycle.

## Protocol coverage

`acp-fixture.mjs` speaks newline-delimited JSON-RPC over stdin/stdout and
implements `initialize`, `session/new`, `session/load`, `session/resume`,
`session/prompt`, and `session/cancel`. It returns ACP session capabilities,
persists in-process session IDs, emits `session/update` with an
`agent_message_chunk` on success, and returns `stopReason: end_turn`.

The prompt receipt records the actual prompt text and session ID in JSONL. A
prompt containing `MY_CUSTOM_ERROR_123` or `TLS` returns an ACP
`session/prompt` response with the AIR `sessionFailure` carrier,
`category: connection`, `severity: error`, and a retry action; this is the
ordinary provider failure path that Codeg must classify through its lifecycle. The
`CODEG_E2E_FIXTURE_FAILURES` comma-separated plan (`fail`, `error`, or
`success`) provides deterministic first-N prompt outcomes. A positive
`CODEG_E2E_FIXTURE_BUSY_MS` delays the wire response to exercise busy/settle
ordering. `CODEG_E2E_FIXTURE_RECEIPT` selects the JSONL receipt file.
`CODEG_E2E_FIXTURE_CONTROL` can point at an isolated JSON file such as
`{"outcomes":["fail","success"],"delay_ms":250,"error_text":"TLS"}`;
the fixture rereads it for each prompt, allowing failure and recovery in one
agent process. Explicit `success` wins over keyword matching. Each prompt
produces `prompt_started` and `prompt_response` records with timestamps and
`activePromptCount`, so the harness can verify that a recovery prompt was not
sent before the failed turn settled. `CODEG_E2E_FIXTURE_ERROR_TEXT` (or the
control file's `error_text`) makes repeated identical errors reproducible for
dedup tests.

## Self-test

```powershell
pwsh -NoLogo -NoProfile -NonInteractive -File `
  scripts/event-automation-e2e/selftest-fixture.ps1
```

Observed result: npm installed one local package; `initialize`, `session/new`,
and a failing followed by a successful recovery `session/prompt` completed;
the receipt contained the expected six records including start/response
boundaries; exit code was 0.

## Limits

The fixture intentionally does not claim a real external model response. It is
an ACP protocol fixture for product acceptance of event matching, configured
prompt delivery, dedup, guards, persistence, and UI transport. Codeg must
still surface the failure through its own ACP lifecycle before an automation
can fire. The fixture keeps the ACP connection available after a failure so a
same-session recovery can be observed; a real provider may close its connection,
in which case recovery must use the product's supported reconnect/resume flow.
Cross-process or cross-crash
exactly-once behavior is outside Phase 1. The fixture also does not implement
optional permission, filesystem, terminal, or reviewer methods.
