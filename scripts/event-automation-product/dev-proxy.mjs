// Local acceptance gateway: real Next dev UI + real Rust HTTP/WebSocket API.
// No response mocks or lifecycle injection. Bind only to loopback.
import http from "node:http"
import net from "node:net"

const port = Number(process.env.EVENT_E2E_WEB_PORT || 4311)
const apiPort = Number(process.env.EVENT_E2E_API_PORT || 4310)
const uiPort = Number(process.env.EVENT_E2E_UI_PORT || 3000)
const backendPath = (url = "") =>
  url.startsWith("/api/") || url === "/ws" || url.startsWith("/ws?")

const server = http.createServer((request, response) => {
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: backendPath(request.url) ? apiPort : uiPort,
      path: request.url,
      method: request.method,
      headers: request.headers,
    },
    (incoming) => {
      response.writeHead(incoming.statusCode || 502, incoming.headers)
      incoming.pipe(response)
    }
  )
  upstream.on("error", (error) => {
    if (!response.headersSent) response.writeHead(502)
    response.end(`Acceptance upstream unavailable: ${error.message}`)
  })
  request.on("aborted", () => upstream.destroy())
  request.pipe(upstream)
})

server.on("upgrade", (request, socket, head) => {
  const upstream = net.connect(
    backendPath(request.url) ? apiPort : uiPort,
    "127.0.0.1",
    () => {
      const headers = []
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        headers.push(
          `${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`
        )
      }
      upstream.write(
        `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers.join("\r\n")}\r\n\r\n`
      )
      if (head.length) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    }
  )
  upstream.on("error", () => socket.destroy())
  socket.on("error", () => upstream.destroy())
  socket.on("close", () => upstream.destroy())
})

server.listen(port, "127.0.0.1", () => {
  console.log(`Event Automation acceptance: http://127.0.0.1:${port}`)
})
