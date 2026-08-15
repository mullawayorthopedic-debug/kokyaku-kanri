'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { getClinicId } from '@/lib/clinic'

interface MonthRow {
  yearMonth: string
  label: string
  costSeitai: number
  costDiet: number
  costTotal: number
  countSeitai: number
  countDiet: number
  countTotal: number
  cpaSeitai: number
  cpaDiet: number
  cpaTotal: number
}

function fmtY(n: number) { return n === 0 ? '-' : '¥' + n.toLocaleString() }
function fmtN(n: number) { return n === 0 ? '-' : n.toLocaleString() }
function isLineChannel(channel: string) { return channel.includes('LINE') }
function isDietChannel(channel: string) { return channel.includes('ダイエット') }

export default function LineCpaPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [rows, setRows] = useState<MonthRow[]>([])
  const [hasLineChannel, setHasLineChannel] = useState(true)
  const [loading, setLoading] = useState(true)

  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const { data: channels } = await supabase
        .from('cm_ad_channels')
        .select('name')
        .eq('clinic_id', clinicId)
      setHasLineChannel(!!channels?.some(c => isLineChannel(c.name || '')))

      const { data: adCosts } = await supabase
        .from('cm_ad_costs')
        .select('month, channel, cost')
        .eq('clinic_id', clinicId)
        .gte('month', selectedYear + '-01')
        .lte('month', selectedYear + '-12')

      const { data: inquiries } = await supabase
        .from('cm_daily_inquiries')
        .select('date, channel, category, inquiries')
        .eq('clinic_id', clinicId)
        .gte('date', selectedYear + '-01-01')
        .lte('date', selectedYear + '-12-31')

      const costByMonth: Record<string, { seitai: number; diet: number }> = {}
      adCosts?.forEach(ac => {
        const ch = ac.channel || ''
        if (!isLineChannel(ch)) return
        if (!costByMonth[ac.month]) costByMonth[ac.month] = { seitai: 0, diet: 0 }
        if (isDietChannel(ch)) costByMonth[ac.month].diet += ac.cost || 0
        else costByMonth[ac.month].seitai += ac.cost || 0
      })

      const countByMonth: Record<string, { seitai: number; diet: number }> = {}
      inquiries?.forEach(row => {
        const raw = row.channel || ''
        const pipeIdx = raw.indexOf('|')
        const chName = pipeIdx >= 0 ? raw.slice(0, pipeIdx) : raw
        if (!isLineChannel(chName)) return
        const m = row.date.slice(0, 7)
        if (!countByMonth[m]) countByMonth[m] = { seitai: 0, diet: 0 }
        if (row.category === 'seitai') countByMonth[m].seitai += row.inquiries || 0
        else if (row.category === 'diet') countByMonth[m].diet += row.inquiries || 0
      })

      const result: MonthRow[] = []
      for (let m = 1; m <= 12; m++) {
        const ym = `${selectedYear}-${String(m).padStart(2, '0')}`
        const label = `${selectedYear}年${String(m).padStart(2, '0')}月`
        const cost = costByMonth[ym] || { seitai: 0, diet: 0 }
        const count = countByMonth[ym] || { seitai: 0, diet: 0 }
        const costTotal = cost.seitai + cost.diet
        const countTotal = count.seitai + count.diet
        result.push({
          yearMonth: ym, label,
          costSeitai: cost.seitai, costDiet: cost.diet, costTotal,
          countSeitai: count.seitai, countDiet: count.diet, countTotal,
          cpaSeitai: count.seitai > 0 ? Math.round(cost.seitai / count.seitai) : 0,
          cpaDiet: count.diet > 0 ? Math.round(cost.diet / count.diet) : 0,
          cpaTotal: countTotal > 0 ? Math.round(costTotal / countTotal) : 0,
        })
      }

      setRows(result)
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear])

  const totals = rows.reduce((acc, r) => ({
    costSeitai: acc.costSeitai + r.costSeitai,
    costDiet: acc.costDiet + r.costDiet,
    costTotal: acc.costTotal + r.costTotal,
    countSeitai: acc.countSeitai + r.countSeitai,
    countDiet: acc.countDiet + r.countDiet,
    countTotal: acc.countTotal + r.countTotal,
  }), { costSeitai: 0, costDiet: 0, costTotal: 0, countSeitai: 0, countDiet: 0, countTotal: 0 })
  const totalCpaSeitai = totals.countSeitai > 0 ? Math.round(totals.costSeitai / totals.countSeitai) : 0
  const totalCpaDiet = totals.countDiet > 0 ? Math.round(totals.costDiet / totals.countDiet) : 0
  const totalCpaAll = totals.countTotal > 0 ? Math.round(totals.costTotal / totals.countTotal) : 0

  const hasAnyData = totals.costTotal > 0 || totals.countTotal > 0

  return (
    <AppShell>
      <div className="w-full px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tab.href === '/sales/line-cpa' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>{tab.label}</Link>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 text-lg">LINEリスト獲得CPA</h2>
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            {years.map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
        </div>

        {!hasLineChannel && (
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-100 text-sm text-gray-600 mb-4">
            <p className="font-medium text-orange-700 mb-1">📣 LINE媒体が未登録です</p>
            <p className="text-xs text-gray-500">マスター →「広告媒体」で「LINE登録（整体）」「LINE登録（ダイエット）」等を登録すると、ここで集計できるようになります。</p>
            <Link href="/master/ad-channels" className="inline-block mt-2 text-xs text-blue-600 hover:underline">広告媒体を登録する →</Link>
          </div>
        )}

        {/* 年間サマリカード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          <div className="bg-white rounded-xl shadow-sm p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold text-red-600">{fmtY(totals.costTotal)}</p>
            <p className="text-[10px] text-gray-500">年間LINE広告費</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 text-center">
            <p className="text-lg sm:text-2xl font-bold text-emerald-600">{fmtN(totals.countTotal)}<span className="text-xs">件</span></p>
            <p className="text-[10px] text-gray-500">年間LINE登録数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 text-center">
            <p className={`text-lg sm:text-2xl font-bold ${totalCpaAll === 0 ? 'text-gray-400' : totalCpaAll <= 3000 ? 'text-green-600' : totalCpaAll <= 8000 ? 'text-yellow-600' : 'text-red-500'}`}>
              {fmtY(totalCpaAll)}
            </p>
            <p className="text-[10px] text-gray-500">平均CPA（1件あたり）</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 text-center">
            <p className="text-xs sm:text-sm font-bold text-gray-700">
              <span className="text-teal-600">{fmtY(totalCpaSeitai)}</span> / <span className="text-orange-500">{fmtY(totalCpaDiet)}</span>
            </p>
            <p className="text-[10px] text-gray-500">区分別CPA（整体/ダイエット）</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">読み込み中...</div>
        ) : !hasAnyData ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-gray-400 mb-3">この年のLINE広告費・登録データがありません</p>
            <div className="flex items-center justify-center gap-4 text-sm">
              <Link href="/sales/ad-costs" className="text-blue-600 hover:underline">広告費入力ページで登録 →</Link>
              <Link href="/" className="text-blue-600 hover:underline">ホームで問い合わせ入力 →</Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#14252A] text-white text-xs">
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap border-r border-[#2a3f45]">月</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-r border-[#2a3f45]">LINE広告費<br/><span className="font-normal text-gray-400 text-[10px]">整体/ダイエット</span></th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap border-r border-[#2a3f45]">LINE登録数<br/><span className="font-normal text-gray-400 text-[10px]">整体/ダイエット</span></th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">CPA(整体)</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">CPA(ダイエット)</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">CPA(合計)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const hasData = row.costTotal > 0 || row.countTotal > 0
                    return (
                      <tr key={row.yearMonth}
                        className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${!hasData ? 'opacity-40' : ''}`}>
                        <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap border-r border-gray-100">{row.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums border-r border-gray-100">
                          <span className="text-red-500 font-medium">{fmtY(row.costTotal)}</span>
                          {row.costTotal > 0 && <div className="text-[10px] text-gray-400 mt-0.5"><span className="text-teal-600">{row.costSeitai.toLocaleString()}</span>/<span className="text-orange-500">{row.costDiet.toLocaleString()}</span></div>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums border-r border-gray-100">
                          <span className="text-emerald-600 font-medium">{fmtN(row.countTotal)}件</span>
                          {row.countTotal > 0 && <div className="text-[10px] text-gray-400 mt-0.5"><span className="text-teal-600">{row.countSeitai}</span>/<span className="text-orange-500">{row.countDiet}</span></div>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-teal-700">{fmtY(row.cpaSeitai)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-orange-600">{fmtY(row.cpaDiet)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">{fmtY(row.cpaTotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#14252A] text-white text-xs font-bold border-t-2">
                    <td className="px-3 py-2 border-r border-[#2a3f45]">年間合計</td>
                    <td className="px-3 py-2 text-right border-r border-[#2a3f45]">{fmtY(totals.costTotal)}</td>
                    <td className="px-3 py-2 text-right border-r border-[#2a3f45]">{fmtN(totals.countTotal)}件</td>
                    <td className="px-3 py-2 text-right">{fmtY(totalCpaSeitai)}</td>
                    <td className="px-3 py-2 text-right">{fmtY(totalCpaDiet)}</td>
                    <td className="px-3 py-2 text-right">{fmtY(totalCpaAll)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          ※ LINE広告費は「広告費入力」ページで媒体名にLINEを含むもの（例: LINE登録（整体）／LINE登録（ダイエット）)の月次コストを入力してください。<br/>
          ※ LINE登録数はホーム画面の「問い合わせ入力」で媒体にLINEを含むものを選んで記録した件数です。CPA = LINE広告費 ÷ LINE登録数。
        </p>
      </div>
    </AppShell>
  )
}
