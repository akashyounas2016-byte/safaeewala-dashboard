// R-OPS-05: CRM on the company subdomain, kept out of search engines
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

eq(/Host\(`crm\.safaeewala\.com`\)/.test(src('docker-compose.yml')), true, 'Traefik serves crm.safaeewala.com')
eq(/Host\(`crm\.srv1646539\.hstgr\.cloud`\)/.test(src('docker-compose.yml')), true, 'old address keeps working')
eq(src('webhookServer.cjs').includes("'https://crm.safaeewala.com'"), true, 'new address allowed to call the API')
const nginx = src('nginx.conf')
eq(nginx.split('add_header X-Robots-Tag "noindex, nofollow" always;').length - 1, 3, 'noindex header on pages, assets and API')
eq(/<meta name="robots" content="noindex, nofollow"/.test(src('index.html')), true, 'noindex meta in the app page')
