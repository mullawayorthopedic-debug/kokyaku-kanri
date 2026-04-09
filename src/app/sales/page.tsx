'use client'

import Link from 'next/link'
import AppShell from '@/components/AppShell'

const saleTabs = [
  { href: '/sales', label: '概要' },
  { href: '/sales/daily-report', label: '日報集計' },
  { href: '/sales/monthly-report', label: '日計月計' },
  { href: '/sales/revenue', label: '売上集計' },
  { href: '/sales/slips', label: '伝票一覧' },
  { href: '/sales/ltv', label: 'LTV' },
  { href: '/sales/repeat', label: 'リピート' },
  { href: '/sales/hourly', label: '時間単価' },
  { href: '/sales/utilization', label: '稼働率' },
  { href: '/sales/cross', label: 'クロス集計' },
]

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
  { href: '/visits/new', icon: '📝', title: '施術記録', desc: '施術内容・料金・次回予約の記録' },
  { href: '/visits/import', icon: '📥', title: '来院履歴CSV取込', desc: '他システムからの来院データ移行' },
]

export default function SalesPage() {
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>
    </AppShell>
  )
}
