// R-SYNC-15: an employee / agency is saved without its inline files; the files go to Storage and their paths follow
import { readFileSync } from 'node:fs'
import { withoutInlineDocs } from '@/lib/docStorage'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const big = 'data:image/jpeg;base64,' + 'A'.repeat(4_000_000)
const emp = { id: 'e1', full_name: 'Sara', eid_file: big, passport_file: 'storage:employees/e1/p.jpg', documents: [{ id: 'd1', file_data: big }, { id: 'd2', file_data: 'storage:employees/e1/d2.jpg' }] }
const clean = withoutInlineDocs(emp, ['eid_file', 'passport_file'])
eq([clean.eid_file, clean.passport_file, clean.documents.map(d => d.file_data)], [null, 'storage:employees/e1/p.jpg', ['', 'storage:employees/e1/d2.jpg']], 'inline files left out, stored paths kept')
eq(JSON.stringify(clean).length < 1000, true, 'the save request is small (was several MB)')
eq(emp.eid_file === big && emp.documents[0].file_data === big, true, 'the original stays untouched (it is uploaded to Storage)')
const plain = { id: 'x', name: 'Agency' }
eq(withoutInlineDocs(plain) === plain, true, 'a record without files is passed through as is')

const ctx = readFileSync('src/store/DataContext.tsx', 'utf8')
eq(/dbInsert\('employees', withoutInlineDocs\(row, EMP_FILE_FIELDS\)\)/.test(ctx) && /dbInsert\('agencies', withoutInlineDocs\(row\)\)/.test(ctx), true, 'new employees / agencies saved without inline files')
eq(/safeLocalStorageSet\('safaeewala_employees', employees\.map\(e => withoutInlineDocs/.test(ctx), true, 'no MB-sized photos in the browser cache')
eq(/if \(u && r\[k\] === u\.from\)/.test(ctx) && /Array\.isArray\(r\.documents\) \? swap\(r\.documents\)/.test(ctx), true, 'uploaded paths matched against the saved record, not the screen copy')
eq(/could not be uploaded — open the/.test(ctx), true, 'a file that did not upload is reported')
