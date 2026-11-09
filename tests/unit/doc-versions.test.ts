// R-DOC-01: new images become current, the replaced set shows as Previous, older sets stay in history, nothing is deleted
import { readFileSync } from 'node:fs'
import { addVersion, currentDocs, earlierDocs, removeVersion, seedFromFields, type VersionedDoc } from '@/lib/docVersions'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const img = (id: string, at: string): VersionedDoc => ({ id, category: 'passport', name: id, file_data: `storage:x/${id}.jpg`, uploaded_at: at })
const ids = (l: VersionedDoc[]) => l.map(d => d.id)

// an old employee: one image in passport_file
let docs = seedFromFields<VersionedDoc>([], [['passport', 'Passport', 'storage:x/old.jpg'], ['eid', 'Emirates ID', undefined]], '2026-01-01T00:00:00Z')
eq(ids(currentDocs(docs, 'passport')), ['doc-passport-legacy'], 'old single image becomes the current one')
eq(currentDocs(docs, 'eid').length, 0, 'no image = nothing seeded')

// upload 2 pages at once → both current, the old one is Previous
docs = addVersion(docs, 'passport', [img('p1', '2026-11-09T10:00:00Z'), img('p2', '2026-11-09T10:00:01Z')], '2026-11-09T10:00:05Z')
eq(ids(currentDocs(docs, 'passport')), ['p2', 'p1'], 'both new pages are current, newest first')
eq(ids(earlierDocs(docs, 'passport').previous), ['doc-passport-legacy'], 'the replaced image shows as Previous')

// renew again → the 2 pages become Previous, the very first goes to history
docs = addVersion(docs, 'passport', [img('p3', '2027-01-01T09:00:00Z')], '2027-01-01T09:00:05Z')
const e = earlierDocs(docs, 'passport')
eq([ids(currentDocs(docs, 'passport')), ids(e.previous).sort(), ids(e.history)], [['p3'], ['p1', 'p2'], ['doc-passport-legacy']], 'Previous = the set replaced last, older ones in history')

// remove keeps the file
docs = removeVersion(docs, 'p3', '2027-01-02T00:00:00Z')
eq([currentDocs(docs, 'passport').length, docs.length, docs.find(d => d.id === 'p3')?.removed_at], [0, 4, '2027-01-02T00:00:00Z'], 'Remove takes it out of current but keeps it')
eq(ids(earlierDocs(docs, 'passport').previous), ['p3'], 'a removed image is the latest previous')

const form = readFileSync('src/components/employees/EmployeeFormModal.tsx', 'utf8')
eq((form.match(/<DocVersionsField/g) || []).length >= 5, true, 'employee popup: compliance documents use the versioned field')
eq(/fileOf\('passport', initialEmployee\?\.passport_file\)/.test(form), true, 'passport_file = the newest current image')
const field = readFileSync('src/components/common/DocVersionsField.tsx', 'utf8')
eq(/type="file" multiple/.test(field) && /Previous · replaced/.test(field), true, 'field takes several files and shows Previous')
for (const f of ['src/pages/Agencies.tsx', 'src/components/agencies/AgencyDashboard.tsx']) {
  const s = readFileSync(f, 'utf8')
  eq(/<DocVersionsField/.test(s) && !/prev\.filter\(d => d\.id !== id\)/.test(s), true, `${f.split('/').pop()}: versioned field, remove never deletes`)
}
const backup = readFileSync('scripts/backup/db-backup.sh', 'utf8')
eq(/storage-mirror\.cjs/.test(backup) && /BUCKETS=staff-documents,whatsapp-media/.test(backup), true, 'nightly backup copies the Storage files')
