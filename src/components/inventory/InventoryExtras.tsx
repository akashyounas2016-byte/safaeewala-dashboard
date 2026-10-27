import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, PackageCheck, Truck, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { useData } from '@/store/DataContext'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
import { notify, confirmAsync } from '@/lib/notify'
import type { InventoryItem } from '@/types'

/* Cloud-synced keys (see cloudState.ts) */
const ORDERS_KEY = 'safaeewala_purchase_orders'
const USAGE_KEY = 'safaeewala_inventory_usage'

export interface PurchaseOrder {
  id: string; itemId: string; itemName: string; qty: number; unitCost: number; supplier?: string
  status: 'open' | 'received' | 'cancelled'; createdAt: string; receivedAt?: string
}
export interface UsageEntry { id: string; itemId: string; itemName: string; qty: number; date: string; note?: string }

const today = () => new Date().toISOString().split('T')[0]

/** Purchase orders + usage log state shared by the Inventory screen (UX-15) */
export function useInventoryLedger() {
  const [orders, setOrders] = useState<PurchaseOrder[]>(() => safeLocalStorageGet<PurchaseOrder[]>(ORDERS_KEY, []))
  const [usage, setUsage] = useState<UsageEntry[]>(() => safeLocalStorageGet<UsageEntry[]>(USAGE_KEY, []))
  useEffect(() => { safeLocalStorageSet(ORDERS_KEY, orders) }, [orders])
  useEffect(() => { safeLocalStorageSet(USAGE_KEY, usage) }, [usage])

  const createOrders = (items: InventoryItem[]) => {
    const open = new Set(orders.filter(o => o.status === 'open').map(o => o.itemId))
    const fresh = items.filter(i => !open.has(i.id)).map((i, n) => ({
      id: `po-${Date.now()}-${n}`, itemId: i.id, itemName: i.name, qty: i.reorder_quantity || 1,
      unitCost: i.unit_cost || 0, supplier: i.supplier, status: 'open' as const, createdAt: today(),
    }))
    if (fresh.length) setOrders(prev => [...fresh, ...prev])
    return fresh.length
  }
  return { orders, setOrders, usage, setUsage, createOrders }
}

