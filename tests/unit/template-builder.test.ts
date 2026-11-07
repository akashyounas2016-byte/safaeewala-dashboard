// R-WA-05: template builder — 8 types, Meta components, checks before review; R-INBOX-04 Settings tabs
import { readFileSync } from 'node:fs'
import { TEMPLATE_TYPES, buildComponents, cleanName, extractVars, fillPreview, presetFor, validateTemplate, type TemplateForm } from '@/lib/templateBuilder'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const types = (c: Record<string, unknown>[]) => c.map(x => x.type)

eq(TEMPLATE_TYPES.map(t => t.label), ['Custom Message', 'Flows', 'Appointment Reminder', 'Limited Time Offer', 'Carousel', 'Catalog', 'Multi-product', 'Call Permission'], 'the 8 template types of the prototype')
eq([cleanName('Booking Reminder 2!'), extractVars('Hi {{2}} and {{1}} {{1}}'), fillPreview('Hi {{1}}, {{2}}', { 1: 'Sara' })], ['booking_reminder_2', ['1', '2'], 'Hi Sara, {{2}}'], 'name rule, variables, preview')

const rem = presetFor('appointment_reminder')
eq(validateTemplate('appointment_reminder', rem.name, rem.category, rem.form), [], 'appointment reminder preset is ready for review')
const remC = buildComponents('appointment_reminder', rem.form)
eq(types(remC), ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'], 'reminder: header, body, footer, Confirm / Reschedule buttons')
eq((remC[1] as { example: { body_text: string[][] } }).example.body_text, [['Sara', 'Sat 08 Nov', '10:00 AM']], 'body examples in {{n}} order')

const offer = presetFor('limited_time_offer')
const offC = buildComponents('limited_time_offer', offer.form)
eq([offer.category, types(offC), (offC[2] as { buttons: { type: string }[] }).buttons.map(b => b.type)], ['MARKETING', ['limited_time_offer', 'BODY', 'BUTTONS'], ['COPY_CODE', 'URL']], 'limited-time offer: offer block, no footer, copy-code + link')
eq(validateTemplate('limited_time_offer', offer.name, 'UTILITY', offer.form).includes('A limited-time offer must be Marketing'), true, 'limited-time offer must be Marketing')

const flow = presetFor('flows')
eq(validateTemplate('flows', flow.name, flow.category, flow.form).some(e => /Flow ID/.test(e)), true, 'flows need a Flow ID')
eq((buildComponents('flows', { ...flow.form, flowId: '123' }).find(c => c.type === 'BUTTONS') as { buttons: { type: string; flow_id: string }[] }).buttons[0], { type: 'FLOW', text: 'Book now', flow_id: '123', flow_action: 'navigate' }, 'flow button')

const car = presetFor('carousel')
eq(validateTemplate('carousel', car.name, car.category, car.form).some(e => /sample image/.test(e)), true, 'carousel cards need sample images')
const carC = buildComponents('carousel', { ...car.form, cards: (car.form.cards || []).map(c => ({ ...c, handle: 'h1' })) })
eq([types(carC), (carC[1] as { cards: unknown[] }).cards.length], [['BODY', 'CAROUSEL'], 2], 'carousel: body + cards (image, text, buttons)')

eq(types(buildComponents('catalog', presetFor('catalog').form)), ['BODY', 'FOOTER', 'BUTTONS'], 'catalog: View catalog button')
eq(((buildComponents('multi_product', presetFor('multi_product').form).find(c => c.type === 'BUTTONS')) as { buttons: { type: string }[] }).buttons[0].type, 'MPM', 'multi-product: MPM button')
eq(types(buildComponents('call_permission', presetFor('call_permission').form)), ['BODY', 'FOOTER', 'call_permission_request'], 'call permission request')

const bad: TemplateForm = { header: { kind: 'image' }, body: '{{1}} hi {{3}}', examples: {}, footer: '', buttons: [{ type: 'URL', text: 'Go', url: 'example.com' }] }
const errs = validateTemplate('custom_message', 'Bad Name', 'UTILITY', bad)
eq(['Name: small letters', 'in order', 'Give an example', 'cannot start or end', 'sample file', 'https://'].every(k => errs.some(e => e.includes(k))), true, 'checks before review: name, variable order, examples, start / end, header sample, link')

const src = (p: string) => readFileSync(p, 'utf8')
eq(/Create Template/.test(src('src/components/whatsapp/TemplateBuilder.tsx')) && /PREVIEW/.test(src('src/components/whatsapp/TemplateBuilder.tsx')) && /Save draft/.test(src('src/components/whatsapp/TemplateBuilder.tsx')), true, 'builder pop-up: types, form, preview, save draft / submit')
eq(/Templates are read from Meta/.test(src('src/components/whatsapp/WaTemplates.tsx')), false, 'no more "Templates are read from Meta" — templates are made here')
eq(/\/api\/whatsapp\/templates\/submit/.test(src('whatsappServer.cjs')) && /\/api\/whatsapp\/template-media/.test(src('whatsappServer.cjs')), true, 'server submits builder templates and uploads samples')
