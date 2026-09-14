import { useRoute } from "./lib/router"
import { Migrations } from "./screens/Migrations"
import { NewMigration } from "./screens/NewMigration"
import { Opener } from "./screens/Opener"
import { ProjectScreen } from "./screens/ProjectScreen"

// Screens animate in on mount. They are not wrapped in an exit-waiting
// AnimatePresence: animation frames pause in background tabs, which would
// freeze the route swap until the tab becomes visible again.
export function App() {
  const route = useRoute()
  if (route.name === "new") return <NewMigration key="new" sample={route.sample} />
  if (route.name === "migrations") return <Migrations key="migrations" />
  if (route.name === "project") return <ProjectScreen key={`project-${route.id}`} id={route.id} view={route.view} />
  return <Opener key="home" />
}
