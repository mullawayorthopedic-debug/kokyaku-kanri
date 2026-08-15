import Link from 'next/link'

const sections = [
  { title: '1. 基本情報マスター管理', icon: '🏥', items: [
    { href: '/master/facility', label: '施設基本情報', desc: '院名・住所・営業時間', icon: '🏢' },
    { href: '/master/regular-holidays', label: '定休日設定', desc: '曜日ごとの定休日', icon: '📅' },
    { href: '/master/irregular-holidays', label: '不定休日設定', desc: '臨時休業・祝日', icon: '🗓️' },
    { href: '/master/display-columns', label: '顧客一覧表示項目', desc: '一覧に表示する列', icon: '📊' },
  ]},
  { title: '2. 顧客関連マスター管理', icon: '👥', items: [
    { href: '/master/visit-motives', label: '来店動機', desc: 'Google検索・紹介等', icon: '🔍' },
    { href: '/master/occupations', label: '職業', desc: '会社員・自営業等', icon: '💼' },
    { href: '/master/customer-categories', label: '顧客区分', desc: '新規・リピーター・VIP等', icon: '🏷️' },
    { href: '/master/symptoms', label: '症状', desc: '腰痛・肩こり等', icon: '🩺' },
    { href: '/master/ad-channels', label: '広告媒体', desc: 'インスタ・LINE・PPC等（問い合わせ入力で使用）', icon: '📣' },
  ]},
  { title: '3. メニューマスター管理', icon: '📋', items: [
    { href: '/master/menu-categories', label: '分類', desc: 'メニューのカテゴリ', icon: '📁' },
    { href: '/master/base-menus', label: '基本メニュー', desc: '施術メニュー・料金', icon: '💆' },
    { href: '/master/option-menus', label: 'オプションメニュー', desc: '追加オプション', icon: '➕' },
  ]},
  { title: '4. その他マスター管理', icon: '⚙️', items: [
    { href: '/master/staff', label: '使用者管理', desc: 'スタッフ情報', icon: '👤' },
  ]},
]

export default function MasterPage() {
  return (
    <div className="space-y-5">
      {sections.map(s => (
        <div key={s.title} className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="font-bold text-gray-800 text-sm mb-4 border-b pb-2.5 flex items-center gap-2">
            <span className="text-lg">{s.icon}</span>
            {s.title}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {s.items.map(item => (
              <Link key={item.href} href={item.href} className="border border-gray-200 rounded-xl p-4 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm transition-all group">
                <div className="flex items-center gap-3">
                  <span className="text-xl bg-gray-50 rounded-lg w-10 h-10 flex items-center justify-center shrink-0 group-hover:bg-blue-50 transition-colors">{item.icon}</span>
                  <div>
                    <p className="font-medium text-sm text-gray-800">{item.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
