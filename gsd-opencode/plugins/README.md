# GSD Plugins for OpenCode

## gsd-auto-chain.ts

Automatically chains GSD commands through fresh context windows (`/new`).

### What it does

When a GSD command completes and outputs "## ▶ Next Up" with a suggested command:

1. Detects the next command (e.g., `/gsd-execute-phase 1`)
2. Stores it temporarily in `~/.cache/opencode/gsd-pending-command.json`
3. Shows a macOS notification
4. On next session start, logs the pending command

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
| `autoChainDelay` | `1000` | Delay in ms before storing command |
| `confirmBeforeChain` | `false` | Log without executing |

### Commands that auto-chain

These commands will automatically detect and chain to next steps:
- `/gsd-execute-phase` → `/gsd-discuss-phase` (next phase) or `/gsd-complete-milestone`
- `/gsd-discuss-phase` → `/gsd-plan-phase`
- `/gsd-plan-phase` → `/gsd-execute-phase`
- `/gsd-audit-milestone` → `/gsd-complete-milestone`
- `/gsd-add-phase` → `/gsd-plan-phase`
- `/gsd-insert-phase` → `/gsd-plan-phase`

### Commands that DON'T auto-chain

These require manual user input:
- `/gsd-verify-work` — needs manual UAT testing
- `/gsd-new-project` — interactive project setup wizard
- `/gsd-new-milestone` — interactive milestone setup wizard

### Escape Hatch

Add `<!-- gsd:no-chain -->` anywhere in the conversation to skip auto-chaining.

### Debug Output

When working correctly, you'll see in the console:
```
[GSD Auto-Chain] Plugin loaded
[GSD Auto-Chain] Session idle detected
[GSD Auto-Chain] Extracted command: /gsd-execute-phase 1
[GSD Auto-Chain] Detected: /gsd-execute-phase 1
[GSD Auto-Chain] Storing for next session...
```

### Files

| File | Purpose |
|------|---------|
| `~/.config/opencode/plugins/gsd-auto-chain.ts` | Plugin (symlinked) |
| `~/.config/opencode/gsd-auto-chain.json` | Configuration |
| `~/.cache/opencode/gsd-pending-command.json` | Stored next command |
