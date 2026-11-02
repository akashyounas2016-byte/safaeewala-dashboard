// E2E-08 / R-SEC-04: documents are shown through a reference, never need the file in the row
import { docKind, docSrc, isStoredDoc, isInlineDoc } from '@/lib/docStorage'

const eq = (a: unknown, b: unknown, m: string) => {
  if (a !== b) { console.log('FAIL', m, a, b); process.exitCode = 1 } else console.log('PASS ', m)
}
eq(isStoredDoc('storage:employees/e1/d1-eid.png'), true, 'storage reference recognised')
eq(isInlineDoc('data:image/png;base64,AAAA'), true, 'old inline file recognised')
eq(docKind({ file_data: 'data:image/png;base64,AAAA' }), 'image', 'inline image')
eq(docKind({ file_data: 'storage:employees/e1/d2-passport.pdf' }), 'pdf', 'stored pdf from the path')
eq(docKind({ file_data: 'storage:x/y', file_type: 'image/jpeg' }), 'image', 'stored image from the type')
eq(docKind({ file_data: 'storage:x/y-notes.docx' }), 'other', 'other files')
eq(docSrc('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA', 'inline file is shown as it is')
eq(docSrc(undefined), '', 'no file, no link')
