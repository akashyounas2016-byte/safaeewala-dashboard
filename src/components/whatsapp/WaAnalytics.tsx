import { useEffect, useState } from 'react'
import { MessageCircle, ArrowDownLeft, ArrowUpRight, Timer, CheckCheck, Eye, Bot, AlertCircle, Loader2, BarChart3 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { KpiCard, Widget } from '@/components/ui/KpiCard'
import { notify } from '@/lib/notify'
import { loadMessagesSince, waAnalytics } from '@/lib/whatsappModules'

/** R-WA-02 Analytics: from the stored messages only — nothing estimated */
export function WaAnalytics() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<ReturnType<typeof waAnalytics> | null>(null)

  useEffect(() => {
    let alive = true
    setData(null)
    const since = new Date(Date.now() - days * 86400000).toISOString()
    loadMessagesSince(since).then(m => { if (alive) setData(waAnalytics(m, days)) }).catch(e => { notify.error((e as Error).message); if (alive) setData(waAnalytics([], days)) })
    return () => { alive = false }
  }, [days])

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[7, 30, 90].map(d => (
          <button key={d} type="button" onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-full text-[12px] font-bold border cursor-pointer ${days === d ? 'bg-emerald-600 text-white border-emerald-600' : 'border-[#E2E5E0] text-slate-600 bg-white'}`}>Last {d} days</button>
        ))}
      </div>
      {!data ? <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <KpiCard label="Chats" value={data.chats} sub="with a message in the period" icon={MessageCircle} labelColor="text-emerald-700" iconSolid="bg-[#059669] shadow-emerald-500/25" />
            <KpiCard label="Received" value={data.inbound} sub="client messages" icon={ArrowDownLeft} labelColor="text-sky-700" iconSolid="bg-[#0284c7] shadow-sky-500/25" />
            <KpiCard label="Sent" value={data.outbound} sub={`${data.auto} automatic`} icon={ArrowUpRight} labelColor="text-violet-700" iconSolid="bg-[#7c3aed] shadow-violet-500/25" />
            <KpiCard label="Reply time" value={data.medianReplyMin === null ? '—' : data.medianReplyMin < 60 ? `${data.medianReplyMin} min` : `${(data.medianReplyMin / 60).toFixed(1)} h`} sub="median, team replies" icon={Timer} labelColor="text-amber-700" iconSolid="bg-[#d97706] shadow-amber-500/25" />
            <KpiCard label="Waiting for a reply" value={data.unanswered} sub="chats, last word is the client's" icon={AlertCircle} labelColor="text-red-600" iconSolid="bg-[#dc2626] shadow-red-500/25" chipTone={data.unanswered ? 'warn' : 'plain'} />
            <KpiCard label="Delivered" value={data.deliveredPct === null ? '—' : `${data.deliveredPct}%`} sub="of messages sent" icon={CheckCheck} labelColor="text-emerald-700" iconSolid="bg-[#059669] shadow-emerald-500/25" />
            <KpiCard label="Read" value={data.readPct === null ? '—' : `${data.readPct}%`} sub="blue ticks" icon={Eye} labelColor="text-sky-700" iconSolid="bg-[#0284c7] shadow-sky-500/25" />
            <KpiCard label="Failed" value={data.failed} sub="not delivered" icon={AlertCircle} labelColor="text-red-600" iconSolid="bg-[#dc2626] shadow-red-500/25" />
            <KpiCard label="Automatic replies" value={data.auto} sub="welcome, away, keyword" icon={Bot} labelColor="text-violet-700" iconSolid="bg-[#7c3aed] shadow-violet-500/25" />
          </div>
          <Widget title="Messages per day" note="Dubai time" icon={BarChart3}>
            <div className="h-[280px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series.map(s => ({ ...s, day: s.day.slice(5) }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0EE" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="in" name="Received" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="out" name="Sent" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Widget>
        </>
      )}
    </div>
  )
}