/** Edit an item's details (UX-15) */
export function EditItemModal({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const { updateInventory } = useData()
  return (
    <Modal open={!!item} onClose={onClose} title={item ? `Edit — ${item.name}` : ''} size="md">
      {item && (
        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            updateInventory(item.id, {
              name: (fd.get('name') as string) || item.name,
              category: (fd.get('category') as string) || item.category,
              unit: (fd.get('unit') as string) || item.unit,
              min_stock: Number(fd.get('min_stock')) || 0,
              reorder_quantity: Number(fd.get('reorder_quantity')) || 0,
              unit_cost: Number(fd.get('unit_cost')) || 0,
              supplier: (fd.get('supplier') as string) || undefined,
              location: (fd.get('location') as string) || item.location,
            })
            notify.success(`${item.name} updated`)
            onClose()
          }}
        >
          <Input name="name" label="Item name" defaultValue={item.name} required />
          <div className="grid grid-cols-2 gap-3">
            <Input name="category" label="Category" defaultValue={item.category} />
            <Input name="unit" label="Unit" defaultValue={item.unit} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input name="min_stock" label="Min stock" type="number" defaultValue={String(item.min_stock)} />
            <Input name="reorder_quantity" label="Reorder qty" type="number" defaultValue={String(item.reorder_quantity)} />
            <Input name="unit_cost" label="Unit cost (AED)" type="number" step="0.01" defaultValue={String(item.unit_cost)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input name="supplier" label="Supplier" defaultValue={item.supplier || ''} />
            <Input name="location" label="Location" defaultValue={item.location} />
          </div>
          <p className="text-[11px] text-slate-400">Stock is changed only by "Receive" and "Use", so every movement is recorded.</p>
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold">Save</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/** Record stock used on jobs (UX-15) */
export function UseStockModal({ item, onClose, onLogged }: { item: InventoryItem | null; onClose: () => void; onLogged: (entry: UsageEntry) => void }) {
  const { updateInventory } = useData()
  return (
    <Modal open={!!item} onClose={onClose} title={item ? `Use stock — ${item.name}` : ''} size="sm">
      {item && (
        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const qty = Number(fd.get('qty')) || 0
            if (qty <= 0 || qty > item.current_stock) { notify.error(`Enter a quantity between 1 and ${item.current_stock}.`); return }
            updateInventory(item.id, { current_stock: item.current_stock - qty })
            onLogged({ id: `use-${Date.now()}`, itemId: item.id, itemName: item.name, qty, date: (fd.get('date') as string) || today(), note: (fd.get('note') as string) || undefined })
            notify.success(`${qty} ${item.unit} of ${item.name} recorded as used`)
            onClose()
          }}
        >
          <p className="text-[12px] text-slate-500">In stock: <strong className="text-slate-800">{item.current_stock} {item.unit}</strong></p>
          <div className="grid grid-cols-2 gap-3">
            <Input name="qty" label={`Quantity (${item.unit})`} type="number" min="0" step="any" required />
            <Input name="date" label="Date" type="date" defaultValue={today()} />
          </div>
          <Input name="note" label="Used for (job / site)" placeholder="e.g. Marina Gate deep clean" />
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold">Record use</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/** Open purchase orders with Receive / Cancel; receiving adds stock and logs the expense (UX-15) */
export function PurchaseOrdersPanel({ orders, setOrders }: { orders: PurchaseOrder[]; setOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>> }) {
  const { inventory, updateInventory, addDailyExpense } = useData()
  const open = orders.filter(o => o.status === 'open')
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null)
  if (open.length === 0) return null
  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#E4E8EC] flex items-center gap-2">
        <ClipboardList size={16} className="text-indigo-600" />
        <h3 className="text-[15px] font-bold text-[#111827]">Open purchase orders</h3>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{open.length}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {open.map(o => (
          <div key={o.id} className="px-5 py-2.5 flex items-center gap-3 text-[12.5px] flex-wrap">
            <span className="font-semibold text-slate-800 flex-1 min-w-[160px]">{o.itemName}</span>
            <span className="text-slate-500">{o.qty} × AED {o.unitCost}</span>
            <span className="text-slate-400">{o.supplier || 'No supplier'}</span>
            <span className="text-slate-400">ordered {o.createdAt}</span>
            <button type="button" onClick={() => setReceiving(o)} className="flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-1 rounded-lg bg-teal-600 text-white hover:bg-teal-700 cursor-pointer">
              <PackageCheck size={12} /> Receive
            </button>
            <button
              type="button"
              onClick={async () => {
                if (await confirmAsync({ title: 'Cancel order', message: `Cancel the order for ${o.itemName}?`, confirmLabel: 'Cancel order', tone: 'danger' })) {
                  setOrders(prev => prev.map(x => x.id === o.id ? { ...x, status: 'cancelled' } : x))
                }
              }}
              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" title="Cancel order"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <Modal open={!!receiving} onClose={() => setReceiving(null)} title={receiving ? `Receive — ${receiving.itemName}` : ''} size="sm">
        {receiving && (
          <form
            className="space-y-3"
            onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const qty = Number(fd.get('qty')) || 0
              const cost = Number(fd.get('cost')) || 0
              const item = inventory.find(i => i.id === receiving.itemId)
              if (!item) { notify.error('This item no longer exists.'); return }
              if (qty <= 0) { notify.error('Enter the quantity received.'); return }
              updateInventory(item.id, { current_stock: item.current_stock + qty, unit_cost: cost || item.unit_cost, last_restocked: today() })
              if (qty * cost > 0) {
                addDailyExpense({
                  date: today(), name: `Stock: ${item.name} × ${qty} ${item.unit}`, category: 'Supplies & Materials',
                  amount: Math.round(qty * cost * 100) / 100, source: 'Direct Expense',
                  payment_method: (fd.get('method') as string) || 'Cash', vendor: receiving.supplier,
                })
              }
              setOrders(prev => prev.map(x => x.id === receiving.id ? { ...x, status: 'received', receivedAt: today(), qty, unitCost: cost } : x))
              notify.success(`${qty} ${item.unit} of ${item.name} received`)
              setReceiving(null)
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Input name="qty" label="Quantity received" type="number" min="0" step="any" defaultValue={String(receiving.qty)} required />
              <Input name="cost" label="Cost per unit (AED)" type="number" min="0" step="0.01" defaultValue={String(receiving.unitCost)} />
            </div>
            <Select name="method" label="Paid by" defaultValue="Cash">
              <option value="Cash">Cash</option><option value="Bank Transfer">Bank Transfer</option>
              <option value="Credit Card">Credit Card</option><option value="Petty Cash">Petty Cash</option>
            </Select>
            <p className="text-[11px] text-slate-400">Adds the stock and records the purchase as an expense.</p>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setReceiving(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold">Receive</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

/** Suppliers with their items, low-stock count, last restock and open orders (UX-16) */
export function SuppliersPanel({ inventory, orders, onOrderLow }: {
  inventory: InventoryItem[]; orders: PurchaseOrder[]; onOrderLow: (items: InventoryItem[]) => void
}) {
  const rows = useMemo(() => {
    const map = new Map<string, InventoryItem[]>()
    inventory.forEach(i => {
      const k = (i.supplier || '').trim() || 'No supplier'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(i)
    })
    return Array.from(map.entries()).map(([supplier, items]) => ({
      supplier, items,
      low: items.filter(i => i.current_stock <= i.min_stock),
      last: items.map(i => i.last_restocked || '').sort().pop() || '—',
      open: orders.filter(o => o.status === 'open' && items.some(i => i.id === o.itemId)).length,
    })).sort((a, b) => b.low.length - a.low.length || a.supplier.localeCompare(b.supplier))
  }, [inventory, orders])

  if (rows.length === 0) return null
  return (
    <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
      <h3 className="text-[15px] font-bold text-[#111827] mb-3 flex items-center gap-2"><Truck size={16} className="text-purple-600" /> Suppliers</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.map(r => (
          <div key={r.supplier} className="rounded-2xl border border-slate-200 p-3.5">
            <p className="font-bold text-[13px] text-slate-800 truncate">{r.supplier}</p>
            <p className="text-[11.5px] text-slate-500 mt-0.5">{r.items.length} item{r.items.length === 1 ? '' : 's'} · last restock {r.last} · {r.open} open order{r.open === 1 ? '' : 's'}</p>
            {r.low.length > 0 ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-bold text-amber-700 truncate">{r.low.length} low: {r.low.map(i => i.name).join(', ')}</span>
                <button type="button" onClick={() => onOrderLow(r.low)} className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 cursor-pointer">
                  Order low items
                </button>
              </div>
            ) : (
              <p className="mt-2 text-[11.5px] text-emerald-700 font-semibold">All items stocked</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
