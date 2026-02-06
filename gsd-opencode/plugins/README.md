# GSD Plugins for OpenCode

## gsd-auto-chain.ts

Automatically chains GSD commands through fresh context windows (`/new`).

### What it does

When a GSD command completes and outputs "## ▶ Next Up" with a suggested command, the plugin:

1. Detects the next command (e.g., `/gsd-execute-phase 8`)
2. Opens a fresh session via `/new`
3. Types the command into the prompt
4. Automatically submits it

This creates a fully automated GSD workflow where phases flow seamlessly from one to the next.

### Installation

```bash
# 1. Create plugins directory
mkdir -p ~/.config/opencode/plugins

# 2. Symlink the plugin
ln -sf "$(pwd)/gsd-opencode/plugins/gsd-auto-chain.ts" ~/.config/opencode/plugins/

# 3. Register in opencode.jsonc
# Add to your ~/.config/opencode/opencode.jsonc:
```

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "./plugins/gsd-auto-chain.ts"
  ]
}
```

### Configuration

Create `~/.config/opencode/gsd-auto-chain.json`:

```json
{
  "autoChain": true,
  "autoChainDelay": 1000,
  "confirmBeforeChain": false
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `autoChain` | `true` | Enable/disable auto-chaining |
| `autoChainDelay` | `1000` | Delay in ms before fallback notification |
| `confirmBeforeChain` | `false` | Log command without executing (dry run) |

### Commands that auto-chain

These commands will automatically detect and chain to next steps:
- `/gsd-plan-phase` → `/gsd-execute-phase`
- `/gsd-execute-phase` → `/gsd-verify-work` or `/gsd-discuss-phase` (next phase)
- `/gsd-discuss-phase` → `/gsd-plan-phase`
- `/gsd-audit-milestone` → `/gsd-complete-milestone`
- `/gsd-add-phase` → `/gsd-plan-phase`
- `/gsd-insert-phase` → `/gsd-plan-phase`

### Commands that DON'T auto-chain

These require manual user input and are skipped:
- `/gsd-verify-work` — needs manual UAT testing
- `/gsd-new-project` — interactive project setup wizard
- `/gsd-new-milestone` — interactive milestone setup wizard

### Escape Hatch

Add `<!-- gsd:no-chain -->` anywhere in the assistant's output to skip auto-chaining.

### Debug Log

Check `~/.cache/opencode/gsd-auto-chain.log` for execution details:

```
=== GSD Auto-Chain Log Started 2026-02-06T17:22:58.460Z ===
[2026-02-06T17:22:58.467Z] Content length: 1487
[2026-02-06T17:22:58.467Z] Contains "Next Up": true
[2026-02-06T17:22:58.468Z] Extracted command: /gsd-execute-phase 08
[2026-02-06T17:22:58.468Z] === Attempting auto-execute via SDK ===
[2026-02-06T17:22:58.468Z] Step 1: client.tui.executeCommand({ body: { command: "/new" } })
[2026-02-06T17:22:58.468Z]   Response: {"data":true,"request":{},"response":{}}
[2026-02-06T17:22:59.271Z] Step 3: client.tui.appendPrompt({ body: { text: "/gsd-execute-phase 08" } })
[2026-02-06T17:22:59.273Z]   Response: {"data":true,"request":{},"response":{}}
[2026-02-06T17:22:59.273Z] Step 4: client.tui.submitPrompt()
[2026-02-06T17:22:59.273Z]   Response: {"data":true,"request":{},"response":{}}
[2026-02-06T17:22:59.274Z] === End auto-execute attempt ===
```

### Files

| File | Purpose |
|------|---------|
| `~/.config/opencode/plugins/gsd-auto-chain.ts` | Plugin (symlinked) |
| `~/.config/opencode/gsd-auto-chain.json` | Configuration |
| `~/.cache/opencode/gsd-auto-chain.log` | Debug log |
| `~/.cache/opencode/gsd-pending-command.json` | Fallback: stored command if TUI fails |

### How it works

The plugin uses the OpenCode SDK's TUI control API:

1. `client.tui.executeCommand({ body: { command: '/new' } })` — Opens fresh session
2. `client.tui.appendPrompt({ body: { text: command } })` — Types the command
3. `client.tui.submitPrompt()` — Submits the prompt

If the SDK calls fail, it falls back to storing the command and showing a macOS notification.
