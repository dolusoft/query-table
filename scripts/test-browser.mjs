// Runs the browser tests with a hard time limit.
//
// Why this exists: on Windows, a page opened by Vitest Browser Mode
// occasionally fails its very first WebSocket connection to the Vitest server
// (Chromium logs `ERR_CONNECTION_TIMED_OUT`, os error 10060: the loopback SYN
// went unanswered for a second). The Vitest client reconnects two seconds
// later, but whoever already waits for the connection is bound to the dead
// socket. The run then either fails with "Failed to connect to the browser
// session" or "The iframe ... did not become ready within ...", or hangs: the
// orchestrator waits for a `response:prepare` message that has no timeout.
// A dropped request can also prevent a test module from loading from localhost.
//
// A run that hung or lost its connection is retried once; a run whose tests
// failed is not. Both limits can be overridden:
//   BROWSER_TEST_TIMEOUT_MS  per attempt, default 120000 (a run takes ~10 s
//                            locally and up to ~45 s on CI)
//   BROWSER_TEST_ATTEMPTS    default 2
//   BROWSER_TEST_PROJECT     Vitest projects to run, comma-separated, default
//                            "browser,browser-touch" (the touch instance of the
//                            browser project); scripts/measure-renders.mjs runs
//                            "measure" through this same wrapper
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const attemptTimeoutMs = Number(process.env.BROWSER_TEST_TIMEOUT_MS) || 120_000
const maxAttempts = Number(process.env.BROWSER_TEST_ATTEMPTS) || 2
const projects = (process.env.BROWSER_TEST_PROJECT || 'browser,browser-touch')
  .split(',')
  .flatMap(name => ['--project', name.trim()])
const lostConnection =
  /Failed to connect to the browser session|The iframe "[^"\r\n]+" did not become ready within \d+ms|Failed to fetch dynamically imported module: http:\/\/localhost:\d+\//

const vitestBin = join(
  dirname(createRequire(import.meta.url).resolve('vitest/package.json')),
  'vitest.mjs'
)

const killTree = child => {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore'
    })
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

const runOnce = () =>
  new Promise(resolve => {
    const child = spawn(
      process.execPath,
      [vitestBin, 'run', ...projects, ...process.argv.slice(2)],
      {
        stdio: ['inherit', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        env: process.stdout.isTTY
          ? { ...process.env, FORCE_COLOR: '1' }
          : process.env
      }
    )
    let tail = ''
    const forward = (stream, target) =>
      stream.on('data', chunk => {
        target.write(chunk)
        tail = (tail + chunk).slice(-65_536)
      })
    forward(child.stdout, process.stdout)
    forward(child.stderr, process.stderr)

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, attemptTimeoutMs)

    const onSignal = signal => () => {
      killTree(child)
      process.exit(signal === 'SIGINT' ? 130 : 143)
    }
    const sigint = onSignal('SIGINT')
    const sigterm = onSignal('SIGTERM')
    process.once('SIGINT', sigint)
    process.once('SIGTERM', sigterm)

    child.on('close', code => {
      clearTimeout(timer)
      process.off('SIGINT', sigint)
      process.off('SIGTERM', sigterm)
      resolve({
        code: code ?? 1,
        timedOut,
        lostConnection: lostConnection.test(tail)
      })
    })
  })

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const result = await runOnce()
  if (result.code === 0 && !result.timedOut) {
    process.exit(0)
  }

  const stalled = result.timedOut || result.lostConnection
  if (!stalled) {
    process.exit(result.code)
  }

  const reason = result.timedOut
    ? `no result within ${attemptTimeoutMs / 1000}s`
    : 'the browser lost its connection to Vitest'
  if (attempt < maxAttempts) {
    console.error(
      `\n[test:browser] attempt ${attempt}/${maxAttempts}: ${reason}; retrying.\n`
    )
  } else {
    console.error(
      `\n[test:browser] attempt ${attempt}/${maxAttempts}: ${reason}; giving up.\n`
    )
    process.exit(1)
  }
}
