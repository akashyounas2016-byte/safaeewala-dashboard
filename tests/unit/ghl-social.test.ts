// R-GHL-02 Google posts through GHL Social Planner, R-GHL-01 review link
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TOKENS, isReviewLink } from '@/lib/inboxSettings'

// the test runs from a temp folder: the server file is found from the project folder (cwd)
const require = createRequire(resolve(process.cwd(), 'package.json'))
const { buildPostBody, SOCIAL_SCOPES } = require(resolve(process.cwd(), 'ghlServer.cjs'))
const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const err = (fn: () => unknown) => { try { fn(); return '' } catch (e) { return (e as Error).message } }
const now = new Date('2026-11-09T10:00:00Z')

const std = buildPostBody({ accountIds: ['g1'], summary: 'Deep cleaning this week', mode: 'now', gmb: { eventType: 'STANDARD', actionType: 'book', url: 'https://safaeewala.com' } }, now)
eq([std.status, std.type, std.gmbPostDetails, std.media], ['published', 'post', { gmbEventType: 'STANDARD', actionType: 'book', url: 'https://safaeewala.com' }, []], 'update posted now with a Book button')
eq(err(() => buildPostBody({ accountIds: ['g1'], summary: 'x', gmb: { eventType: 'STANDARD', actionType: 'book', url: 'safaeewala.com' } }, now)), 'The button needs a link (https://…).', 'a button needs an https link')
eq(buildPostBody({ accountIds: ['g1'], summary: 'x', gmb: { eventType: 'STANDARD', actionType: 'call' } }, now).gmbPostDetails, { gmbEventType: 'STANDARD', actionType: 'call' }, 'Call needs no link')
eq(err(() => buildPostBody({ accountIds: [], summary: 'x', mode: 'now', gmb: {} }, now)), 'Choose at least one account to post to.', 'an account is needed (not for a draft)')
eq(buildPostBody({ accountIds: [], summary: 'x', mode: 'draft', gmb: {} }, now).status, 'draft', 'a draft needs no account')
eq(err(() => buildPostBody({ accountIds: ['g1'], summary: '', gmb: {} }, now)), 'Write the post text or add a photo.', 'text or photo')

const ev = buildPostBody({ accountIds: ['g1'], summary: 'Open day', mode: 'schedule', scheduleAt: '2026-11-10T09:00:00+04:00', gmb: { eventType: 'EVENT', title: 'Free sofa check', actionType: 'none', startDate: '2026-11-12', endDate: '2026-11-13' } }, now)
eq([ev.status, ev.scheduleDate, ev.gmbPostDetails.startDate, ev.gmbPostDetails.endDate.endTime], ['scheduled', '2026-11-10T05:00:00.000Z', { startDate: { year: 2026, month: 11, day: 12 }, startTime: { hours: 0, minutes: 0, seconds: 0 } }, { hours: 23, minutes: 59, seconds: 0 }], 'event scheduled (Dubai time → UTC) with dates')
eq(err(() => buildPostBody({ accountIds: ['g1'], summary: 'x', mode: 'schedule', scheduleAt: '2026-11-09T14:01:00+04:00', gmb: {} }, now)), 'Pick a time at least 5 minutes from now.', 'a schedule in the past is refused')
eq(err(() => buildPostBody({ accountIds: ['g1'], summary: 'x', gmb: { eventType: 'OFFER', offerTitle: '20% off', couponCode: 'NOV20', startDate: '2026-11-10', endDate: '2026-11-30', termsUrl: 'https://safaeewala.com/terms' } }, now)), 'An offer needs a terms link and a booking / redeem link (https://…).', 'an offer needs both links')
const offer = buildPostBody({ accountIds: ['g1'], summary: '', mediaUrl: 'https://x.supabase.co/o.png?token=1', mediaType: 'image/png', gmb: { eventType: 'OFFER', offerTitle: '20% off', couponCode: 'NOV20', startDate: '2026-11-10', endDate: '2026-11-30', termsUrl: 'https://safaeewala.com/terms', redeemUrl: 'https://safaeewala.com/book' } }, now)
eq([offer.media, offer.gmbPostDetails.actionType, offer.gmbPostDetails.couponCode], [[{ url: 'https://x.supabase.co/o.png?token=1', type: 'image/png' }], undefined, 'NOV20'], 'offer with a photo only (no button field on offers)')
eq(/socialplanner\/post\.write/.test(SOCIAL_SCOPES), true, 'the missing-permission message names the scopes')

const srv = readFileSync('ghlServer.cjs', 'utf8')
eq(/version: 'v3'/.test(srv) && /social\\\/\(accounts\|posts\|posts\\\/list\)/.test(srv), true, 'Social Planner calls use Version v3; routes /api/ghl/social/*')

// R-GHL-01
eq(TOKENS.includes('{review_link}'), true, '{review_link} can be picked as a template value')
eq([isReviewLink('https://g.page/r/CQx123/review'), isReviewLink('https://search.google.com/local/writereview?placeid=ChIJ'), isReviewLink('https://example.com')], [true, true, false], 'Google review links recognised')
const wa = readFileSync('whatsappServer.cjs', 'utf8')
eq(/review_link: \(await automation\(\)\)\.reviewLink/.test(wa), true, 'the server fills {review_link} in client messages')
eq(/fillReply\(r\.text\)/.test(readFileSync('src/components/whatsapp/Composer.tsx', 'utf8')), true, 'a quick reply with {review_link} gets the link')
