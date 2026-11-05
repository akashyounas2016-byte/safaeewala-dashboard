// UX-93 / R-OPS-04: Settings → Backup shows the nightly backup result; UX-92: Clients card limit
import { readFileSync } from 'node:fs'
import { backupHealth, nextBackupAt } from '@/lib/backupStatus'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

const now = new Date('2026-11-05T13:00:00Z') // 17:00 Dubai
eq(backupHealth({ configured: false }, now), 'none', 'no status file yet → none')
eq(backupHealth({ configured: true, ok: true, at: '2026-11-04T22:00:30Z' }, now), 'ok', 'last night OK → ok')
eq(backupHealth({ configured: true, ok: false, at: '2026-11-04T22:00:30Z' }, now), 'failed', 'failed run → failed')
eq(backupHealth({ configured: true, ok: true, at: '2026-11-03T22:00:30Z' }, now), 'stale', 'more than 26 h old → stale')

eq(nextBackupAt(now).toISOString(), '2026-11-05T22:00:00.000Z', 'next run tonight 02:00 Dubai')
eq(nextBackupAt(new Date('2026-11-05T23:00:00Z')).toISOString(), '2026-11-06T22:00:00.000Z', 'after the run → the next night')

const server = src('webhookServer.cjs')
eq(/pathname === '\/api\/backup-status'/.test(server), true, 'server serves /api/backup-status')
eq(/write_status true/.test(src('scripts/backup/db-backup.sh')) && /write_status false/.test(src('scripts/backup/db-backup.sh')), true, 'script writes the status on success and failure')
eq(/<BackupStatusCard \/>/.test(src('src/pages/Settings.tsx')), true, 'card shown on the Backup tab')

const clients = src('src/pages/Clients.tsx')
eq(/const CLIENT_CARDS_PREVIEW = 12/.test(clients) && /View All \(/.test(clients), true, 'Clients: 4 rows of 3, then View All')
