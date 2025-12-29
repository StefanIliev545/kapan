import { z } from "zod"
import { $ } from "bun"

// Helper to safely run bd commands - catches errors and returns them as strings
async function runBd(cmd: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const result = await $`bd ${cmd}`.quiet()
    return { ok: result.exitCode === 0, output: result.stdout.toString() || result.stderr.toString() }
  } catch (e: any) {
    // Check if bd is not installed or not in PATH
    const msg = e.message || e.stderr?.toString() || String(e)
    if (msg.includes("command not found") || msg.includes("ENOENT")) {
      return { ok: false, output: "Error: bd command not found. Install beads or check PATH." }
    }
    return { ok: false, output: `Error: ${msg}` }
  }
}

// Helper to safely parse JSON, returning the raw string if parsing fails
function safeJsonParse(str: string): any {
  const trimmed = str.trim()
  if (!trimmed || trimmed === "") return []
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed // Return raw string if not valid JSON
  }
}

// Single consolidated beads tool - reduces context overhead by ~90%
export default {
  description: `Beads task tracker. Actions: list, ready, create, update, close, show, prime, sync. 
Examples: {action:"ready"}, {action:"create",title:"Fix bug",priority:1}, {action:"close",id:"abc",reason:"Done"}`,
  args: {
    action: z.enum(["list", "ready", "create", "update", "close", "show", "prime", "sync", "quick"]).describe("Action to perform"),
    id: z.string().optional().describe("Task ID (for update/close/show)"),
    title: z.string().optional().describe("Task title (for create/quick)"),
    priority: z.number().optional().describe("Priority 0-4 (for create/update)"),
    status: z.string().optional().describe("Status: open/in_progress/closed (for list/update)"),
    reason: z.string().optional().describe("Reason for closing"),
  },
  async execute(args: {
    action: string
    id?: string
    title?: string
    priority?: number
    status?: string
    reason?: string
  }) {
    switch (args.action) {
      case "ready": {
        const { ok, output } = await runBd(["ready", "--json"])
        if (!ok) return output
        const tasks = safeJsonParse(output)
        if (Array.isArray(tasks)) {
          return tasks.length === 0 ? "No tasks ready." : JSON.stringify(tasks, null, 2)
        }
        return output
      }
      
      case "list": {
        const cmdArgs = ["list", "--json"]
        if (args.status) cmdArgs.push(`--status=${args.status}`)
        if (args.priority !== undefined) cmdArgs.push(`--priority=${args.priority}`)
        const { ok, output } = await runBd(cmdArgs)
        if (!ok) return output
        return output || "[]"
      }
      
      case "create": {
        if (!args.title) return "Error: title required"
        const p = args.priority ?? 2
        const { output } = await runBd(["create", args.title, "-p", String(p), "--json"])
        return output
      }
      
      case "quick": {
        if (!args.title) return "Error: title required"
        const p = args.priority ?? 2
        const { output } = await runBd(["q", args.title, "-p", String(p)])
        return output.trim()
      }
      
      case "update": {
        if (!args.id) return "Error: id required"
        const cmdArgs = ["update", args.id, "--json"]
        if (args.status) cmdArgs.push(`--status=${args.status}`)
        if (args.priority !== undefined) cmdArgs.push(`--priority=${args.priority}`)
        if (args.title) cmdArgs.push(`--title=${args.title}`)
        const { output } = await runBd(cmdArgs)
        return output
      }
      
      case "close": {
        if (!args.id) return "Error: id required"
        const cmdArgs = ["close", args.id, "--json"]
        if (args.reason) cmdArgs.push(`--reason=${args.reason}`)
        const { output } = await runBd(cmdArgs)
        return output
      }
      
      case "show": {
        if (!args.id) return "Error: id required"
        const { output } = await runBd(["show", args.id, "--json"])
        return output
      }
      
      case "prime": {
        const { output } = await runBd(["prime"])
        return output || "Primed"
      }
      
      case "sync": {
        const { output } = await runBd(["sync"])
        return output || "Synced"
      }
      
      default:
        return `Unknown action: ${args.action}`
    }
  },
}
