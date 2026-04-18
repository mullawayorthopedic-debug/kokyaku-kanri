'use client'

import { useEffect, useState, useCallback } from 'react'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import type { Reservation, Patient } from '@/lib/types'
import { RESERVATION_STATUSES } from '@/lib/types'
import { getClinicId } from '@/lib/clinic'
import { getToday, formatLocalDate } from '@/lib/dateUtils'

const HOURS = Array.from({ length: 13 }, (_, i) => i + 9) // 9:00 ~ 21:00
const SLOT_HEIGHT = 60

function formatTime(h: number, m: number = 0) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function getWeekDates(baseDate: Date): Date[] {
  const start = new Date(baseDate)
  start.setDate(start.getDate() - start.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export default function ReservationPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [viewMode, setViewMode] = useState<'week' | 'day' | 'list'>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientSearch, setPatientSearch] = useState('')

  const [form, setForm] = useState({
    patient_id: '',
    patient_name: '',
    reservation_date: getToday(),
    start_time: '10:00',
    end_time: '11:00',
    menu_name: '',
    menu_price: 0,
    status: 'reserved' as Reservation['status'],
    notes: '',
  })

  const weekDates = getWeekDates(currentDate)

  const loadReservations = useCallback(async () => {
    setLoading(true)
    const startDate = formatLocalDate(weekDates[0])
    const endDate = formatLocalDate(weekDates[6])

    const { data } = await supabase
      .from('cm_reservations')
      .select('*')
      .eq('clinic_id', clinicId)
      .gte('reservation_date', startDate)
      .lte('reservation_date', endDate)
      .order('start_time')

    setReservations(data || [])
    setLoading(false)
  }, [currentDate])

  useEffect(() => { loadReservations() }, [loadReservations])

  useEffect(() => {
    const loadPatients = async () => {
      const { data } = await supabase.from('cm_patients').select('*').eq('clinic_id', clinicId).eq('status', 'active').order('name')
      setPatients(data || [])
    }
    loadPatients()
  }, [])

  const navigateWeek = (dir: number) => {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + dir * 7)
    setCurrentDate(d)
  }

  const goToday = () => setCurrentDate(new Date())

  const openNewReservation = (date?: string, time?: string) => {
    setEditingReservation(null)
    setForm({
      patient_id: '',
      patient_name: '',
      reservation_date: date || getToday(),
      start_time: time || '10:00',
      end_time: time ? formatTime(parseInt(time.split(':')[0]) + 1) : '11:00',
      menu_name: '',
      menu_price: 0,
      status: 'reserved',
      notes: '',
    })
    setPatientSearch('')
    setShowModal(true)
  }

  const openEditReservation = (r: Reservation) => {
    setEditingReservation(r)
    setForm({
      patient_id: r.patient_id || '',
      patient_name: r.patient_name,
      reservation_date: r.reservation_date,
      start_time: r.start_time.slice(0, 5),
      end_time: r.end_time.slice(0, 5),
      menu_name: r.menu_name,
      menu_price: r.menu_price,
      status: r.status,
      notes: r.notes,
    })
    setPatientSearch('')
    setShowModal(true)
  }

  const handleSave = async () => {
    const payload = {
      ...form,
      clinic_id: clinicId,
      start_time: form.start_time + ':00',
      end_time: form.end_time + ':00',
    }
    if (editingReservation) {
      await supabase.from('cm_reservations').update(payload).eq('id', editingReservation.id)
    } else {
      await supabase.from('cm_reservations').insert(payload)
    }
    setShowModal(false)
    loadReservations()
  }

  const handleDelete = async () => {
    if (!editingReservation) return
    await supabase.from('cm_reservations').delete().eq('id', editingReservation.id)
    setShowModal(false)
    loadReservations()
  }

  const filteredPatients = patientSearch
    ? patients.filter(p => p.name.includes(patientSearch) || p.furigana?.includes(patientSearch))
    : []

  const getReservationsForDateHour = (date: string, hour: number) => {
    return reservations.filter(r => {
      const rDate = r.reservation_date
      const rHour = parseInt(r.start_time.split(':')[0])
      return rDate === date && rHour === hour
    })
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'reserved': return 'bg-blue-100 border-blue-500 text-blue-800 font-medium'
      case 'visited': return 'bg-green-100 border-green-500 text-green-800 font-medium'
      case 'cancelled': return 'bg-gray-200 border-gray-400 text-gray-500 line-through'
      case 'no_show': return 'bg-red-100 border-red-500 text-red-800 font-medium'
      default: return 'bg-blue-100 border-blue-500 text-blue-800 font-medium'
    }
  }

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A]"

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* ヘッダー */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-gray-800 text-lg">📅 予約管理</h2>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {(['week', 'day', 'list'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    viewMode === mode ? 'bg-[#14252A] text-white shadow-sm' : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {mode === 'week' ? '週' : mode === 'day' ? '日' : '一覧'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => navigateWeek(-1)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">&lt;</button>
            <button onClick={goToday} className="px-3.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">今日</button>
            <button onClick={() => navigateWeek(1)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">&gt;</button>
            <input
              type="date"
              value={formatLocalDate(currentDate)}
              onChange={e => {
                if (e.target.value) setCurrentDate(new Date(e.target.value + 'T00:00:00'))
              }}
              className="px-2 py-1 border border-gray-300 rounded text-sm"
            />
            <span className="text-sm font-medium text-gray-700">
              {weekDates[0].toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })} 〜 {weekDates[6].toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
            </span>
          </div>
          <button
            onClick={() => openNewReservation()}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white"
            style={{ background: '#14252A' }}
          >
            + 新規予約
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : viewMode === 'list' ? (
          <>
            {/* モバイル: カード表示 */}
            <div className="sm:hidden space-y-2">
              {reservations.length === 0 ? (
                <p className="text-center py-8 text-gray-400">予約がありません</p>
              ) : reservations.map(r => (
                <div
                  key={r.id}
                  onClick={() => openEditReservation(r)}
                  className="bg-white rounded-xl shadow-sm p-3 cursor-pointer active:bg-gray-50"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{r.patient_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{r.menu_name}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(r.status)}`}>
                      {RESERVATION_STATUSES[r.status]}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    <span>{new Date(r.reservation_date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}</span>
                    <span>{r.start_time.slice(0, 5)} ~ {r.end_time.slice(0, 5)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* PC: テーブル表示 */}
            <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-2 text-xs text-gray-500">日付</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500">時間</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500">患者名</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500">メニュー</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500">ステータス</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">予約がありません</td></tr>
                  ) : reservations.map(r => (
                    <tr
                      key={r.id}
                      onClick={() => openEditReservation(r)}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-2">
                        {new Date(r.reservation_date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                      </td>
                      <td className="px-4 py-2">{r.start_time.slice(0, 5)} ~ {r.end_time.slice(0, 5)}</td>
                      <td className="px-4 py-2 font-medium">{r.patient_name}</td>
                      <td className="px-4 py-2">{r.menu_name}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(r.status)}`}>
                          {RESERVATION_STATUSES[r.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* モバイル: カレンダーの代わりにその日の予約リスト */}
            <div className="sm:hidden">
              <p className="text-xs text-gray-500 mb-2 text-center">カレンダー表示はPC画面でご利用ください。モバイルでは一覧表示がおすすめです。</p>
              <div className="space-y-2">
                {reservations.length === 0 ? (
                  <p className="text-center py-8 text-gray-400">予約がありません</p>
                ) : reservations.map(r => (
                  <div
                    key={r.id}
                    onClick={() => openEditReservation(r)}
                    className="bg-white rounded-xl shadow-sm p-3 cursor-pointer active:bg-gray-50"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">{r.patient_name}</p>
                        <p className="text-xs text-gray-500">{r.menu_name}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(r.status)}`}>
                        {RESERVATION_STATUSES[r.status]}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      <span>{new Date(r.reservation_date + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}</span>
                      <span>{r.start_time.slice(0, 5)} ~ {r.end_time.slice(0, 5)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PC: カレンダー表示（週/日） */}
            <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-auto">
            <div className="min-w-[700px]">
              {/* 日付ヘッダー */}
              <div className="flex border-b sticky top-0 bg-white z-10">
                <div className="w-16 flex-shrink-0 border-r" />
                {(viewMode === 'day' ? [currentDate] : weekDates).map((date, i) => {
                  const dateStr = formatLocalDate(date)
                  const isToday = dateStr === getToday()
                  const dayIndex = date.getDay()
                  return (
                    <div
                      key={i}
                      className={`flex-1 text-center py-2 border-r text-xs ${
                        isToday ? 'bg-blue-50' : ''
                      } ${dayIndex === 0 ? 'text-red-500' : dayIndex === 6 ? 'text-blue-500' : ''}`}
                    >
                      <div className="font-bold">{WEEKDAYS[dayIndex]}</div>
                      <div className={`text-lg font-bold ${isToday ? 'bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center mx-auto' : ''}`}>
                        {date.getDate()}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 時間グリッド */}
              {HOURS.map(hour => (
                <div key={hour} className="flex border-b" style={{ minHeight: SLOT_HEIGHT }}>
                  <div className="w-16 flex-shrink-0 border-r text-sm text-gray-500 font-medium text-right pr-2 pt-1">
                    {formatTime(hour)}
                  </div>
                  {(viewMode === 'day' ? [currentDate] : weekDates).map((date, i) => {
                    const dateStr = formatLocalDate(date)
                    const cellReservations = getReservationsForDateHour(dateStr, hour)
                    return (
                      <div
                        key={i}
                        className="flex-1 border-r p-0.5 cursor-pointer hover:bg-gray-50 relative"
                        onClick={() => openNewReservation(dateStr, formatTime(hour))}
                      >
                        {cellReservations.map(r => (
                          <div
                            key={r.id}
                            onClick={(e) => { e.stopPropagation(); openEditReservation(r) }}
                            className={`text-xs p-1 rounded border mb-0.5 cursor-pointer truncate ${statusColor(r.status)}`}
                          >
                            <div className="font-medium truncate">{r.patient_name}</div>
                            <div className="text-[10px] opacity-75">{r.start_time.slice(0, 5)}-{r.end_time.slice(0, 5)}</div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            </div>
          </>
        )}

        {/* 予約モーダル */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b flex justify-between items-center" style={{ background: 'rgba(20,37,42,0.03)' }}>
                <h3 className="font-bold text-gray-800 text-lg">{editingReservation ? '予約編集' : '新規予約'}</h3>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
              </div>
              <div className="p-5 space-y-4">
                {/* 患者選択 */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">患者</label>
                  {form.patient_id ? (
                    <div className="flex items-center justify-between bg-blue-50 rounded-lg p-2">
                      <span className="text-sm font-medium">{form.patient_name}</span>
                      <button onClick={() => setForm({ ...form, patient_id: '', patient_name: '' })} className="text-xs text-red-500">変更</button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={patientSearch || form.patient_name}
                        onChange={e => { setPatientSearch(e.target.value); setForm({ ...form, patient_name: e.target.value }) }}
                        placeholder="患者名を検索 or 直接入力"
                        className={inputClass}
                      />
                      {filteredPatients.length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border rounded-lg mt-1 shadow-lg z-10 max-h-32 overflow-y-auto">
                          {filteredPatients.map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setForm({ ...form, patient_id: p.id, patient_name: p.name })
                                setPatientSearch('')
                              }}
                              className="block w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b"
                            >
                              {p.name} <span className="text-xs text-gray-400">{p.furigana}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">日付</label>
                    <input type="date" value={form.reservation_date} onChange={e => setForm({ ...form, reservation_date: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">ステータス</label>
                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Reservation['status'] })} className={inputClass}>
                      {Object.entries(RESERVATION_STATUSES).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">開始</label>
                    <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">終了</label>
                    <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className={inputClass} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">メニュー</label>
                  <input type="text" value={form.menu_name} onChange={e => setForm({ ...form, menu_name: e.target.value })} placeholder="施術メニュー" className={inputClass} />
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">料金</label>
                  <input type="number" value={form.menu_price || ''} onChange={e => setForm({ ...form, menu_price: parseInt(e.target.value) || 0 })} placeholder="0" className={inputClass} />
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">メモ</label>
                  <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputClass} rows={2} />
                </div>

                <div className="flex gap-2 pt-2">
                  <button onClick={handleSave} className="flex-1 text-white py-2 rounded-lg text-sm font-bold" style={{ background: '#14252A' }}>
                    {editingReservation ? '更新' : '予約登録'}
                  </button>
                  {editingReservation && (
                    <button onClick={handleDelete} className="px-4 py-2 text-red-500 border border-red-200 rounded-lg text-sm">削除</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
