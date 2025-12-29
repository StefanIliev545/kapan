import { z } from "zod"
import { $ } from "bun"

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
    try {
      switch (args.action) {
        case "ready": {
          const result = await $`bd ready --json`.text()
          const tasks = JSON.parse(result || "[]")
          return tasks.length === 0 ? "No tasks ready." : JSON.stringify(tasks, null, 2)
        }
        
        case "list": {
          let cmd = "bd list --json"
          if (args.status) cmd += ` --status=${args.status}`
          if (args.priority !== undefined) cmd += ` --priority=${args.priority}`
          return await $`sh -c ${cmd}`.text() || "[]"
        }
        
        case "create": {
          if (!args.title) return "Error: title required"
          const p = args.priority ?? 2
          return await $`bd create ${args.title} -p ${p} --json`.text()
        }
        
        case "quick": {
          if (!args.title) return "Error: title required"
          const p = args.priority ?? 2
          return (await $`bd q ${args.title} -p ${p}`.text()).trim()
        }
        
        case "update": {
          if (!args.id) return "Error: id required"
          let cmd = `bd update ${args.id} --json`
          if (args.status) cmd += ` --status=${args.status}`
          if (args.priority !== undefined) cmd += ` --priority=${args.priority}`
          if (args.title) cmd += ` --title="${args.title}"`
          return await $`sh -c ${cmd}`.text()
        }
        
        case "close": {
          if (!args.id) return "Error: id required"
          let cmd = `bd close ${args.id} --json`
          if (args.reason) cmd += ` --reason="${args.reason}"`
          return await $`sh -c ${cmd}`.text()
        }
        
        case "show": {
          if (!args.id) return "Error: id required"
          return await $`bd show ${args.id} --json`.text()
        }
        
        case "prime": {
          return await $`bd prime`.text()
        }
        
        case "sync": {
          return await $`bd sync`.text() || "Synced"
        }
        
        default:
          return `Unknown action: ${args.action}`
      }
    } catch (e: any) {
      return `Error: ${e.message}`
    }
  },
}
