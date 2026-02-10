/**
 * GSD Auto-Chain Plugin for OpenCode
 *
 * Automatically triggers the next GSD command when a stage completes.
 * Detects "## ▶ Next Up" patterns in output and chains commands
 * through a fresh context window (/new).
 */

import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, appendFileSync } from "fs"
import { join, dirname } from "path"
import { homedir } from "os"

const CONFIG_FILE = join(homedir(), '.config', 'opencode', 'gsd-auto-chain.json')
const PENDING_FILE = join(homedir(), '.cache', 'opencode', 'gsd-pending-command.json')
const LOG_FILE = join(homedir(), '.cache', 'opencode', 'gsd-auto-chain.log')

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  console.log(`[GSD Auto-Chain] ${msg}`)
  try {
    const dir = dirname(LOG_FILE)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(LOG_FILE, line)
  } catch {}
}

function clearLog(): void {
  try {
    writeFileSync(LOG_FILE, `=== GSD Auto-Chain Log Started ${new Date().toISOString()} ===\n`)
  } catch {}
}

interface PluginConfig {
  autoChain: boolean
  autoChainDelay: number
  confirmBeforeChain: boolean
  skipDiscuss: boolean
}

function loadConfig(): PluginConfig {
  const defaults: PluginConfig = {
    autoChain: true,
    autoChainDelay: 1000,
    confirmBeforeChain: false,
    skipDiscuss: false
  }

  if (!existsSync(CONFIG_FILE)) return defaults

  try {
    return { ...defaults, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) }
  } catch {
    return defaults
  }
}

function loadProjectConfig(projectDir: string): { skipDiscuss?: boolean } {
  const projectConfigFile = join(projectDir, '.planning', 'config.json')
  if (!existsSync(projectConfigFile)) return {}

  try {
    const config = JSON.parse(readFileSync(projectConfigFile, 'utf8'))
    // Support nested autoChain.skipDiscuss or flat skipDiscuss
    if (config.autoChain?.skipDiscuss !== undefined) {
      return { skipDiscuss: config.autoChain.skipDiscuss }
    }
    if (config.skipDiscuss !== undefined) {
      return { skipDiscuss: config.skipDiscuss }
    }
    return {}
  } catch {
    return {}
  }
}

function getSkipDiscuss(config: PluginConfig, projectDir: string, content: string): boolean {
  // Priority 1: Inline comment override (per-chat)
  if (content.includes('<!-- gsd:skip-discuss -->')) {
    log('skipDiscuss: true (inline override)')
    return true
  }
  if (content.includes('<!-- gsd:use-discuss -->')) {
    log('skipDiscuss: false (inline override)')
    return false
  }

  // Priority 2: Project config (.planning/config.json)
  const projectConfig = loadProjectConfig(projectDir)
  if (projectConfig.skipDiscuss !== undefined) {
    log(`skipDiscuss: ${projectConfig.skipDiscuss} (project config)`)
    return projectConfig.skipDiscuss
  }

  // Priority 3: Global config (~/.config/opencode/gsd-auto-chain.json)
  log(`skipDiscuss: ${config.skipDiscuss} (global config)`)
  return config.skipDiscuss
}

