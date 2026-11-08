// R-LEAD-01: the property type is shown as the customer picked it on the website form
import { createRequire } from 'node:module'
import { resolvePropertyType, normalizeLeadWithRaw, parseFluentFormWebhook } from '@/lib/fluentFormsSync'
import type { FluentFormLead } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const raw = { your_name: 'TEST Rinu', phone: '503285219', service_needed: 'Move-In / Move-Out Cleaning', property_type: 'Flat', area_location: 'Al mamzar Dubai' }

eq(parseFluentFormWebhook(raw).property_type, 'Flat', 'a new lead keeps "Flat"')
eq(resolvePropertyType({ property_type: 'Apartment', raw_data: raw }), 'Flat', 'an old lead renamed to Apartment shows Flat again')
eq(resolvePropertyType({ property_type: 'Villa', raw_data: raw }), 'Villa', 'a value typed in the CRM wins')
eq(resolvePropertyType({ property_type: 'Townhouse' }), 'Townhouse', 'no form data: the stored value is shown')
eq(resolvePropertyType({ address: 'flat 302, Al Khair' }), 'Flat', 'no property field: guessed from the address')
eq(normalizeLeadWithRaw({ id: 'x', property_type: 'Apartment', raw_data: raw } as unknown as FluentFormLead).property_type, 'Flat', 'stored leads are healed to the form wording')

const req = createRequire(import.meta.url)
const src = req('node:fs').readFileSync('webhookServer.cjs', 'utf8') as string
eq(/function resolvePropertyType\(val\) \{[\s\S]{0,200}return s;\n\}/.test(src) && !/return 'Apartment';\n\}\n\n\/\*\*/.test(src), true, 'the webhook saves the form value as is')
