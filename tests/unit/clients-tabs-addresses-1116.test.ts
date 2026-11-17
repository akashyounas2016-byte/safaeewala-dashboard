// 2026-11-16: Clients tabs (UX-163), Add Client keeps the mode's data (R-CLI-08), one Address field + more
// addresses per client (R-CLI-09), "+N more" upcoming (UX-162). "Cloud Test" values only.
import { readFileSync } from 'node:fs'
import { singleAddressOf, cleanAddresses } from '@/lib/clientAddress'
import { scheduledAddressOf } from '@/lib/clientDataSync'
import type { Client } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}

// ── R-CLI-09: one Address field ──
eq([singleAddressOf({ building_name: 'Al Khair Building', apartment: '302' }), singleAddressOf({ building_name: 'Villa 25' }), singleAddressOf({ apartment: '302' }), singleAddressOf({ building_name: 'Apt 302 Al Khair', apartment: '302' })],
  ['Al Khair Building Apt 302', 'Villa 25', '302', 'Apt 302 Al Khair'], 'Building + Apartment become one address')
const old = { full_name: 'Cloud Test Sara', building_name: 'Al Khair Building', apartment: '302' } as Client
const merged = { ...old, building_name: singleAddressOf(old), apartment: '' } as Client
eq(scheduledAddressOf(merged), scheduledAddressOf(old), 'the visit address does not change, so old visits still match')
eq(cleanAddresses([{ id: 'a', label: ' Office ', address: ' JLT Tower 5 ', area: 'JLT' }, { id: 'b', label: 'x', address: '  ' }, null]),
  [{ id: 'a', label: 'Office', address: 'JLT Tower 5', area: 'JLT' }], 'empty extra addresses are dropped')

const modal = readFileSync('src/components/clients/ClientModalForm.tsx', 'utf8')
const monthly = (readFileSync('src/components/clients/ClientModalForm.tsx', 'utf8') + readFileSync('src/components/monthlyClients/WeeklyScheduleCard.tsx', 'utf8'))
eq(/label="Address \*"/.test(modal) && /label="Address \*"/.test(monthly) && !/label="Apartment \/ Villa Number"/.test(modal + monthly), true, 'both forms have one Address field')
eq(/label="Mobile Number \*"[\s\S]{0,120}required/.test(modal), true, 'mobile number is required (one popup for every mode, R-SCHED-20)')
eq(/<AddressesEditor initial=\{seed\?\.addresses\} \/>/.test(modal) && /addresses: +cleanAddresses\(JSON\.parse/.test(modal), true, '"Add another address", saved with the client (every mode)')
// UX-166 (replaces UX-164): Email with the contact; Address · Area · City first, then other addresses, then the cleaner
eq(modal.indexOf('name="email"') < modal.indexOf('name="building_name"') && modal.indexOf('name="building_name"') < modal.indexOf('name="area"') && modal.indexOf('name="area"') < modal.indexOf('name="city"') && modal.indexOf('name="city"') < modal.indexOf('name="preferred_cleaner"'), true, 'address card order')
const editor = readFileSync('src/components/clients/AddressesEditor.tsx', 'utf8')
eq(/aria-label="Edit address"/.test(editor) && /<Pencil size=\{13\} \/>/.test(editor) && /editing\.has\(a\.id\) \?/.test(editor), true, 'saved addresses show as a list with an edit (pencil) icon')
const booking = readFileSync('src/components/bookings/NewBookingModal.tsx', 'utf8')
eq(/\(c\.addresses \|\| \[\]\)\.forEach/.test(booking) && /handleSelectClient\(item\.client, cleanItemBuilding, item\.extraArea\)/.test(booking), true, 'the extra addresses can be picked when booking')
eq(/add column if not exists addresses jsonb/.test(readFileSync('supabase/migrations/2026-11-16_client_addresses.sql', 'utf8')), true, 'migration')

// ── R-CLI-08: Add Client keeps what the form sent (General / Monthly / Bi-Weekly) ──
const cl = readFileSync('src/pages/Clients.tsx', 'utf8')
eq(/R-CLI-08: everything the form sent[\s\S]{0,400}\.\.\.clientData,\s*id: +newClientId/.test(cl), true, 'Clients → Add Client keeps mode, weekly schedule and Bi-Weekly plan')
const quick = readFileSync('src/components/common/QuickNewClientModal.tsx', 'utf8')
eq(/\.\.\.\(data as Omit<Client, 'id' \| 'created_at'>\),/.test(quick) && /addClient\(\{ \.\.\.payload, id \}\)/.test(quick) && /onClientRegistered\(\{ \.\.\.payload, id,/.test(quick), true, 'Add Job → new client keeps them too, and the job gets the real client id')

// ── UX-163: tabs ──
eq(/\['general', 'Clients'\], \['monthly', 'Monthly Clients'\], \['biweekly', 'Bi-Weekly Clients'\]/.test(cl) && /const matchTab = shownTab === 'general' \|\| modeOfClient\(c\) === shownTab/.test(cl), true, 'Clients (all, UX-168) · Monthly Clients · Bi-Weekly Clients tabs')
eq(/prefill=\{shownTab === 'general' \? undefined : \{ service_mode: shownTab \}\}/.test(cl), true, 'Add Client opens in the tab\'s mode (same popup on every tab)')

// ── UX-162 ──
const prof = readFileSync('src/pages/ClientProfile.tsx', 'utf8')
eq(/onClick=\{\(\) => setShowAllUpcoming\(true\)\}/.test(prof) && /upcoming\.map\(renderUpcomingVisit\)/.test(prof), true, '"+N more" opens the full list')
eq(/\? 'bg-purple-600 text-white shadow-xs'/.test(prof), false, 'Daily Job Sheet tab no longer purple')

// ── UX-165: deleting a client needs its exact name typed ──
const host = readFileSync('src/components/common/ConfirmHost.tsx', 'utf8')
eq(/typeToConfirm\?: string/.test(readFileSync('src/lib/notify.ts', 'utf8')) && /disabled=\{!typedOk\}/.test(host) && /if \(ok && !typedOk\) return/.test(host), true, 'Confirm stays off until the text is typed')
eq((cl.match(/typeToConfirm: c\.full_name/g) || []).length, 2, 'Clients: card and table delete ask for the name')
eq(/typeToConfirm: client\.full_name/.test(prof), true, 'client profile delete asks for the name')
eq(cl.includes('disabled={deleteTyped.trim()') && cl.includes('setDeleteTyped'), true, 'the client popup delete box asks for the name too')
