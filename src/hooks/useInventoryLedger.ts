import { useEffect, useState } from 'react'
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/storageUtils'
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
