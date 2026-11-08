// SEC-04: a website lead is accepted while FLUENT_WEBHOOK_SECRET is not set, also when the service key is set
// (that combination answered 401 from 2026-11-05 and Fluent Forms leads were not saved)
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = readFileSync('webhookServer.cjs', 'utf8').replace(/\r\n/g, '\n')
const body = src.slice(src.indexOf('async function authorizeApi'), src.indexOf('// E2E-15'))
const open = body.indexOf('if (isLeadWebhook && !WEBHOOK_SECRET) return { ok: true };')
eq(open > 0 && open < body.indexOf('if (!authConfigured())'), true, 'lead accepted without a secret, before the sign-in check')
eq(/given && safeEqual\(given, WEBHOOK_SECRET\)/.test(body), true, 'with a secret set, the secret is still required')
