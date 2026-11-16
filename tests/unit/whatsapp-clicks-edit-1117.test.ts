// R-MKT-04 (2026-11-17): WhatsApp Clicks rows have Edit and Delete icons
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const page = readFileSync('src/pages/WhatsAppClicks.tsx', 'utf8')
const sql = readFileSync('supabase/migrations/2026-11-17_whatsapp_clicks_edit.sql', 'utf8')
eq(/aria-label="Edit click"/.test(page) && /aria-label="Delete click"/.test(page), true, 'every row ends with Edit and Delete icons')
eq(/<th className="py-3 px-4 text-right">Actions<\/th>/.test(page) && /colSpan=\{7\}/.test(page), true, 'Actions column in the table')
eq(/\.update\(patch\)\.eq\('id', click\.id\)\.select\(\)/.test(page) && /!data\?\.length/.test(page), true, 'edit saves to whatsapp_clicks and says so when nothing was saved')
eq(/confirmAsync\(\{ title: 'Delete click'/.test(page) && /\.delete\(\)\.eq\('id', c\.id\)\.select\(\)/.test(page), true, 'delete asks first, then deletes the row')
eq(/for update to authenticated/.test(sql) && /in \('admin', 'manager'\)/.test(sql), true, 'migration lets admin / manager edit and delete')
