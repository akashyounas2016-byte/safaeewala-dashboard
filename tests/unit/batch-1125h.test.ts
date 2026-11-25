// 2026-11-25 (h): Overview — choose and order the cards (R-OPS-23)
import { readFileSync } from 'node:fs'

const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m)
}
const ov = readFileSync('src/pages/Overview.tsx', 'utf8')
const cc = readFileSync('src/components/overview/CardsCustomizer.tsx', 'utf8')
const ids = [...(/const OV_CARDS = \[(.*)\]/.exec(ov)?.[1] || '').matchAll(/id: '([a-z_]+)'/g)].map(m => m[1])
eq(ids.length, 12, 'all 12 cards can be chosen')
eq(ids.every(id => new RegExp(`\\n    ${id}: \\(`).test(ov)), true, 'every card has its own entry')
eq(/cardPrefs\.order\.filter\(id => !cardPrefs\.hidden\.includes\(id\)/.test(ov) && /<CardsCustomizer cards=\{OV_CARDS\}/.test(ov), true, 'cards follow the saved order and hidden list; button by the date filter')
eq(/safeLocalStorageSet\(KEY, f\)/.test(cc) && /'safaeewala_overview_cards'/.test(cc), true, 'saved on this computer')
eq(/Reset to default/.test(cc) && /draggable/.test(cc) && /Move \$\{labelOf\(id\)\} up/.test(cc), true, 'tick, drag / arrows, reset')
eq(/\[\.\.\.saved, \.\.\.defaultIds\.filter\(id => !saved\.includes\(id\)\)\]/.test(cc), true, 'a card added later shows at the end')
