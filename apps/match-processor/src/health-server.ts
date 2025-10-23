import { createServer } from 'http'

let lastSuccessfulRun = Date.now()
let lastRunDuration = 0
let consecutiveFailures = 0

export const startHealthServer = (port = 3001) => {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      const timeSinceLastRun = Date.now() - lastSuccessfulRun
      const isHealthy = timeSinceLastRun < 30000 && consecutiveFailures < 3

      res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          status: isHealthy ? 'healthy' : 'unhealthy',
          timeSinceLastRun,
          lastRunDuration,
          consecutiveFailures,
          uptime: process.uptime()
        })
      )
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`Health server listening on :${port}`)
  })
}

export const updateHealthMetrics = (success: boolean, duration: number) => {
  if (success) {
    lastSuccessfulRun = Date.now()
    lastRunDuration = duration
    consecutiveFailures = 0
  } else {
    consecutiveFailures++
  }
}
