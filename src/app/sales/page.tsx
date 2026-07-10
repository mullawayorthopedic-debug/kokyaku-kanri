'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { getClinicId } from '@/lib/clinic'

interface DropoutPatient {
  id: string
  name: string
  status: string
  status_date: string | null
  customer_category: string | null
}

const menuCards = [
  { href: '/sales/daily-report', icon: '📅', title: '日報集計', desc: '日別売上・現金・クレジット・新規/リピート集計' },
  { href: '/sales/monthly-report', icon: '📆', title: '日計月計', desc: '月別売上の当年・前年比較' },
  { href: '/sales/revenue', icon: '💰', title: '売上集計', desc: '日別・月別・年別の売上分析' },
  { href: '/sales/slips', icon: '🧾', title: '伝票一覧', desc: '施術伝票の一覧と詳細' },
  { href: '/sales/ltv', icon: '📈', title: 'LTV分析', desc: '顧客生涯価値の分析' },
  { href: '/sales/repeat', icon: '🔄', title: 'リピート分析', desc: '新規・リピート比率の推移' },
  { href: '/sales/new-existing', icon: '👤', title: '新規/既存分析', desc: '新規・既存患者の比率推移' },
  { href: '/sales/roas', icon: '📣', title: 'ROAS分析', desc: '広告費用対効果の分析' },
  { href: '/sales/hourly', icon: '⏱', title: '時間単価', desc: '時間あたりの売上効率' },
  { href: '/sales/utilization', icon: '📊', title: '稼働率', desc: '予約枠の稼働状況' },
  { href: '/sales/cross', icon: '🔀', title: 'クロス集計', desc: '多角的な売上分析' },
  { href: '/sales/area-ltv', icon: '🗺', title: 'エリア分析', desc: 'エリア別のLTV分析' },
  { href: '/sales/map', icon: '📍', title: '地域分布', desc: '患者の地域分布マップ' },
  { href: '/sales/ad-costs', icon: '💳', title: '広告費入力', desc: '媒体別の広告費用管理' },
  { href: '/sales/churn', icon: '📋', title: '離脱・卒業', desc: '離脱・卒業患者の一覧と推移' },
  { href: '/visits/new', icon: '📝', title: '施術記録', desc: '施術内容・料金・次回予約の記録' },
  { href: '/visits/import', icon: '📥', title: '来院履歴CSV取込', desc: '他システムからの来院データ移行' },
]

export default function SalesPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const today = new Date()
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const monthStart = thisMonth + '-01'

  const [dropouts, setDropouts] = useState<DropoutPatient[]>([])
  const [loadingDropouts, setLoadingDropouts] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('cm_patients')
        .select('id, name, status, status_date, customer_category')
        .eq('clinic_id', clinicId)
        .in('status', ['inactive', 'completed'])
        .gte('status_date', monthStart)
        .order('status_date', { ascending: false })
      setDropouts(data || [])
      setLoadingDropouts(false)
    }
    load()
  }, [clinicId])

  const monthDropouts = dropouts.filter(p => p.status === 'inactive')
  const monthGraduations = dropouts.filter(p => p.status === 'completed')

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* タブ */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-2 border-b border-gray-200">
          {saleTabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                tab.href === '/sales' ? 'bg-[#14252A] text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {menuCards.map(card => (
            <Link key={card.href} href={card.href} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-all hover:-translate-y-0.5 group border border-gray-100">
              <div className="flex items-start gap-4">
                <div className="text-3xl bg-gray-50 rounded-xl w-14 h-14 flex items-center justify-center shrink-0 group-hover:bg-blue-50 transition-colors">{card.icon}</div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">{card.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{card.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* 当月の離脱・卒業リスト */}
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
              <span>📋</span> {thisMonth.replace('-', '年')}月の離脱・卒業
            </h2>
            <Link href="/sales/churn" className="text-xs text-blue-600 font-medium hover:text-blue-800">
              全期間を見る →
            </Link>
          </div>

          {loadingDropouts ? (
            <p className="text-gray-400 text-sm text-center py-6">読み込み中...</p>
          ) : dropouts.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">当月の離脱・卒業患者はいません</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 離脱 */}
              <div>
                <h3 className="font-bold text-xs text-red-700 mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500" /> 離脱（{monthDropouts.length}名）
                </h3>
                {monthDropouts.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">なし</p>
                ) : (
                  <div className="space-y-1.5">
                    {monthDropouts.map(p => (
                      <Link key={p.id} href={`/patients/${p.id}`}
                        className="block border border-red-100 rounded-lg p-2.5 bg-red-50/30 hover:bg-red-50">
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">{p.name}</p>
                            {p.customer_category && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                                p.customer_category === 'ダイエット' ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'
                              }`}>{p.customer_category}</span>
                            )}
                          </div>
                          {p.status_date && <span className="text-[10px] text-red-500 shrink-0">{p.status_date}</span>}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* 卒業 */}
              <div>
                <h3 className="font-bold text-xs text-blue-700 mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> 卒業（{monthGraduations.length}名）
                </h3>
                {monthGraduations.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">なし</p>
                ) : (
                  <div className="space-y-1.5">
                    {monthGraduations.map(p => (
                      <Link key={p.id} href={`/patients/${p.id}`}
                        className="block border border-blue-100 rounded-lg p-2.5 bg-blue-50/30 hover:bg-blue-50">
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">{p.name}</p>
                            {p.customer_category && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                                p.customer_category === 'ダイエット' ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'
                              }`}>{p.customer_category}</span>
                            )}
                          </div>
                          {p.status_date && <span className="text-[10px] text-blue-500 shrink-0">{p.status_date}</span>}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
