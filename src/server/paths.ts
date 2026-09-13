import { homedir } from "node:os"
import { join } from "node:path"

export const migrateHome = () => process.env.MIGRATE_HOME ?? join(homedir(), ".migrate")
export const workspacesDir = () => join(migrateHome(), "workspaces")
export const samplesDir = () => join(migrateHome(), "samples")
export const projectsFile = () => join(migrateHome(), "projects.json")
