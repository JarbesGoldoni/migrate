import { useEffect, useState } from "react"

export type Route =
  | { name: "home" }
  | { name: "new"; sample: boolean }
  | { name: "project"; id: string; view: string }

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent)
  if (parts[0] === "new") return { name: "new", sample: parts[1] === "sample" }
  if (parts[0] === "m" && parts[1]) return { name: "project", id: parts[1], view: parts.slice(2).join("/") }
  return { name: "home" }
}

export function navigate(path: string) {
  const next = `#${path.startsWith("/") ? path : `/${path}`}`
  if (window.location.hash !== next) window.location.hash = next
}

export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return parseRoute(hash)
}
