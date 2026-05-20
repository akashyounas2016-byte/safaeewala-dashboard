import { useState } from 'react'
import { Plus, Search, AlertTriangle, Package, TrendingUp, DollarSign, Truck, Boxes, BarChart3, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHero } from '@/components/layout/PageHero'
import { mockInventory } from '@/data/mock'

function stockLevel(item: typeof mockInventory[0]) {
  const ratio = item.current_stock / item.min_stock
  const w = `${Math.min(100, (item.current_stock / item.reorder_quantity) * 100)}%`
  if (ratio <= 1)   return { label: 'Critical', textColor: 'text-red-600',    barColor: 'bg-red-500',    width: w }
  if (ratio <= 1.5) return { label: 'Low',      textColor: 'text-amber-600',  barColor: 'bg-amber-500',  width: w }
  return               { label: 'OK',        textColor: 'text-emerald-600', barColor: 'bg-emerald-500', width: w }
}

export function Inventory() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)

  const lowStock    = mockInventory.filter(i => i.current_stock <= i.min_stock)
  const criticalStock = mockInventory.filter(i => i.current_stock < i.min_stock)
  const totalValue  = mockInventory.reduce((s, i) => s + i.current_stock * i.unit_cost, 0)
  const suppliers   = [...new Set(mockInventory.map(i => i.supplier))]
  const categories  = [...new Set(mockInventory.map(i => i.category))]

  const filtered = mockInventory.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.category.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'all' || i.category === categoryFilter
    return matchSearch && matchCat
  })

  /* Stock health by category */
  const catHealth = categories.map(cat => {
    const items = mockInventory.filter(i => i.category === cat)
    const okCount = items.filter(i => i.current_stock > i.min_stock * 1.5).length
    return { cat, total: items.length, ok: okCount, pct: Math.round((okCount / items.length) * 100) }
  })

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <PageHero
        title="Inventory"
        subtitle={`${mockInventory.length} items · AED ${totalValue.toLocaleString()} stock value · ${lowStock.length} items low`}
        statusChip={criticalStock.length > 0 ? `${criticalStock.length} Critical` : 'Stocked'}
        actionLabel="Add Item"
        onAction={() => setShowModal(true)}
        searchPlaceholder="Search inventory…"
      />

      {/* ── Critical Alert Banner ── */}
      {criticalStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-[22px] px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-red-800">Critical Stock Alert</p>
            <p className="text-[12px] text-red-700 mt-0.5">
              {criticalStock.map(i => i.name).join(', ')} — below minimum threshold. Reorder immediately.
            </p>
          </div>
          <button className="shrink-0 bg-red-600 text-white text-[12px] font-semibold px-4 py-2 rounded-xl hover:bg-red-700 transition-colors">
            Reorder All
          </button>
        </div>
      )}

      {/* ── Low stock warning ── */}
      {lowStock.length > 0 && lowStock.length !== criticalStock.length && (
        <div className="bg-amber-50 border border-amber-200 rounded-[22px] px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-amber-600" />
          </div>
          <p className="text-[13px] text-amber-800">
            <span className="font-bold">{lowStock.length} item{lowStock.length > 1 ? 's' : ''}</span> below minimum stock: {lowStock.map(i => i.name).join(', ')}
          </p>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Items',   value: mockInventory.length,              sub: 'All categories', icon: Boxes,     iconBg: 'bg-blue-50',    iconColor: 'text-blue-600',    delta: '+2',   deltaUp: true  },
          { label: 'Low Stock',     value: lowStock.length,                   sub: 'Need reorder',   icon: AlertTriangle, iconBg: 'bg-amber-50', iconColor: 'text-amber-600', delta: lowStock.length > 0 ? '!' : 'OK', deltaUp: lowStock.length === 0 },
          { label: 'Critical',      value: criticalStock.length,              sub: 'Below minimum',  icon: RefreshCw, iconBg: 'bg-red-50',     iconColor: 'text-red-600',     delta: criticalStock.length > 0 ? '!!' : 'OK', deltaUp: criticalStock.length === 0 },
          { label: 'Stock Value',   value: `AED ${(totalValue/1000).toFixed(1)}k`, sub: 'Total inventory', icon: DollarSign, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', delta: '+3%', deltaUp: true },
          { label: 'Suppliers',     value: suppliers.length,                  sub: 'Active vendors', icon: Truck,     iconBg: 'bg-purple-50',  iconColor: 'text-purple-600',  delta: 'Active', deltaUp: true },
          { label: 'Categories',    value: categories.length,                 sub: 'Item types',     icon: BarChart3, iconBg: 'bg-slate-100',  iconColor: 'text-slate-600',   delta: 'All',  deltaUp: true  },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-[24px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5 hover:shadow-[0_8px_30px_rgba(15,23,42,0.10)] transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-2xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon size={18} className={card.iconColor} />
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${card.deltaUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {card.delta}
              </span>
            </div>
            <p className="text-2xl font-bold text-[#111827] tracking-tight">{card.value}</p>
            <p className="text-[12px] font-semibold text-[#111827] mt-1">{card.label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Main: Table + Sidebar ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: Filters + Table ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Toolbar */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] px-5 py-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search items or categories…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full text-[13px] pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 focus:bg-white placeholder-slate-400 transition-colors"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="text-[13px] px-3.5 py-2.5 bg-[#f8fafc] border border-[#E4E8EC] rounded-xl focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
              >
                <option value="all">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#E4E8EC] bg-slate-50">
                    {['Item', 'Category', 'Location', 'In Stock', 'Min', 'Stock Level', 'Unit Cost', 'Value', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.07em] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E8EC]">
                  {filtered.map(item => {
                    const level = stockLevel(item)
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                              <Package size={14} className="text-slate-500" />
                            </div>
                            <div>
                              <p className="text-[13px] font-bold text-[#111827]">{item.name}</p>
                              {item.supplier && <p className="text-[11px] text-slate-400">{item.supplier}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{item.category}</span>
                        </td>
                        <td className="px-4 py-3.5 text-[12px] text-slate-500">{item.location}</td>
                        <td className="px-4 py-3.5">
                          <span className={`text-[13px] font-bold ${level.textColor}`}>
                            {item.current_stock} {item.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-[12px] text-slate-400">{item.min_stock} {item.unit}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${level.barColor}`} style={{ width: level.width }} />
                            </div>
                            <span className={`text-[11px] font-semibold ${level.textColor}`}>{level.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-[12px] text-slate-600">AED {item.unit_cost.toLocaleString()}</td>
                        <td className="px-4 py-3.5">
                          <span className="text-[13px] font-bold text-[#111827]">AED {(item.current_stock * item.unit_cost).toLocaleString()}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          {item.current_stock <= item.min_stock && (
                            <button className="text-[11px] bg-amber-50 text-amber-700 hover:bg-amber-100 px-2.5 py-1 rounded-lg font-semibold transition-colors">
                              Reorder
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-5">

          {/* Inventory Health by Category */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Inventory Health</h3>
              <span className="text-[11px] text-slate-400">By category</span>
            </div>
            <div className="space-y-3">
              {catHealth.map(({ cat, total, ok, pct }) => (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-semibold text-slate-700">{cat}</span>
                    <span className="text-[11px] text-slate-500">{ok}/{total} OK</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Suppliers */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Suppliers</h3>
              <span className="bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                {suppliers.length} active
              </span>
            </div>
            <div className="space-y-3">
              {suppliers.map((supplier, idx) => {
                const supplierItems = mockInventory.filter(i => i.supplier === supplier)
                const value = supplierItems.reduce((s, i) => s + i.current_stock * i.unit_cost, 0)
                return (
                  <div key={supplier} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-[#E4E8EC]">
                    <div>
                      <p className="text-[12px] font-bold text-[#111827]">{supplier}</p>
                      <p className="text-[11px] text-slate-500">{supplierItems.length} items</p>
                    </div>
                    <span className="text-[12px] font-bold text-[#111827]">AED {value.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Restock Alert */}
          <div className="bg-white rounded-[22px] border border-[#E4E8EC] shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Restock Queue</h3>
              {lowStock.length > 0 && (
                <span className="bg-amber-50 text-amber-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {lowStock.length}
                </span>
              )}
            </div>
            {lowStock.length > 0 ? (
              <div className="space-y-2.5">
                {lowStock.slice(0, 5).map(item => {
                  const level = stockLevel(item)
                  return (
                    <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl border ${item.current_stock < item.min_stock ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div>
                        <p className="text-[12px] font-bold text-[#111827]">{item.name}</p>
                        <p className={`text-[11px] font-medium mt-0.5 ${level.textColor}`}>
                          {item.current_stock} / {item.min_stock} {item.unit}
                        </p>
                      </div>
                      <span className={`text-[11px] font-bold ${level.textColor} shrink-0 ml-2`}>
                        {level.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-[13px] text-slate-500">All items are well stocked</p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Add Item Modal ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Inventory Item" size="md">
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); setShowModal(false) }}>
          <Input label="Item Name" placeholder="e.g. All-Purpose Cleaner" />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Category">
              <option>Chemicals</option>
              <option>Equipment</option>
              <option>PPE</option>
              <option>Consumables</option>
            </Select>
            <Input label="Unit" placeholder="e.g. Litres, Pieces, Boxes" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Current Stock" type="number" placeholder="0" />
            <Input label="Min Stock" type="number" placeholder="0" />
            <Input label="Reorder Qty" type="number" placeholder="0" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Unit Cost (AED)" type="number" placeholder="0.00" />
            <Select label="Location">
              <option>Main Storeroom</option>
              <option>Van 1</option>
              <option>Van 2</option>
              <option>Van 3</option>
            </Select>
          </div>
          <Input label="Supplier" placeholder="Supplier name" />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" className="flex-1">Add Item</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
