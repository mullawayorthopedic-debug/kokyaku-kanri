'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'
import { getClinicIdClient } from '@/lib/clinic'

interface MonthlyData {
  month: string
  newRevenue: number
  existingRevenue: number
  totalRevenue: number
  newCount: number
  existingCount: number
  newRatio: number
  newSeitai: number
  newDiet: number
  existSeitai: number
  existDiet: number
  existRevSeitai: number
  existRevDiet: number
}

interface NewPatientDetail {
  pid: string
  name: string
  revenue: number
  category: string
  city: string
  prefecture: string
  gender: string
  age: number | null
  visitMotive: string
  chiefComplaint: string
  referralSource: string
  initialCourse: string
}

interface PatientInfo {
  id: string
  name: string
  furigana: string
  gender: string
  birth_date: string
  phone: string
  email: string
  zipcode: string
  prefecture: string
  city: string
  address: string
  referral_source: string
  chief_complaint: string
  customer_category: string
  visit_motive: string
  status: string
  chart_no: number | null
}

function calcAge(birthDate: string): number | null {
  if (!birthDate) return null
  const today = new Date()
  const birth = new Date(birthDate)
  if (isNaN(birth.getTime())) return null
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export default function NewExistingPage() {
  const supabase = createClient()
  const [data, setData] = useState<MonthlyData[]>([])
  const [loading, setLoading] = useState(true)
  const [monthDetails, setMonthDetails] = useState<Record<string, NewPatientDetail[]>>({})
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [patientModal, setPatientModal] = useState<PatientInfo | null>(null)
  const [patientLoading, setPatientLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const slips = await fetchAllSlips(supabase, 'patient_id, visit_date, total_price, menu_name') as {
        patient_id: string; visit_date: string; total_price: number; menu_name: string
      }[]

      if (!slips || slips.length === 0) { setLoading(false); return }

      const clinicId = await getClinicIdClient()
      const { data: patientData } = await supabase
        .from('cm_patients')
        .select('id, name, customer_category, gender, birth_date, city, prefecture, chief_complaint, referral_source, visit_motive')
        .eq('clinic_id', clinicId)

      const patientTypeMap: Record<string, string> = {}
      const patientNameMap: Record<string, string> = {}
      const patientExtraMap: Record<string, {
        gender: string; birth_date: string; city: string; prefecture: string;
        chief_complaint: string; referral_source: string; visit_motive: string;
      }> = {}

      patientData?.forEach((p: {
        id: string; name: string; customer_category: string; gender: string; birth_date: string;
        city: string; prefecture: string; chief_complaint: string; referral_source: string; visit_motive: string;
      }) => {
        patientTypeMap[p.id] = p.customer_category || ''
        patientNameMap[p.id] = p.name || ''
        patientExtraMap[p.id] = {
          gender: p.gender || '',
          birth_date: p.birth_date || '',
          city: p.city || '',
          prefecture: p.prefecture || '',
          chief_complaint: p.chief_complaint || '',
          referral_source: p.referral_source || '',
          visit_motive: p.visit_motive || '',
        }
      })

      // 初回来院月と初回コースを追跡
      const firstVisitMonth: Record<string, string> = {}
      const firstVisitMenu: Record<string, string> = {}
      slips.forEach(s => {
        if (!s.patient_id) return
        const month = s.visit_date.slice(0, 7)
        if (!firstVisitMonth[s.patient_id] || month < firstVisitMonth[s.patient_id]) {
          firstVisitMonth[s.patient_id] = month
          firstVisitMenu[s.patient_id] = s.menu_name || ''
        }
      })

      const monthMap: Record<string, {
        newRev: number, existRev: number, newPids: Set<string>, existPids: Set<string>,
        newSeitaiPids: Set<string>, newDietPids: Set<string>,
        existSeitaiPids: Set<string>, existDietPids: Set<string>,
        existRevSeitai: number, existRevDiet: number,
        newPidRev: Record<string, number>,
      }> = {}

      slips.forEach(s => {
        const month = s.visit_date.slice(0, 7)
        if (!monthMap[month]) monthMap[month] = {
          newRev: 0, existRev: 0,
          newPids: new Set(), existPids: new Set(),
          newSeitaiPids: new Set(), newDietPids: new Set(),
          existSeitaiPids: new Set(), existDietPids: new Set(),
          existRevSeitai: 0, existRevDiet: 0,
          newPidRev: {},
        }
        const amount = s.total_price || 0
        const ptype = patientTypeMap[s.patient_id] || ''

        if (s.patient_id && firstVisitMonth[s.patient_id] === month) {
          monthMap[month].newRev += amount
          monthMap[month].newPids.add(s.patient_id)
          monthMap[month].newPidRev[s.patient_id] = (monthMap[month].newPidRev[s.patient_id] || 0) + amount
          if (ptype === '整体') monthMap[month].newSeitaiPids.add(s.patient_id)
          if (ptype === 'ダイエット') monthMap[month].newDietPids.add(s.patient_id)
        } else {
          monthMap[month].existRev += amount
          monthMap[month].existPids.add(s.patient_id)
          if (ptype === '整体') { monthMap[month].existSeitaiPids.add(s.patient_id); monthMap[month].existRevSeitai += amount }
          if (ptype === 'ダイエット') { monthMap[month].existDietPids.add(s.patient_id); monthMap[month].existRevDiet += amount }
        }
      })

      const result: MonthlyData[] = Object.entries(monthMap)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, d]) => ({
          month,
          newRevenue: d.newRev,
          existingRevenue: d.existRev,
          totalRevenue: d.newRev + d.existRev,
          newCount: d.newPids.size,
          existingCount: d.existPids.size,
          newRatio: (d.newRev + d.existRev) > 0
            ? Math.round((d.newRev / (d.newRev + d.existRev)) * 100)
            : 0,
          newSeitai: d.newSeitaiPids.size,
          newDiet: d.newDietPids.size,
          existSeitai: d.existSeitaiPids.size,
          existDiet: d.existDietPids.size,
          existRevSeitai: d.existRevSeitai,
          existRevDiet: d.existRevDiet,
        }))

      const details: Record<string, NewPatientDetail[]> = {}
      for (const [month, d] of Object.entries(monthMap)) {
        details[month] = Array.from(d.newPids)
          .map(pid => {
            const extra = patientExtraMap[pid] || { gender: '', birth_date: '', city: '', prefecture: '', chief_complaint: '', referral_source: '', visit_motive: '' }
            return {
              pid,
              name: patientNameMap[pid] || '不明',
              revenue: d.newPidRev[pid] || 0,
              category: patientTypeMap[pid] || '',
              city: extra.city,
              prefecture: extra.prefecture,
              gender: extra.gender,
              age: calcAge(extra.birth_date),
              visitMotive: extra.visit_motive,
              chiefComplaint: extra.chief_complaint,
              referralSource: extra.referral_source,
              initialCourse: firstVisitMenu[pid] || '',
            }
          })
          .sort((a, b) => b.revenue - a.revenue)
      }

      setData(result)
      setMonthDetails(details)
      setLoading(false)
    }
    load()
  }, [])

  const openPatient = async (pid: string) => {
    setPatientLoading(true)
    const { data: p } = await supabase
      .from('cm_patients')
      .select('id, name, furigana, gender, birth_date, phone, email, zipcode, prefecture, city, address, referral_source, chief_complaint, customer_category, visit_motive, status, chart_no')
      .eq('id', pid)
      .single()
    setPatientModal(p as PatientInfo)
    setPatientLoading(false)
  }

  const totalNew = data.reduce((s, d) => s + d.newRevenue, 0)
  const totalExisting = data.reduce((s, d) => s + d.existingRevenue, 0)
  const totalAll = totalNew + totalExisting
  const newRatioTotal = totalAll > 0 ? Math.round((totalNew / totalAll) * 100) : 0

  const selectedDetails = selectedMonth ? (monthDetails[selectedMonth] || []) : []

  const statusLabel = (s: string) => s === 'active' ? '通院中' : s === 'completed' ? '卒業' : '休止'
  const chartNo = (n: number | null) => n ? String(n).padStart(7, '0') : '-'

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab.href === '/sales/new-existing' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >{tab.label}</Link>
          ))}
        </div>

        <h2 className="font-bold text-gray-800 text-lg mb-4">新規売上 / 既存売上</h2>

        {/* サマリー */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-blue-600">{totalNew.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">新規売上合計</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{totalExisting.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">既存売上合計</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold" style={{ color: '#14252A' }}>{totalAll.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">総売上</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-orange-600">{newRatioTotal}<span className="text-xs sm:text-sm">%</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">新規比率</p>
          </div>
        </div>

        {/* 新規/既存バー */}
        {totalAll > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <div className="flex h-8 rounded-lg overflow-hidden">
              <div className="bg-blue-500 flex items-center justify-center text-white text-xs font-bold"
                style={{ width: `${newRatioTotal}%` }}>
                {newRatioTotal > 10 && `新規 ${newRatioTotal}%`}
              </div>
              <div className="bg-green-500 flex items-center justify-center text-white text-xs font-bold"
                style={{ width: `${100 - newRatioTotal}%` }}>
                {(100 - newRatioTotal) > 10 && `既存 ${100 - newRatioTotal}%`}
              </div>
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>新規: {totalNew.toLocaleString()}円</span>
              <span>既存: {totalExisting.toLocaleString()}円</span>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : (
          <>
          {/* モバイル: カード表示 */}
          <div className="sm:hidden space-y-2">
            {data.length === 0 ? (
              <p className="text-center py-8 text-gray-400">データがありません</p>
            ) : data.map(d => (
              <div key={d.month} className="bg-white rounded-xl shadow-sm p-3">
                <div className="flex justify-between items-center mb-2 cursor-pointer"
                  onClick={() => setSelectedMonth(selectedMonth === d.month ? null : d.month)}>
                  <span className="font-medium text-sm">{d.month} {selectedMonth === d.month ? '▲' : '▼'}</span>
                  <span className="font-bold text-sm">{d.totalRevenue.toLocaleString()}円</span>
                </div>
                <div className="flex h-4 rounded overflow-hidden mb-1">
                  <div className="bg-blue-500" style={{ width: `${d.newRatio}%` }} />
                  <div className="bg-green-500" style={{ width: `${100 - d.newRatio}%` }} />
                </div>
                <div className="text-xs mt-1 space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-blue-600">新規 {d.newRevenue.toLocaleString()}円 ({d.newCount}件)</span>
                    <span className="text-green-600">既存 {d.existingRevenue.toLocaleString()}円 ({d.existingCount}件)</span>
                  </div>
                </div>
                {selectedMonth === d.month && (
                  <div className="mt-3 pt-3 border-t border-blue-100">
                    <DetailPanel details={monthDetails[d.month] || []} onClickPatient={openPatient} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* PC: テーブル表示 */}
          <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-3 py-2 text-xs text-gray-500">月</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">新規売上</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">新規件数<br/><span className="text-gray-400 font-normal">整体/ダイエット</span></th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">既存売上<br/><span className="text-gray-400 font-normal">整体/ダイエット</span></th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">既存件数<br/><span className="text-gray-400 font-normal">整体/ダイエット</span></th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">総売上</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">新規比率</th>
                  <th className="px-3 py-2 text-xs text-gray-500 w-32">構成比</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">データがありません</td></tr>
                ) : data.map(d => (
                  <>
                  <tr key={d.month}
                    className={`border-b cursor-pointer transition-colors ${selectedMonth === d.month ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    onClick={() => setSelectedMonth(selectedMonth === d.month ? null : d.month)}>
                    <td className="px-3 py-2 font-medium">
                      <div className="flex items-center gap-1">
                        {d.month}
                        <span className="text-[10px] text-blue-400">{selectedMonth === d.month ? '▲' : '▼'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-blue-600 font-medium">{d.newRevenue.toLocaleString()}円</td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-blue-600 font-medium">{d.newCount}件</span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        <span className="text-teal-600">{d.newSeitai}</span>/<span className="text-orange-500">{d.newDiet}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-green-600 font-medium">{d.existingRevenue.toLocaleString()}円</span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        <span className="text-teal-600">{d.existRevSeitai.toLocaleString()}</span>/<span className="text-orange-500">{d.existRevDiet.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-green-600 font-medium">{d.existingCount}件</span>
                      <div className="text-xs text-gray-400 mt-0.5">
                        <span className="text-teal-600">{d.existSeitai}</span>/<span className="text-orange-500">{d.existDiet}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{d.totalRevenue.toLocaleString()}円</td>
                    <td className="px-3 py-2 text-right">{d.newRatio}%</td>
                    <td className="px-3 py-2">
                      <div className="flex h-3 rounded overflow-hidden">
                        <div className="bg-blue-500" style={{ width: `${d.newRatio}%` }} />
                        <div className="bg-green-500" style={{ width: `${100 - d.newRatio}%` }} />
                      </div>
                    </td>
                  </tr>
                  {/* 展開パネル */}
                  {selectedMonth === d.month && (
                    <tr key={`${d.month}-detail`}>
                      <td colSpan={8} className="px-4 py-4 bg-blue-50 border-b">
                        <p className="text-xs font-semibold text-blue-700 mb-3">
                          {d.month} 新規患者一覧（計 {d.newCount}名 / {d.newRevenue.toLocaleString()}円）
                        </p>
                        <DetailPanel details={selectedDetails} onClickPatient={openPatient} />
                      </td>
                    </tr>
                  )}
                  </>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          </>
        )}
      </div>

      {/* 患者情報モーダル */}
      {(patientModal || patientLoading) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setPatientModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            {patientLoading ? (
              <div className="p-8 text-center text-gray-400">読み込み中...</div>
            ) : patientModal && (
              <>
                <div className="p-5 border-b">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg text-gray-800">{patientModal.name}</h3>
                        {patientModal.customer_category === '整体' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold">整体</span>
                        )}
                        {patientModal.customer_category === 'ダイエット' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">ダイエット</span>
                        )}
                      </div>
                      {patientModal.furigana && <p className="text-xs text-gray-400">{patientModal.furigana}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">カルテ番号: {chartNo(patientModal.chart_no)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        patientModal.status === 'active' ? 'bg-green-100 text-green-700' :
                        patientModal.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>{statusLabel(patientModal.status)}</span>
                      <button onClick={() => setPatientModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                    </div>
                  </div>
                </div>
                <div className="p-5 space-y-3 text-sm">
                  {[
                    ['性別', patientModal.gender],
                    ['生年月日', patientModal.birth_date],
                    ['電話番号', patientModal.phone],
                    ['メール', patientModal.email],
                    ['住所', [patientModal.zipcode && `〒${patientModal.zipcode}`, patientModal.prefecture, patientModal.city, patientModal.address].filter(Boolean).join(' ')],
                    ['主訴', patientModal.chief_complaint],
                    ['来院経路', patientModal.referral_source],
                    ['来店動機', patientModal.visit_motive],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div key={label as string} className="flex gap-3">
                      <span className="text-xs text-gray-400 w-20 shrink-0 pt-0.5">{label}</span>
                      <span className="text-gray-700 text-xs flex-1">{value}</span>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t flex gap-2">
                  <Link href={`/patients/${patientModal.id}`}
                    className="flex-1 text-center text-white text-sm font-bold py-2.5 rounded-xl"
                    style={{ background: '#14252A' }}
                    onClick={() => setPatientModal(null)}>
                    詳細ページへ
                  </Link>
                  <button onClick={() => setPatientModal(null)}
                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                    閉じる
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}

function DetailPanel({ details, onClickPatient }: {
  details: NewPatientDetail[]
  onClickPatient: (pid: string) => void
}) {
  const seitai = details.filter(p => p.category === '整体')
  const diet = details.filter(p => p.category === 'ダイエット')
  const seitaiRev = seitai.reduce((s, p) => s + p.revenue, 0)
  const dietRev = diet.reduce((s, p) => s + p.revenue, 0)

  return (
    <div>
      {/* 患者カード一覧 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {details.map(p => (
          <div key={p.pid}
            className="bg-white rounded-xl px-3 py-2.5 text-xs shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
            onClick={() => onClickPatient(p.pid)}>
            {/* 名前行 */}
            <div className="flex items-center gap-1 mb-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${p.category === 'ダイエット' ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700'}`}>
                {p.category === 'ダイエット' ? 'D' : 'S'}
              </span>
              <span className="font-semibold text-gray-800 truncate">{p.name}</span>
            </div>

            {/* 詳細情報 */}
            <div className="space-y-0.5 mb-2">
              {(p.prefecture || p.city) && (
                <div className="flex gap-1 text-[10px]">
                  <span className="text-gray-400 w-16 shrink-0">地域</span>
                  <span className="text-gray-600 truncate">{p.prefecture}{p.city}</span>
                </div>
              )}
              {(p.gender || p.age !== null) && (
                <div className="flex gap-1 text-[10px]">
                  <span className="text-gray-400 w-16 shrink-0">性別/年齢</span>
                  <span className="text-gray-600">{p.gender}{p.gender && p.age !== null && '・'}{p.age !== null && `${p.age}歳`}</span>
                </div>
              )}
              {p.chiefComplaint && (
                <div className="flex gap-1 text-[10px]">
                  <span className="text-gray-400 w-16 shrink-0">症状</span>
                  <span className="text-gray-600 truncate">{p.chiefComplaint}</span>
                </div>
              )}
              {p.referralSource && (
                <div className="flex gap-1 text-[10px]">
                  <span className="text-gray-400 w-16 shrink-0">経路</span>
                  <span className="text-gray-600 truncate">{p.referralSource}</span>
                </div>
              )}
              {p.visitMotive && (
                <div className="flex gap-1 text-[10px]">
                  <span className="text-gray-400 w-12 shrink-0">キーワード</span>
                  <span className="text-gray-600 truncate">{p.visitMotive}</span>
                </div>
              )}
              {p.initialCourse && (
                <div className="flex gap-1 text-[10px]">
                  <span className="text-gray-400 w-12 shrink-0">初回コース</span>
                  <span className="text-gray-600 truncate font-medium">{p.initialCourse}</span>
                </div>
              )}
            </div>

            {/* 売上金額 */}
            <p className="text-right font-bold text-blue-600 border-t border-gray-100 pt-1.5 mt-1">{p.revenue.toLocaleString()}円</p>
          </div>
        ))}
      </div>

      {/* 整体/ダイエット集計 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-teal-50 rounded-xl p-3 border border-teal-100">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-200 text-teal-800 font-bold">整体</span>
            <span className="text-xs text-teal-700 font-semibold">新規 {seitai.length}名</span>
          </div>
          <p className="text-lg font-bold text-teal-700">{seitaiRev.toLocaleString()}<span className="text-xs">円</span></p>
          <div className="mt-1.5 space-y-0.5">
            {seitai.map(p => (
              <div key={p.pid} className="flex justify-between text-xs text-teal-600 cursor-pointer hover:underline"
                onClick={() => onClickPatient(p.pid)}>
                <span>{p.name}</span>
                <span>{p.revenue.toLocaleString()}円</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-200 text-orange-800 font-bold">ダイエット</span>
            <span className="text-xs text-orange-700 font-semibold">新規 {diet.length}名</span>
          </div>
          <p className="text-lg font-bold text-orange-700">{dietRev.toLocaleString()}<span className="text-xs">円</span></p>
          <div className="mt-1.5 space-y-0.5">
            {diet.map(p => (
              <div key={p.pid} className="flex justify-between text-xs text-orange-600 cursor-pointer hover:underline"
                onClick={() => onClickPatient(p.pid)}>
                <span>{p.name}</span>
                <span>{p.revenue.toLocaleString()}円</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