function extractNextCommand(content: string): string | null {
  if (!content) {
    console.log('[GSD Auto-Chain] extractNextCommand: empty content')
    return null
  }

  // Multiple patterns to find "Next Up" section
  // Note: ► (U+25BA) and ▶ (U+25B6) are different arrow characters
  const nextUpPatterns = [
    /(?:##\s*)?[►▶]\s*Next Up[\s\S]*?(?=\n(?:##|━|Also available)|$)/,  // With arrow emoji (both variants)
    /(?:##\s*)?>\s*Next Up[\s\S]*?(?=\n(?:##|━|Also available)|$)/,     // With > character
    /##\s*Next Up[\s\S]*?(?=\n(?:##|━|Also available)|$)/,              // Markdown header only
    /Next Up[:\s]*\n[\s\S]*?(?=\n\n|\n(?:##|━)|$)/i,                    // Case insensitive
  ]

  let nextUpMatch: RegExpMatchArray | null = null
  for (const pattern of nextUpPatterns) {
    nextUpMatch = content.match(pattern)
    if (nextUpMatch) {
      console.log('[GSD Auto-Chain] Next Up matched with pattern:', pattern.source.substring(0, 30))
      break
    }
  }

  if (!nextUpMatch) {
    // Debug: check if content contains any "Next Up" at all
    if (content.includes('Next Up') || content.includes('next up')) {
      console.log('[GSD Auto-Chain] Found "Next Up" text but no regex matched')
      // Try to extract the section manually
      const idx = content.toLowerCase().indexOf('next up')
      if (idx !== -1) {
        console.log('[GSD Auto-Chain] Context around "Next Up":', content.substring(idx, idx + 150))
      }
    }
    return null
  }

  const section = nextUpMatch[0]
  console.log('[GSD Auto-Chain] Next Up section found, length:', section.length)
  console.log('[GSD Auto-Chain] Section preview:', section.substring(0, 150))

  const patterns = [
    { name: 'backtick', regex: /`(\/gsd[a-z-]+(?:\s+[^`]+)?)`/ },
    { name: 'line-start', regex: /^(\/gsd[a-z-]+(?:\s+\S+)*)/m },
    { name: 'anywhere-num', regex: /(\/gsd[a-z-]+(?:\s+\d+)?)/ },
    { name: 'colon-format', regex: /:\s*(\/gsd[a-z-]+(?:\s+\S+)*)/ },
    { name: 'anywhere', regex: /(\/gsd[a-z0-9-]+(?:\s+[^\n]+)?)/ },
  ]

  for (const { name, regex } of patterns) {
    const match = section.match(regex)
    if (match) {
      const cmd = match[1].trim().split(/\s+—\s+/)[0].trim()
      console.log(`[GSD Auto-Chain] Matched with pattern '${name}': ${cmd}`)
      return cmd
    }
  }

  // Last resort: find any /gsd command in the whole content
  console.log('[GSD Auto-Chain] No pattern matched in section, trying whole content...')
  const fallbackMatch = content.match(/(\/gsd[a-z0-9-]+(?:\s+\d+)?)/i)
  if (fallbackMatch) {
    console.log('[GSD Auto-Chain] Fallback matched:', fallbackMatch[1])
    // Only use fallback if it's near "Next Up"
    const nextUpIdx = content.toLowerCase().indexOf('next up')
    const cmdIdx = content.indexOf(fallbackMatch[1])
    if (nextUpIdx !== -1 && cmdIdx > nextUpIdx && cmdIdx - nextUpIdx < 300) {
      return fallbackMatch[1]
    }
    console.log('[GSD Auto-Chain] Fallback command too far from "Next Up"')
  }

  console.log('[GSD Auto-Chain] No command pattern matched')
  return null
}

function shouldAutoChain(command: string, content: string): boolean {
  if (!command || content.includes('<!-- gsd:no-chain -->')) return false

  // Only skip commands that truly require manual user input
  const skipCommands = ['/gsd-verify-work', '/gsd-new-project', '/gsd-new-milestone']
  return !skipCommands.some(skip => command.startsWith(skip))
}

function storePendingCommand(command: string): void {
  const cacheDir = dirname(PENDING_FILE)
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true })
  writeFileSync(PENDING_FILE, JSON.stringify({ command, timestamp: Date.now() }))
}

function getPendingCommand(): string | null {
  if (!existsSync(PENDING_FILE)) return null

  try {
    const data = JSON.parse(readFileSync(PENDING_FILE, 'utf8'))
    unlinkSync(PENDING_FILE)
    if (Date.now() - data.timestamp > 5 * 60 * 1000) return null
    return data.command
  } catch {
    return null
  }
}

export const GsdAutoChain: Plugin = async ({ $, client, directory }) => {
  const config = loadConfig()

  if (!config.autoChain) {
    log('Disabled via config')
    return {}
  }

  log(`Plugin loaded (project: ${directory})`)

  return {
    event: async ({ event }: { event: any }) => {
      // On session created, check for pending command
      if (event.type === 'session.created') {
        const pending = getPendingCommand()
        if (pending) {
          console.log(`\n[GSD Auto-Chain] Found pending command: ${pending}`)
          const inputFile = join(homedir(), '.cache', 'opencode', 'gsd-auto-input.txt')
          writeFileSync(inputFile, pending)
          console.log(`[GSD Auto-Chain] Saved to: ${inputFile}`)
          console.log(`[GSD Auto-Chain] Please run: ${pending}\n`)
        }
        return
      }

      // On session idle, detect next command
      if (event.type === 'session.idle') {
        clearLog()
        const sessionId = event.properties?.sessionID
        if (!sessionId) {
          log('No sessionID in event')
          return
        }

        // Fetch messages using the SDK
        const session = client?.session
        if (!session || typeof session.messages !== 'function') {
          log('session.messages not available')
          return
        }

        let messages: any[] = []
        try {
          const result = await session.messages({ path: { id: sessionId } })
          if (result?.data && Array.isArray(result.data)) {
            messages = result.data
          }
        } catch (e: any) {
          log(`Error fetching messages: ${e.message}`)
          return
        }

        if (messages.length === 0) {
          log('No messages in session')
          return
        }

        // Find last assistant message (messages have { info, parts } structure)
        const lastAssistant = [...messages].reverse().find((m: any) => m.info?.role === 'assistant')
        if (!lastAssistant) {
          log('No assistant message found')
          return
        }

        // Extract text content from parts array
        let content = ''
        const parts = lastAssistant.parts || []
        for (const part of parts) {
          if (part.type === 'text' && part.text) {
            content += part.text + '\n'
          }
        }

        if (!content) {
          log('No text content in assistant message')
          return
        }

        log(`Content length: ${content.length}`)
        log(`Contains "Next Up": ${content.includes('Next Up')}`)

        let nextCommand = extractNextCommand(content)
        log(`Extracted command: ${nextCommand || 'none'}`)

        if (!nextCommand) return

        // Skip discussion and go straight to planning if configured
        // Priority: inline comment > project config > global config
        const skipDiscuss = getSkipDiscuss(config, directory, content)
        if (skipDiscuss && nextCommand.startsWith('/gsd-discuss-phase')) {
          const phaseNum = nextCommand.replace('/gsd-discuss-phase', '').trim()
          nextCommand = `/gsd-plan-phase ${phaseNum}`.trim()
          log(`Transformed to: ${nextCommand}`)
        }

        if (!shouldAutoChain(nextCommand, content)) {
          log(`Skipping (interactive): ${nextCommand}`)
          return
        }

        if (config.confirmBeforeChain) {
          console.log(`[GSD Auto-Chain] Would execute: ${nextCommand}`)
          return
        }

        console.log(`[GSD Auto-Chain] Detected: ${nextCommand}`)

        // Try to auto-execute via SDK TUI control API
        log('=== Attempting auto-execute via SDK ===')

        let autoExecuted = false

        try {
          // Step 1: Execute /new to create fresh session
          log('Step 1: client.tui.executeCommand({ body: { command: "/new" } })')
          const newResp = await client.tui.executeCommand({ body: { command: '/new' } })
          log(`  Response: ${JSON.stringify(newResp)}`)

          // Step 2: Wait for new session to initialize
          // /new needs time to create session and switch TUI focus
          log('Step 2: Waiting 1500ms for session...')
          await new Promise(r => setTimeout(r, 1500))

          // Step 3: Append the GSD command to prompt
          log(`Step 3: client.tui.appendPrompt({ body: { text: "${nextCommand}" } })`)
          const appendResp = await client.tui.appendPrompt({ body: { text: nextCommand } })
          log(`  Response: ${JSON.stringify(appendResp)}`)

          // Step 4: Submit the prompt
          log('Step 4: client.tui.submitPrompt()')
          const submitResp = await client.tui.submitPrompt()
          log(`  Response: ${JSON.stringify(submitResp)}`)

          autoExecuted = true
          console.log(`\n[GSD Auto-Chain] Auto-chained: ${nextCommand}`)
        } catch (e: any) {
          log(`SDK auto-execute error: ${e.message}`)
          log(`Error stack: ${e.stack}`)
        }

        log('=== End auto-execute attempt ===')

        if (autoExecuted) {
          return // Successfully auto-executed
        }

        // Fallback: store and notify
        console.log('[GSD Auto-Chain] Storing for next session...')
        storePendingCommand(nextCommand)

        // Delay before notification
        await new Promise(r => setTimeout(r, config.autoChainDelay))

        // Send notification
        try {
          await $`osascript -e 'display notification "Ready: ${nextCommand}" with title "GSD Auto-Chain"'`
        } catch {
          // Notification optional
        }

        console.log(`\n[GSD Auto-Chain] Run /new then the command will auto-execute`)
      }
    }
  }
}

export default GsdAutoChain
