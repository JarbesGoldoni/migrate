import { createServer } from "node:net"

export function isPortFree(port: number, host = "127.0.0.1") {
  return new Promise<boolean>((resolve) => {
    const server = createServer()
    server.once("error", () => resolve(false))
    server.listen(port, host, () => server.close(() => resolve(true)))
  })
}

export async function freePort(preferred = 0, avoid: number[] = []) {
  if (preferred) {
    for (let port = preferred; port < preferred + 200; port++) {
      if (avoid.includes(port)) continue
      if (await isPortFree(port)) return port
    }
  }
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}
