// UX-112: AI Bot in the sidebar, no floating button · UX-113: Inbox without a header, wide list with platform tabs
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

const layout = src('src/components/layout/Layout.tsx')
eq(/fixed bottom-6 right-6/.test(layout), false, 'no floating AI Bot button bottom-right')
eq(/<CRMAIBotModal/.test(layout) && /aiIssueCount: issueCount/.test(layout), true, 'the AI Bot window stays; its findings count goes to the sidebar')
const sidebar = src('src/components/layout/Sidebar.tsx')
eq(/function AIBotNavItem/.test(sidebar) && /openAIBot\(\)/.test(sidebar), true, 'Sidebar → AI Bot opens the same window')
eq(/item\.to === '\/alerts' && !isFieldLogin && <AIBotNavItem/.test(sidebar), true, 'AI Bot sits under Alerts, hidden for cleaners / drivers')

const inbox = src('src/pages/Inbox.tsx')
eq(/PageHero/.test(inbox), false, 'Inbox has no page header')
eq(/md:grid-cols-\[minmax\(360px,420px\)_1fr\]/.test(inbox), true, 'wider chat list (360–420 px)')
eq(/role="tablist" aria-label="Platforms"/.test(inbox) && ["'All'", "'WhatsApp'", "'Facebook'", "'Instagram'"].every(l => inbox.includes(`label: ${l}`)), true, 'platform tabs All / WhatsApp / Facebook / Instagram')
