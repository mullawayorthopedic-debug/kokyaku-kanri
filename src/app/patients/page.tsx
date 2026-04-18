'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'
import { fetchAllSlips } from '@/lib/fetchAll'
import type { Patient } from '@/lib/types'
import { getToday } from '@/lib/dateUtils'

interface PatientWithStats extends Patient {
  calcVisitCount: number
  calcLtv: number
  calcLastVisit: string | null
  calcDaysSince: number | null
}

type SortKey = 'chart_no' | 'name' | 'gender' | 'chief_complaint' | 'referral_source' | 'line_count' | 'ltv' | 'last_visit' | 'days_since'

export default function PatientsPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [patients, setPatients] = useState<PatientWithStats[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [genderFilter, setGenderFilter] = useState('')
  const [referralFilter, setReferralFilter] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('chart_no')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    const load = async () => {
      // 患者データ取得
      let query = supabase.from('cm_patients').select('*').eq('clinic_id', clinicId).order('updated_at', { ascending: false })
      if (statusFilter) query = query.eq('status', statusFilter)
      if (genderFilter) query = query.eq('gender', genderFilter)
      if (referralFilter) query = query.eq('referral_source', referralFilter)
      const { data: patientsData } = await query

      // cm_slipsから全件取得してLTV・来院数をリアルタイム計算
      const slips = await fetchAllSlips(supabase, 'patient_id, visit_date, total_price')

      // 患者ごとに集計
      const statsMap: Record<string, { count: number; revenue: number; lastVisit: string }> = {}
      slips.forEach((s: { patient_id: string; visit_date: string; total_price: number }) => {
        if (!s.patient_id) return
        if (!statsMap[s.patient_id]) {
          statsMap[s.patient_id] = { count: 0, revenue: 0, lastVisit: s.visit_date }
        }
        statsMap[s.patient_id].count++
        statsMap[s.patient_id].revenue += s.total_price || 0
        if (s.visit_date > statsMap[s.patient_id].lastVisit) {
          statsMap[s.patient_id].lastVisit = s.visit_date
        }
      })

      const now = Date.now()
      const merged: PatientWithStats[] = (patientsData || []).map(p => {
        const st = statsMap[p.id]
        const slipRevenue = st?.revenue || 0
        const lastVisit = st?.lastVisit || p.last_visit_date || null
        const daysSince = lastVisit ? Math.floor((now - new Date(lastVisit).getTime()) / (24 * 60 * 60 * 1000)) : null
        // cm_patients.ltv（CSSインポート値）とスリップ計算値の大きい方を使用
        const ltv = Math.max(p.ltv || 0, slipRevenue)
        const visitCount = (p.ltv || 0) > slipRevenue ? (p.visit_count || st?.count || 0) : (st?.count || p.visit_count || 0)
        return {
          ...p,
          calcVisitCount: visitCount,
          calcLtv: ltv,
          calcLastVisit: lastVisit,
          calcDaysSince: daysSince,
        }
      })

      setPatients(merged)
      setLoading(false)
    }
    load()
  }, [statusFilter, genderFilter, referralFilter])

  // ソートの切り替え
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(key === 'name') // 名前は昇順、それ以外は降順がデフォルト
    }
  }

  const SortHeader = ({ label, sortId, className = '' }: { label: string; sortId: SortKey; className?: string }) => (
    <th
      className={`px-3 py-2.5 text-xs text-gray-500 font-semibold cursor-pointer hover:bg-gray-100 select-none ${className}`}
      onClick={() => handleSort(sortId)}
    >
      {label}
      {sortKey === sortId && (
        <span className="ml-1">{sortAsc ? '▲' : '▼'}</span>
      )}
    </th>
  )

  const filtered = useMemo(() => {
    let list = patients
    if (search) {
      list = list.filter(p =>
        p.name.includes(search) ||
        p.furigana?.includes(search) ||
        p.phone?.includes(search) ||
        p.chief_complaint?.includes(search) ||
        p.address?.includes(search)
      )
    }

    // ソート
    list = [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'chart_no':
          cmp = (a.chart_no || 0) - (b.chart_no || 0)
          break
        case 'name':
          cmp = (a.furigana || a.name).localeCompare(b.furigana || b.name, 'ja')
          break
        case 'gender':
          cmp = (a.gender || '').localeCompare(b.gender || '')
          break
        case 'chief_complaint':
          cmp = (a.chief_complaint || '').localeCompare(b.chief_complaint || '', 'ja')
          break
        case 'referral_source':
          cmp = (a.referral_source || '').localeCompare(b.referral_source || '', 'ja')
          break
        case 'line_count':
          cmp = (a.line_count || 0) - (b.line_count || 0)
          break
        case 'ltv':
          cmp = a.calcLtv - b.calcLtv
          break
        case 'last_visit':
          cmp = (a.calcLastVisit || '').localeCompare(b.calcLastVisit || '')
          break
        case 'days_since':
          cmp = (a.calcDaysSince ?? 99999) - (b.calcDaysSince ?? 99999)
          break
      }
      return sortAsc ? cmp : -cmp
    })

    return list
  }, [patients, search, sortKey, sortAsc])

  const downloadFile = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const buildCsv = (headers: string[], rows: string[][]) => {
    const bom = '\uFEFF'
    return bom + [headers.join(','), ...rows.map(r => r.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','))].join('\n')
  }

  const downloadCsv = () => {
    const headers = ['氏名', 'ふりがな', '性別', '生年月日', '電話番号', 'メール', '住所', '職業', '来院経路', '主訴', 'ステータス', 'LTV', '来院数', '最終来院']
    const rows = filtered.map(p => [
      p.name, p.furigana, p.gender, p.birth_date || '', p.phone, p.email,
      `${p.prefecture || ''}${p.city || ''}${p.address || ''}${p.building || ''}`,
      p.occupation, p.referral_source, p.chief_complaint,
      p.status === 'active' ? '通院中' : p.status === 'completed' ? '卒業' : '休止',
      String(p.calcLtv), String(p.calcVisitCount), p.calcLastVisit || ''
    ])
    downloadFile(buildCsv(headers, rows), `患者一覧_${getToday()}.csv`)
    setShowCsvModal(false)
  }

  const downloadDmCsv = () => {
    const dmPatients = filtered.filter(p =>
      p.is_direct_mail !== false && (p.prefecture || p.city || p.address)
    )
    const headers = ['氏名', 'フリガナ', '敬称', '郵便番号', '都道府県', '市区町村', '番地', '建物名', '電話番号']
    const rows = dmPatients.map(p => [
      p.name, p.furigana || '', '様',
      (p.zipcode || '').replace(/[^\d-]/g, ''),
      p.prefecture || '', p.city || '', p.address || '', p.building || '', p.phone || '',
    ])
    downloadFile(buildCsv(headers, rows), `DM宛名_${getToday()}.csv`)
    setShowCsvModal(false)
  }

  const uniqueReferrals = [...new Set(patients.map(p => p.referral_source).filter(Boolean))]

  // Re:QUARTETの顧客No.（chart_no）を7桁ゼロ埋めで表示
  const chartNo = (p: PatientWithStats) =>
    p.chart_no ? String(p.chart_no).padStart(7, '0') : '-'

  return (
    <AppShell>
      <Header title="患者一覧" />
      <div className="px-4 py-4 max-w-5xl mx-auto">
        {/* アクションバー */}
        <div className="bg-white rounded-xl shadow-sm p-3 mb-4 flex flex-wrap gap-2 items-center">
          <Link href="/patients/new" className="text-white rounded-lg px-4 py-2.5 text-center font-bold text-sm shadow-sm hover:opacity-90" style={{ background: '#14252A' }}>
            + 新規患者登録
          </Link>
          <Link href="/patients/import" className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300">
            📥 CSVインポート
          </Link>
          <Link href="/patients/bulk-edit" className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300">
            📝 一括編集
          </Link>
          <button onClick={() => setShowCsvModal(true)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300">
            📤 CSV出力
          </button>
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300">
            🔍 {showAdvanced ? '検索を閉じる' : '詳細検索'}
          </button>
        </div>

        {/* 基本検索 */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="名前・電話・主訴・住所で検索"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A] bg-white shadow-sm"
            />
          </div>
          <div className="flex gap-1 items-center">
            {[
              { value: '', label: '全て' },
              { value: 'active', label: '通院中' },
              { value: 'inactive', label: '休止' },
              { value: 'completed', label: '卒業' },
            ].map(s => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  statusFilter === s.value
                    ? 'bg-[#14252A] text-white shadow-sm'
                    : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 詳細検索 */}
        {showAdvanced && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">性別</label>
              <select value={genderFilter} onChange={e => setGenderFilter(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                <option value="">全て</option>
                <option value="男性">男性</option>
                <option value="女性">女性</option>
                <option value="その他">その他</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">来院経路</label>
              <select value={referralFilter} onChange={e => setReferralFilter(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                <option value="">全て</option>
                {uniqueReferrals.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex items-end">
              <button onClick={() => { setGenderFilter(''); setReferralFilter(''); setStatusFilter(''); setSearch('') }}
                className="px-4 py-1.5 text-xs text-red-500 border border-red-200 rounded hover:bg-red-50">
                フィルタをリセット
              </button>
            </div>
          </div>
        )}

        {/* モバイルソート */}
        <div className="md:hidden flex gap-1 mb-3 overflow-x-auto pb-1">
          <span className="text-xs text-gray-400 pt-1.5 shrink-0">並替:</span>
          {([
            { key: 'chart_no' as SortKey, label: 'カルテ番号' },
            { key: 'name' as SortKey, label: '氏名' },
            { key: 'ltv' as SortKey, label: 'LTV' },
            { key: 'days_since' as SortKey, label: '経過' },
            { key: 'last_visit' as SortKey, label: '最終来院' },
            { key: 'referral_source' as SortKey, label: '経路' },
          ]).map(s => (
            <button key={s.key} onClick={() => handleSort(s.key)}
              className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                sortKey === s.key ? 'bg-[#14252A] text-white' : 'bg-gray-100 text-gray-600'
              }`}>
              {s.label}{sortKey === s.key ? (sortAsc ? '▲' : '▼') : ''}
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-500 mb-2">{filtered.length}件の患者</p>

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 text-center py-8">患者が見つかりません</p>
        ) : (
          <>
            {/* PC: テーブル（ソート対応ヘッダー） */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <SortHeader label="カルテ番号" sortId="chart_no" className="text-left" />
                    <SortHeader label="氏名" sortId="name" className="text-left" />
                    <SortHeader label="性別" sortId="gender" className="text-left" />
                    <SortHeader label="症状" sortId="chief_complaint" className="text-left" />
                    <SortHeader label="来院経路" sortId="referral_source" className="text-left" />
                    <th className="px-3 py-2.5 text-xs text-gray-500 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('line_count')}>
                      LINE{sortKey === 'line_count' && <span className="ml-1">{sortAsc ? '▲' : '▼'}</span>}
                    </th>
                    <SortHeader label="LTV" sortId="ltv" className="text-right" />
                    <SortHeader label="最終来院" sortId="last_visit" className="text-left" />
                    <SortHeader label="経過" sortId="days_since" className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, idx) => (
                    <tr key={p.id} className={`border-b hover:bg-blue-50/40 cursor-pointer ${idx % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                      <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap font-mono">
                        {chartNo(p)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/patients/${p.id}`} className="text-blue-600 hover:underline font-medium">
                            {p.name}
                          </Link>
                          {p.customer_category === '整体' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold whitespace-nowrap">整体</span>
                          )}
                          {p.customer_category === 'ダイエット' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold whitespace-nowrap">ダイエット</span>
                          )}
                        </div>
                        {p.furigana && <p className="text-xs text-gray-400">{p.furigana}</p>}
                      </td>
                      <td className="px-3 py-3 text-xs">{p.gender}</td>
                      <td className="px-3 py-3 text-xs text-gray-600 truncate max-w-[120px]">{p.chief_complaint || '-'}</td>
                      <td className="px-3 py-3 text-xs">{p.referral_source || '-'}</td>
                      <td className="px-3 py-3 text-right text-xs">{p.line_count > 0 ? `${p.line_count}回` : '-'}</td>
                      <td className="px-3 py-3 text-right text-xs font-medium text-blue-600">
                        {p.calcLtv > 0 ? `${p.calcLtv.toLocaleString()}円` : '-'}
                      </td>
                      <td className="px-3 py-3 text-xs">{p.calcLastVisit || '-'}</td>
                      <td className="px-3 py-3 text-right text-xs">
                        {p.calcDaysSince !== null ? (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${p.calcDaysSince > 90 ? 'bg-red-50 text-red-600' : p.calcDaysSince > 30 ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'}`}>
                            {p.calcDaysSince}日
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            {/* モバイル: カード */}
            <div className="md:hidden space-y-2">
              {filtered.map(p => (
                <Link key={p.id} href={`/patients/${p.id}`} className={`block bg-white rounded-xl shadow-sm p-3.5 hover:shadow-md transition-shadow border-l-4 ${
                  p.status === 'active' ? 'border-l-green-500' :
                  p.status === 'completed' ? 'border-l-blue-500' :
                  'border-l-gray-300'
                }`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-800">{p.name}</p>
                        {p.customer_category === '整体' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold">整体</span>
                        )}
                        {p.customer_category === 'ダイエット' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">ダイエット</span>
                        )}
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          p.status === 'active' ? 'bg-green-50 text-green-700' :
                          p.status === 'completed' ? 'bg-blue-50 text-blue-700' :
                          'bg-gray-50 text-gray-500'
                        }`}>
                          {p.status === 'active' ? '通院中' : p.status === 'completed' ? '卒業' : '休止'}
                        </span>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        <span>{p.gender}</span>
                        {p.chief_complaint && <span className="truncate">{p.chief_complaint}</span>}
                      </div>
                    </div>
                    <div className="text-right ml-2 shrink-0">
                      <p className="text-xs font-bold text-blue-600">{p.calcLtv > 0 ? `${p.calcLtv.toLocaleString()}円` : '-'}</p>
                      <p className="text-xs text-gray-400">{p.calcVisitCount}回</p>
                      {p.calcDaysSince !== null && (
                        <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${p.calcDaysSince > 90 ? 'bg-red-50 text-red-600' : p.calcDaysSince > 30 ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'}`}>
                          {p.calcDaysSince}日前
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 mt-2 text-xs text-gray-400">
                    {p.referral_source && <span>{p.referral_source}</span>}
                    {p.line_count > 0 && <span>LINE:{p.line_count}回</span>}
                    {p.phone && <a className="text-blue-500 underline">TEL:{p.phone}</a>}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* CSV出力モーダル */}
        {showCsvModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCsvModal(false)}>
            <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-gray-800 mb-4">データ出力</h3>
              <div className="border border-gray-200 rounded-xl p-4 mb-3">
                <p className="font-bold text-sm text-gray-800 mb-1">患者データCSV</p>
                <p className="text-xs text-gray-500 mb-3">全項目を含む一覧データ（{filtered.length}件）</p>
                <button onClick={downloadCsv} className="w-full text-white py-2 rounded-lg text-sm font-bold" style={{ background: '#14252A' }}>
                  ダウンロード
                </button>
              </div>
              <div className="border border-orange-200 rounded-xl p-4 mb-3 bg-orange-50">
                <p className="font-bold text-sm text-gray-800 mb-1">はがき・DM印刷用CSV</p>
                <p className="text-xs text-gray-500 mb-1">宛名印刷に必要な項目のみ</p>
                <p className="text-xs text-gray-400 mb-3">
                  DM送付可＋住所ありの患者（{filtered.filter(p => p.is_direct_mail !== false && (p.prefecture || p.city || p.address)).length}件）
                </p>
                <button onClick={downloadDmCsv} className="w-full py-2 rounded-lg text-sm font-bold text-white bg-orange-500 hover:bg-orange-600">
                  はがき用CSVをダウンロード
                </button>
              </div>
              <button onClick={() => setShowCsvModal(false)} className="w-full py-2 border border-gray-300 rounded-lg text-sm text-gray-600">
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
