import { AnimatePresence } from "motion/react"
import { useRoute } from "./lib/router"
import { NewMigration } from "./screens/NewMigration"
import { Opener } from "./screens/Opener"
import { ProjectScreen } from "./screens/ProjectScreen"

export function App() {
  const route = useRoute()
  return (
    <AnimatePresence mode="wait">
      {route.name === "home" && <Opener key="home" />}
      {route.name === "new" && <NewMigration key="new" sample={route.sample} />}
      {route.name === "project" && <ProjectScreen key={`project-${route.id}`} id={route.id} view={route.view} />}
    </AnimatePresence>
  )
}
