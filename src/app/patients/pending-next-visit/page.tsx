'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getClinicIdClient } from '@/lib/clinic'

interface PendingEntry {
  id: string
  patient_id: string | null
  patient_name: string
  last_visit_date: string | null
  planned_date_text: string
  category: string
  ticket_type: string
  created_at: string
}

interface PatientSuggestion {
  id: string
  name: string
  customer_category: string
  last_visit_date: string | null
}

const emptyForm = {
  name: '',
  patientId: '',
  lastVisitDate: '',
  plannedDateText: '',
  category: '',
  ticketType: '',
}

export default function PendingNextVisitPage() {
  const supabase = createClient()
  const [clinicId, setClinicId] = useState('')
  const [entries, setEntries] = useState<PendingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [suggestions, setSuggestions] = useState<PatientSuggestion[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const cid = await getClinicIdClient()
      setClinicId(cid)
      const { data } = await supabase.from('cm_pending_next_visits')
        .select('*')
        .eq('clinic_id', cid)
        .order('created_at', { ascending: false })
      setEntries(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const searchPatients = async (query: string) => {
    if (!clinicId || query.length < 1) { setSuggestions([]); return }
    const { data } = await supabase.from('cm_patients')
      .select('id, name, customer_category, last_visit_date')
      .eq('clinic_id', clinicId)
      .eq('status', 'active')
      .or(`name.ilike.%${query}%,furigana.ilike.%${query}%`)
      .limit(10)
    setSuggestions(data || [])
  }

  const selectSuggestion = (p: PatientSuggestion) => {
    setForm(prev => ({
      ...prev,
      name: p.name,
      patientId: p.id,
      lastVisitDate: p.last_visit_date || prev.lastVisitDate,
      category: p.customer_category === 'ダイエット' || p.customer_category === '整体' ? p.customer_category : prev.category,
    }))
    setSuggestions([])
  }

  const handleAdd = async () => {
    if (!form.name.trim()) { alert('氏名を入力してください'); return }
    setSaving(true)
    const { data, error } = await supabase.from('cm_pending_next_visits').insert({
      clinic_id: clinicId,
      patient_id: form.patientId || null,
      patient_name: form.name.trim(),
      last_visit_date: form.lastVisitDate || null,
      planned_date_text: form.plannedDateText,
      category: form.category,
      ticket_type: form.ticketType,
    }).select().single()
    setSaving(false)
    if (error) { alert('追加に失敗しました: ' + error.message); return }
    setEntries(prev => [data, ...prev])
    setForm(emptyForm)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この行を削除しますか？')) return
    await supabase.from('cm_pending_next_visits').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A]"

  return (
    <AppShell>
      <Header title="次回予約未定の患者" />
      <div className="max-w-3xl mx-auto p-4 space-y-4">

        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 text-base mb-3">📅 次回予約未定リスト</h2>
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-8">読み込み中...</p>
          ) : entries.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">登録されている患者はいません</p>
          ) : (
            <div className="space-y-2">
              {entries.map(e => (
                <div key={e.id} className="border border-gray-100 rounded-lg p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {e.patient_id ? (
                        <Link href={`/patients/${e.patient_id}`} className="font-bold text-sm text-blue-700 hover:underline">{e.patient_name}</Link>
                      ) : (
                        <span className="font-bold text-sm text-gray-800">{e.patient_name}</span>
                      )}
                      {e.category && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${e.category === '整体' ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'}`}>{e.category}</span>
                      )}
                      {e.ticket_type && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-semibold">{e.ticket_type}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3">
                      <span>最終来院: {e.last_visit_date || '-'}</span>
                      <span>予定日: {e.planned_date_text || '-'}</span>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(e.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-bold text-gray-800 text-base mb-3">+ 追加</h2>
          <div className="space-y-3">
            <div className="relative">
              <label className="block text-xs text-gray-500 mb-1">氏名</label>
              <input
                type="text"
                placeholder="患者名を入力"
                value={form.name}
                onChange={e => {
                  setForm(prev => ({ ...prev, name: e.target.value, patientId: '' }))
                  searchPatients(e.target.value)
                }}
                onFocus={() => { if (form.name) searchPatients(form.name) }}
                className={`${inputClass} ${form.patientId ? 'border-green-300 bg-green-50' : ''}`}
              />
              {suggestions.length > 0 && (
                <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {suggestions.map(p => (
                    <button key={p.id} onClick={() => selectSuggestion(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between items-center">
                      <span className="font-medium">{p.name}</span>
                      {p.customer_category && <span className="text-[10px] text-gray-400">{p.customer_category}</span>}
                    </button>
                  ))}
                </div>
              )}
              {form.patientId && <p className="text-[10px] text-green-600 mt-1">カルテと紐付け済み</p>}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">最終来院日</label>
              <input type="date" value={form.lastVisitDate} onChange={e => setForm(prev => ({ ...prev, lastVisitDate: e.target.value }))} className={inputClass} />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">予定日（目安）</label>
              <input type="text" placeholder="例: 9月上旬、2ヶ月後 など" value={form.plannedDateText} onChange={e => setForm(prev => ({ ...prev, plannedDateText: e.target.value }))} className={inputClass} />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">種別</label>
                <select value={form.category} onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))} className={inputClass}>
                  <option value="">選択してください</option>
                  <option value="整体">整体</option>
                  <option value="ダイエット">ダイエット</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">回数券・都度</label>
                <select value={form.ticketType} onChange={e => setForm(prev => ({ ...prev, ticketType: e.target.value }))} className={inputClass}>
                  <option value="">選択してください</option>
                  <option value="回数券">回数券</option>
                  <option value="都度">都度</option>
                </select>
              </div>
            </div>

            <button onClick={handleAdd} disabled={saving} className="w-full text-white px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50" style={{ background: '#14252A' }}>
              {saving ? '追加中...' : '+ 追加'}
            </button>
          </div>
        </div>

      </div>
    </AppShell>
  )
}
