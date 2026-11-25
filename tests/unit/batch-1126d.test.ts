// 2026-11-26 (d): app recommendations — offline steps, job proof, soft geofence, office alerts, driver manifest (R-APP-04)
import { readFileSync } from 'node:fs'
import { distanceM, sitePosition, addressKey, positionsByAddress, GEOFENCE_M } from '@/lib/geofence'
import { proofPath } from '@/lib/jobProofs'
import { farStepAlerts, silentLocationAlerts } from '@/lib/alerts'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const src = (p: string) => readFileSync(p, 'utf8')

// geofence
eq(Math.round(distanceM({ lat: 25.2, lng: 55.3 }, { lat: 25.201, lng: 55.3 })), 111, '0.001° latitude ≈ 111 m')
eq(sitePosition([{ lat: 1, lng: 1 }, { lat: 1.2, lng: 1.2 }, { lat: 9, lng: 9 }]), { lat: 1.2, lng: 1.2 }, 'the usual place is the median (one wrong GPS reading does not move it)')
eq(addressKey('Villa 13B, St-57 '), 'villa 13b st 57', 'same address in different spelling')
const jobs = [{ id: 'old1', address: 'Villa 13B St 57' }, { id: 'old2', address: 'Villa 13B St 57' }, { id: 'now', address: 'Villa 13B St 57' }]
const hist = [{ job_id: 'old1', lat: 25.2, lng: 55.4 }, { job_id: 'old2', lat: 25.2001, lng: 55.4001 }]
eq(positionsByAddress(hist, id => jobs.find(j => j.id === id)?.address).get('villa 13b st 57')?.length, 2, 'earlier steps grouped by address')
const far = farStepAlerts([{ id: 's', job_id: 'now', cleaner: 'Ambika', status: 'started', lat: 25.25, lng: 55.4 }], hist, jobs, '2026-11-26')
const near = farStepAlerts([{ id: 's', job_id: 'now', cleaner: 'Ambika', status: 'started', lat: 25.2002, lng: 55.4 }], hist, jobs, '2026-11-26')
eq([far.length, near.length, GEOFENCE_M], [1, 0, 300], 'office alert when started > 300 m from the usual place, none when there')

// silent location
const emps = [{ id: 'e1', full_name: 'Misbah Asad Ullah', status: 'active' }] as never[]
const j = [{ id: 'j', date: '2026-11-26', staff_name: 'Misbah Asad Ullah', start_time: '09:00', end_time: '12:00', address: 'A' }]
const now = Date.parse('2026-11-26T06:30:00Z')
eq([
  silentLocationAlerts(j, [], emps, new Set(['e1']), '2026-11-26', 10 * 60, now).length,
  silentLocationAlerts(j, [{ employee_id: 'e1', updated_at: '2026-11-26T06:25:00Z' }], emps, new Set(['e1']), '2026-11-26', 10 * 60, now).length,
  silentLocationAlerts(j, [], emps, new Set(), '2026-11-26', 10 * 60, now).length,
], [1, 0, 0], 'no position while on a job → alert; a fresh one or no login → none')

// proof + offline + manifest
eq(proofPath('2026-11-26', 'job1', 'Ambika Devi Tharu', 'signature'), '2026-11-26/job1/ambika-devi-tharu-signature.png', 'proof file path')
eq(/bucket_id = 'job-proofs' and \(not public\.is_field_login\(\) or owner = auth\.uid\(\)\)/.test(src('supabase/migrations/2026-11-26_job_proofs.sql')), true, 'only the office (and the uploader) see the proofs')
const ck = src('src/lib/jobCheckins.ts')
eq(/saveQueue\(\[\.\.\.queuedSteps\(\)\.filter\(r => r\.id !== id\), row\]\)/.test(ck) && /addEventListener\('online'/.test(ck), true, 'a step without internet waits on the phone and goes when online')
const md = src('src/pages/MyDuties.tsx')
eq(/capture="environment"/.test(md) && /<SignaturePad onChange=\{setSignature\} \/>/.test(md) && /You seem away from this job/.test(md), true, 'photo at Start / End, client signature at End, soft geofence on Start')
eq(/<DriverManifest site=\{s\}/.test(md) && /manifest\?: Record<string, Record<string, \{ dropped\?: string; picked\?: string \}>>/.test(src('src/lib/driverPlans.ts')), true, 'driver manifest per stop, saved in the day plan')
