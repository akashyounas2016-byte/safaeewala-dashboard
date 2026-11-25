// 2026-11-25 (c): Inventory — In Stock / Min Stock readable, Add Item with the essentials first (UX-198)
import { readFileSync } from 'node:fs'
const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const inv = readFileSync('src/pages/Inventory.tsx', 'utf8')
eq(/\['In Stock', 'text-right px-5 min-w-\[110px\]/.test(inv) && /\['Min Stock', 'text-right px-5 min-w-\[110px\] border-l/.test(inv), true, 'In Stock and Min Stock: own wide right-aligned columns, a line between')
eq(/<Qty n=\{item\.current_stock\} unit=\{item\.unit\}/.test(inv) && /<Qty n=\{item\.min_stock\} unit=\{item\.unit\}/.test(inv), true, 'number on top, unit under it')
const isValidUnit = (u: string) => !!u.trim() && !/^[\d.,\s]+$/.test(u.trim())
eq([isValidUnit('5'), isValidUnit(' 1.5 '), isValidUnit(''), isValidUnit('Bottles'), isValidUnit('5L cans')], [false, false, false, true, true], 'a number alone is not a unit')
eq(inv.includes('const isValidUnit = (u: string) => !!u.trim() && !/^[') && inv.includes('notify.error(\'Unit should be a word'), true, 'same unit check in the page, refused with a message')
eq(/More details \(optional\)/.test(inv) && /className=\{showMore \? 'space-y-4' : 'hidden'\}/.test(inv), true, 'cost, supplier, location, reorder under More details')
eq(/name="current_stock" label="Current Stock"[^>]*required/.test(inv), true, 'Current Stock is asked first and required')
