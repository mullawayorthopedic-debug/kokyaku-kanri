'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'
import type { Patient, Slip } from '@/lib/types'

interface TodaySlip extends Slip {
  patient?: Patient
}

type PaymentMethod = '現金' | 'カード' | 'QR決済' | 'PayPay' | '回数券' | 'その他'
const PAYMENT_METHODS: PaymentMethod[] = ['現金', 'カード', 'QR決済', 'PayPay', '回数券', 'その他']

const paymentStyle: Record<string, { label: string; bg: string; text: string; border: string }> = {
  '現金':   { label: '💴 現金',   bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200' },
  'カード': { label: '💳 カード', bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  'QR決済': { label: '📱 QR',    bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  'PayPay': { label: '🟡 PayPay', bg: 'bg-red-50',   text: 'text-red-600',   border: 'border-red-200' },
  '回数券': { label: '🎟️ 回数券', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  'その他': { label: '🔖 その他', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
}

interface InquiryRow {
  channel: string
  inquiries: number
  conversions: number
}

function PaymentBadge({ slipId, current, onUpdate }: {
  slipId: string
  current: string | null
  onUpdate: (id: string, method: PaymentMethod) => void
}) {
  const [open, setOpen] = useState(false)
  const style = paymentStyle[current || ''] || { label: '- 未設定', bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200' }

  return (
    <div className="relative">
      <button
        onClick={e => { e.preventDefault(); setOpen(!open) }}
        className={`text-[11px] font-medium px-2 py-1 rounded-full border ${style.bg} ${style.text} ${style.border} whitespace-nowrap`}
      >
        {style.label} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[110px]">
            {PAYMENT_METHODS.map(m => {
              const s = paymentStyle[m]
              return (
                <button
                  key={m}
                  onClick={e => { e.preventDefault(); onUpdate(slipId, m); setOpen(false) }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${current === m ? 'font-bold' : ''}`}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function HomePage() {
  const supabase = createClient()
  const clinicId = getClinicId()

  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)
  const [dateSlips, setDateSlips] = useState<TodaySlip[]>([])
  const [todayPatients, setTodayPatients] = useState<{ id: string; name: string }[]>([])
  const [stats, setStats] = useState({ totalPatients: 0, monthVisits: 0, todayVisits: 0, todayRevenue: 0 })
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingSlips, setLoadingSlips] = useState(false)

  // ===== 問い合わせ・CV入力 =====
  const [adChannels, setAdChannels] = useState<string[]>([])
  const [inquiryRows, setInquiryRows] = useState<InquiryRow[]>([])
  const [inquiryMonth, setInquiryMonth] = useState(today.slice(0, 7))
  const [savingInquiry, setSavingInquiry] = useState(false)
  const [inquirySaved, setInquirySaved] = useState(false)
  const [loadingInquiry, setLoadingInquiry] = useState(false)

  useEffect(() => {
    const loadStats = async () => {
      const monthStart = today.slice(0, 7) + '-01'
      const [todayRes, monthRes, countRes] = await Promise.all([
        supabase.from('cm_slips').select('id, patient_id, patient_name, total_price').eq('clinic_id', clinicId).eq('visit_date', today),
        supabase.from('cm_slips').select('id, total_price', { count: 'exact' }).eq('clinic_id', clinicId).gte('visit_date', monthStart),
        supabase.from('cm_patients').select('id', { count: 'exact' }).eq('clinic_id', clinicId),
      ])
      const slips = todayRes.data || []
      const todayRevenue = slips.reduce((sum: number, s: { total_price?: number }) => sum + (s.total_price || 0), 0)
      const seen = new Set<string>()
      const uniquePatients = slips
        .filter(s => { if (seen.has(s.patient_id)) return false; seen.add(s.patient_id); return true })
        .map(s => ({ id: s.patient_id, name: s.patient_name || '' }))
      setTodayPatients(uniquePatients)
      setStats({ totalPatients: countRes.count || 0, monthVisits: monthRes.count || 0, todayVisits: slips.length, todayRevenue })
      setLoadingStats(false)
    }
    loadStats()
  }, [])

  const fetchSlips = useCallback(async (date: string) => {
    setLoadingSlips(true)
    const { data } = await supabase
      .from('cm_slips').select('*').eq('clinic_id', clinicId)
      .eq('visit_date', date).order('created_at', { ascending: false })
    setDateSlips(data || [])
    setLoadingSlips(false)
  }, [clinicId])

  useEffect(() => { fetchSlips(selectedDate) }, [selectedDate, fetchSlips])

  // 広告チャネル読み込み
  useEffect(() => {
    const loadChannels = async () => {
      const { data } = await supabase
        .from('cm_ad_channels')
        .select('name')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .order('sort_order')
      setAdChannels(data?.map(c => c.name) || [])
    }
    loadChannels()
  }, [clinicId])

  // 問い合わせデータ読み込み（月変更時も再読み込み）
  useEffect(() => {
    if (adChannels.length === 0) return
    const loadInquiry = async () => {
      setLoadingInquiry(true)
      const { data } = await supabase
        .from('cm_ad_costs')
        .select('channel, inquiries, conversions')
        .eq('clinic_id', clinicId)
        .eq('month', inquiryMonth)
      const map: Record<string, { inquiries: number; conversions: number }> = {}
      data?.forEach(d => {
        map[d.channel] = { inquiries: d.inquiries || 0, conversions: d.conversions || 0 }
      })
      setInquiryRows(adChannels.map(ch => ({
        channel: ch,
        inquiries: map[ch]?.inquiries || 0,
        conversions: map[ch]?.conversions || 0,
      })))
      setInquirySaved(false)
      setLoadingInquiry(false)
    }
    loadInquiry()
  }, [inquiryMonth, adChannels, clinicId])

  const updateInquiryRow = (index: number, key: 'inquiries' | 'conversions', value: number) => {
    setInquiryRows(prev => prev.map((r, i) => i === index ? { ...r, [key]: value } : r))
  }

  const saveInquiries = async () => {
    setSavingInquiry(true)
    // 既存レコードを一括取得
    const { data: existing } = await supabase
      .from('cm_ad_costs')
      .select('id, channel, cost, impressions, clicks, new_patients, notes')
      .eq('clinic_id', clinicId)
      .eq('month', inquiryMonth)
    const existingMap: Record<string, { id: string }> = {}
    existing?.forEach(e => { existingMap[e.channel] = { id: e.id } })

    const toUpdate = inquiryRows.filter(r => existingMap[r.channel])
    const toInsert = inquiryRows.filter(r => !existingMap[r.channel] && (r.inquiries > 0 || r.conversions > 0))

    for (const row of toUpdate) {
      await supabase.from('cm_ad_costs')
        .update({ inquiries: row.inquiries, conversions: row.conversions })
        .eq('id', existingMap[row.channel].id)
    }
    if (toInsert.length > 0) {
      await supabase.from('cm_ad_costs').insert(toInsert.map(r => ({
        clinic_id: clinicId,
        month: inquiryMonth,
        channel: r.channel,
        cost: 0,
        inquiries: r.inquiries,
        conversions: r.conversions,
        impressions: 0,
        clicks: 0,
        new_patients: 0,
        notes: '',
      })))
    }

    setSavingInquiry(false)
    setInquirySaved(true)
    setTimeout(() => setInquirySaved(false), 3000)
  }

  const handlePaymentUpdate = async (slipId: string, method: PaymentMethod) => {
    setDateSlips(prev => prev.map(s => s.id === slipId ? { ...s, payment_method: method } : s))
    await supabase.from('cm_slips').update({ payment_method: method }).eq('id', slipId)
  }

  const dateRevenue = dateSlips.reduce((sum, s) => sum + (s.total_price || 0), 0)
  const paymentBreakdown = dateSlips.reduce<Record<string, number>>((acc, s) => {
    const m = s.payment_method || 'その他'
    acc[m] = (acc[m] || 0) + (s.total_price || 0)
    return acc
  }, {})

  const totalInquiries = inquiryRows.reduce((s, r) => s + r.inquiries, 0)
  const totalConversions = inquiryRows.reduce((s, r) => s + r.conversions, 0)
  const totalCVR = totalInquiries > 0 ? Math.round(totalConversions / totalInquiries * 100) : 0

  return (
    <AppShell>
      <Header title="顧客管理シート" />
      <div className="px-4 py-5 max-w-lg mx-auto">

        {/* 統計カード */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4 text-center border-l-4" style={{ borderLeftColor: '#14252A' }}>
            <div className="text-2xl mb-1">👥</div>
            <p className="text-2xl sm:text-3xl font-bold" style={{ color: '#14252A' }}>{stats.totalPatients}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">総患者数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4 text-center border-l-4 border-l-blue-500">
            <div className="text-2xl mb-1">📋</div>
            <p className="text-2xl sm:text-3xl font-bold text-blue-600">{stats.monthVisits}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">今月の施術</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4 text-center border-l-4 border-l-green-500">
            <div className="text-2xl mb-1">✅</div>
            <p className="text-2xl sm:text-3xl font-bold text-green-600">{stats.todayVisits}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">本日の施術</p>
          </div>
        </div>

        {/* クイックアクション */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Link href="/patients/new" className="text-white rounded-xl p-3 text-center font-bold shadow-sm text-xs" style={{ background: '#14252A' }}>
            + 新規患者
          </Link>
          <Link href="/visits/new" className="bg-blue-600 text-white rounded-xl p-3 text-center font-bold shadow-sm text-xs">
            + 施術記録
          </Link>
          <Link href="/visits/quick" className="bg-green-600 text-white rounded-xl p-3 text-center font-bold shadow-sm text-xs">
            一括入力
          </Link>
          <Link href="/visits/import" className="bg-white border-2 border-gray-200 text-gray-700 rounded-xl p-3 text-center font-bold shadow-sm text-xs hover:bg-gray-50">
            CSV取込
          </Link>
        </div>

        {/* ===== 新規問い合わせ・CV入力 ===== */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-5 border border-orange-100">
          <div className="flex justify-between items-center mb-3 gap-2">
            <h2 className="font-bold text-gray-800 text-base flex items-center gap-1.5">
              <span className="text-lg">📞</span> 新規問い合わせ入力
            </h2>
            <input
              type="month"
              value={inquiryMonth}
              onChange={e => setInquiryMonth(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300"
            />
          </div>

          {adChannels.length === 0 ? (
            <div className="text-center py-5">
              <p className="text-gray-400 text-sm mb-2">広告チャネルが未設定です</p>
              <Link href="/master" className="text-xs text-blue-600 underline">マスター設定で広告媒体を登録する →</Link>
            </div>
          ) : loadingInquiry ? (
            <p className="text-gray-400 text-sm text-center py-4">読み込み中...</p>
          ) : (
            <>
              {/* ヘッダー */}
              <div className="grid grid-cols-[1fr_80px_80px_52px] gap-1 mb-1 px-1">
                <div className="text-[10px] text-gray-400 font-medium">広告媒体</div>
                <div className="text-[10px] text-gray-400 font-medium text-center">問い合わせ</div>
                <div className="text-[10px] text-green-600 font-medium text-center">CV（来院）</div>
                <div className="text-[10px] text-gray-400 font-medium text-right">CVR</div>
              </div>

              {/* 行 */}
              <div className="space-y-1.5 mb-3">
                {inquiryRows.map((row, i) => {
                  const cvr = row.inquiries > 0 ? Math.round(row.conversions / row.inquiries * 100) : null
                  return (
                    <div key={row.channel} className="grid grid-cols-[1fr_80px_80px_52px] gap-1 items-center bg-gray-50 rounded-lg px-2 py-1.5">
                      <div className="text-xs font-medium text-gray-700 truncate">{row.channel}</div>
                      <div className="flex items-center gap-0.5">
                        <input
                          type="number"
                          min={0}
                          value={row.inquiries || ''}
                          placeholder="0"
                          onChange={e => updateInquiryRow(i, 'inquiries', parseInt(e.target.value) || 0)}
                          className="w-full text-center border border-gray-200 rounded px-1 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
                        />
                        <span className="text-[10px] text-gray-400 flex-shrink-0">件</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <input
                          type="number"
                          min={0}
                          value={row.conversions || ''}
                          placeholder="0"
                          onChange={e => updateInquiryRow(i, 'conversions', parseInt(e.target.value) || 0)}
                          className="w-full text-center border border-green-200 rounded px-1 py-1 text-sm font-bold text-green-700 focus:outline-none focus:ring-1 focus:ring-green-400 bg-white"
                        />
                        <span className="text-[10px] text-gray-400 flex-shrink-0">件</span>
                      </div>
                      <div className="text-right">
                        {cvr !== null ? (
                          <span className={`text-xs font-bold ${cvr >= 30 ? 'text-green-600' : cvr >= 10 ? 'text-yellow-600' : 'text-red-500'}`}>
                            {cvr}%
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 今月累計サマリ */}
              {(totalInquiries > 0 || totalConversions > 0) && (
                <div className="rounded-lg px-3 py-2 mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ background: 'rgba(20,37,42,0.05)' }}>
                  <span className="text-gray-600">
                    今月合計: 問い合わせ <strong className="text-gray-800 text-sm">{totalInquiries}</strong>件
                  </span>
                  <span className="text-gray-600">
                    → CV来院 <strong className="text-green-700 text-sm">{totalConversions}</strong>件
                  </span>
                  {totalInquiries > 0 && (
                    <span className="text-gray-600">
                      CVR <strong className={`text-sm ${totalCVR >= 30 ? 'text-green-600' : totalCVR >= 10 ? 'text-yellow-600' : 'text-red-500'}`}>{totalCVR}%</strong>
                    </span>
                  )}
                </div>
              )}

              {/* 保存ボタン */}
              <button
                onClick={saveInquiries}
                disabled={savingInquiry}
                className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                  inquirySaved ? 'bg-green-600 text-white' : 'text-white'
                }`}
                style={inquirySaved ? {} : { background: '#14252A' }}
              >
                {inquirySaved ? (
                  <><span>✓</span> 保存しました</>
                ) : savingInquiry ? (
                  '保存中...'
                ) : (
                  '保存する'
                )}
              </button>
              <p className="text-[10px] text-gray-400 mt-1.5 text-center">
                ※ ROAS分析ページでCV数をもとにCPAを自動計算します
              </p>
            </>
          )}
        </div>

        {/* 施術記録（日付ピッカー付き） */}
        <div className="bg-white rounded-xl shadow-sm p-5 mb-5">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-gray-800 text-base">🩺 施術記録</h2>
          </div>

          {/* 日付ピッカー */}
          <div className="mb-4">
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {loadingSlips ? (
            <p className="text-gray-400 text-sm text-center py-4">読み込み中...</p>
          ) : dateSlips.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">この日の施術記録はありません</p>
          ) : (
            <>
              {/* 合計金額 */}
              <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(20,37,42,0.05)' }}>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-sm font-semibold text-gray-700">合計売上</span>
                  <span className="text-2xl font-bold" style={{ color: '#14252A' }}>{dateRevenue.toLocaleString()}円</span>
                </div>
                {Object.keys(paymentBreakdown).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                    {Object.entries(paymentBreakdown).map(([method, amount]) => {
                      const s = paymentStyle[method] || paymentStyle['その他']
                      return (
                        <div key={method} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.bg} ${s.text} ${s.border}`}>
                          <span>{s.label}</span>
                          <span className="font-bold">{amount.toLocaleString()}円</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* スリップ一覧 */}
              <div className="space-y-2">
                {dateSlips.map(s => (
                  <div key={s.id} className="border border-gray-100 rounded-lg p-3.5 hover:bg-gray-50">
                    <div className="flex justify-between items-start gap-2">
                      <Link href={`/patients/${s.patient_id}`} className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-blue-700 hover:underline">{s.patient_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{s.menu_name}</p>
                      </Link>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                          (s.total_price || 0) === 0
                            ? 'bg-gray-50 text-gray-400 border-gray-100'
                            : 'bg-green-50 text-green-700 border-green-100'
                        }`}>
                          {(s.total_price || 0).toLocaleString()}円
                        </span>
                        <PaymentBadge
                          slipId={s.id}
                          current={s.payment_method || null}
                          onUpdate={handlePaymentUpdate}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 本日の来院患者 */}
        {!loadingStats && (
          <div className="bg-white rounded-xl shadow-sm p-5 mb-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-gray-800 text-base">👤 本日の来院患者</h2>
              <Link href="/patients" className="text-xs text-blue-600 font-medium hover:text-blue-800">すべて見る →</Link>
            </div>
            {todayPatients.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">本日の来院患者はいません</p>
            ) : (
              <div className="space-y-2">
                {todayPatients.map(p => (
                  <Link key={p.id} href={`/patients/${p.id}`} className="block border border-gray-100 rounded-lg p-3.5 hover:bg-gray-50 hover:shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-green-500" />
                      <p className="font-bold text-sm">{p.name}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </AppShell>
  )
}
