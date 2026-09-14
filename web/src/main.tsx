import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { useLocale } from "./lib/i18n"
import "./styles.css"

document.documentElement.lang = useLocale.getState().locale

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
