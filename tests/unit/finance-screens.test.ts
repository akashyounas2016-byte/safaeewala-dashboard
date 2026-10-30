// Behaviour tests for the finance-screens fixes
import { nextInvoiceNumber, ensureInvoiceNumber } from '@/lib/invoiceNumber'
import { jobCollected, calcJobCollectable, calcJobPending } from '@/lib/clientDataSync'
import { getCompanyInfo } from '@/lib/companyInfo'

let failed = 0
const check = (name: string, cond: boolean, extra?: unknown) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  → ' + JSON.stringify(extra)}`)
  if (!cond) failed++
}
const y = new Date().getFullYear()

// AUD-36
check('first invoice of the year', nextInvoiceNumber([]) === `SAF-${y}-0001`, nextInvoiceNumber([]))
check('next after highest, ignores old formats', nextInvoiceNumber([{ invoice_number: `SAF-${y}-0007` }, { invoice_number: 'INV-123456' }, { invoice_number: `SAF-${y}-0003` }]) === `SAF-${y}-0008`)
check('new year restarts sequence', nextInvoiceNumber([{ invoice_number: `SAF-${y - 1}-0099` }]) === `SAF-${y}-0001`)
check('duplicate proposal replaced', ensureInvoiceNumber(`SAF-${y}-0002`, [{ invoice_number: `SAF-${y}-0002` }]) === `SAF-${y}-0003`)
check('random legacy proposal replaced', ensureInvoiceNumber('INV-202610-4821', []) === `SAF-${y}-0001`)
check('valid free proposal kept', ensureInvoiceNumber(`SAF-${y}-0005`, [{ invoice_number: `SAF-${y}-0002` }]) === `SAF-${y}-0005`)

// AUD-24 / AUD-30
const job = (o: any) => ({ id: 'j', charges: 200, received: 0, payment_mode: 'Cash', staff_name: 'A', ...o }) as any
check('cash job with no received counts as collected', jobCollected(job({})) === 200)
check('pending job not counted as collected', jobCollected(job({ payment_mode: 'Pending' })) === 0)
check('monthly job not counted as collected', jobCollected(job({ payment_mode: 'Monthly' })) === 0)
check('received amount wins', jobCollected(job({ payment_mode: 'Pending', received: 150 })) === 150)
check('monthly visit not on receivables screens', calcJobCollectable(job({ payment_mode: 'Monthly' })) === 0)
check('monthly visit still has job-level balance for the job sheet', calcJobPending(job({ payment_mode: 'Monthly' })) === 200)
check('pending job is collectable', calcJobCollectable(job({ payment_mode: 'Pending', received: 50 })) === 150)

// AUD-34
const c = getCompanyInfo()
check('company name is the current legal name, no placeholder TRN', c.company_name.includes('Technical Services') && c.trn === '', c)
localStorage.setItem('safaeewala_company_info', JSON.stringify({ trn: '100999888777003' }))
check('company info comes from saved settings', getCompanyInfo().trn === '100999888777003')

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
process.exit(failed ? 1 : 0)
