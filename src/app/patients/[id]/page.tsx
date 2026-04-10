'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'
import type { Patient, Slip } from '@/lib/types'
import { REFERRAL_SOURCES, PREFECTURES } from '@/lib/types'

export default function PatientDetailPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [patient, setPatient] = useState<Patient | null>(null)
  const [slips, setSlips] = useState<Slip[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Patient>>({})
  const [loading, setLoading] = useState(true)
  const [showAllSlips, setShowAllSlips] = useState(false)
  const [editingSlip, setEditingSlip] = useState<string | null>(null)
  const [slipForm, setSlipForm] = useState<Partial<Slip>>({})
  const [statusEditing, setStatusEditing] = useState(false)
  const [statusForm, setStatusForm] = useState<{ status: string; status_date: string; status_reason: string }>({ status: 'active', status_date: '', status_reason: '' })

  useEffect(() => {
    const load = async () => {
      const { data: p } = await supabase.from('cm_patients').select('*').eq('clinic_id', clinicId).eq('id', id).single()
      if (p) {
        setPatient(p)
        setForm(p)
        setStatusForm({
          status: p.status || 'active',
          status_date: p.status_date || '',
          status_reason: p.status_reason || '',
        })
      }
      const { data: s } = await supabase.from('cm_slips').select('*').eq('clinic_id', clinicId).eq('patient_id', id).order('visit_date', { ascending: false })
      setSlips(s || [])
      setLoading(false)
    }
    load()
  }, [id])

  const handleUpdate = async () => {
    await supabase.from('cm_patients').update(form).eq('id', id)
    setPatient({ ...patient!, ...form })
    setEditing(false)
  }

  const handleStatusUpdate = async () => {
    const update: Record<string, string | null> = {
      status: statusForm.status,
      status_date: statusForm.status_date || null,
      status_reason: statusForm.status_reason || '',
    }
    const { error } = await supabase.from('cm_patients').update(update).eq('id', id)
    if (error) { alert('更新失敗: ' + error.message); return }
    setPatient({ ...patient!, ...update } as Patient)
    setStatusEditing(false)
  }

  const handleDelete = async () => {
    if (!confirm('この患者を削除しますか？')) return
    await supabase.from('cm_patients').delete().eq('id', id)
    router.push('/patients')
  }

  const handleSlipEdit = (slip: Slip) => {
    setEditingSlip(slip.id)
    setSlipForm({ ...slip })
  }

  const handleSlipUpdate = async () => {
    if (!editingSlip) return
    const { id: _id, created_at: _c, ...updateData } = slipForm as Slip
    await supabase.from('cm_slips').update(updateData).eq('id', editingSlip)
    setSlips(slips.map(s => s.id === editingSlip ? { ...s, ...slipForm } : s))
    setEditingSlip(null)
  }

  const handleSlipDelete = async (slipId: string) => {
    if (!confirm('この伝票を削除しますか？')) return
    await supabase.from('cm_slips').delete().eq('id', slipId)
    setSlips(slips.filter(s => s.id !== slipId))
    setEditingSlip(null)
  }

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A]"

  if (loading) return <AppShell><Header title="患者詳細" /><p className="text-center py-8 text-gray-400">読み込み中...</p></AppShell>
  if (!patient) return <AppShell><Header title="患者詳細" /><p className="text-center py-8 text-gray-400">患者が見つかりません</p></AppShell>

  const age = patient.birth_date
    ? Math.floor((Date.now() - new Date(patient.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  // cm_slipsから一貫して計算（重複なし）
  const visitCount = slips.length
  const ltvValue = slips.reduce((sum, s) => sum + (s.total_price || 0), 0)
  const avgPrice = visitCount > 0 ? Math.round(ltvValue / visitCount) : 0

  const firstVisit = slips.length > 0 ? slips[slips.length - 1].visit_date : patient.first_visit_date
  const lastVisit = slips.length > 0 ? slips[0].visit_date : patient.last_visit_date
  const daysSince = lastVisit
    ? Math.floor((Date.now() - new Date(lastVisit).getTime()) / (24 * 60 * 60 * 1000))
    : null

  const fullAddress = [patient.prefecture, patient.city, patient.address, patient.building].filter(Boolean).join('')

  const displaySlips = showAllSlips ? slips : slips.slice(0, 10)

  return (
    <AppShell>
      <Header title="患者詳細" />
      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">

        {/* 患者基本情報 */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">{patient.name}</h2>
              {patient.furigana && <p className="text-xs text-gray-400 mt-0.5">{patient.furigana}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {patient.customer_category === '整体' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold">整体</span>
              )}
              {patient.customer_category === 'ダイエット' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">ダイエット</span>
              )}
              {patient.is_direct_mail && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">DM可</span>
              )}
              <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${
                patient.status === 'active' ? 'bg-green-100 text-green-700 border border-green-200' :
                patient.status === 'completed' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                'bg-gray-100 text-gray-500 border border-gray-200'
              }`}>
                {patient.status === 'active' ? '通院中' : patient.status === 'completed' ? '卒業' : '休止'}
              </span>
            </div>
          </div>

          {!editing ? (
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {age !== null && <p><span className="text-gray-500">🎂 年齢:</span> {age}歳</p>}
                {patient.gender && <p><span className="text-gray-500">👤 性別:</span> {patient.gender}</p>}
                {patient.birth_date && <p><span className="text-gray-500">📅 生年月日:</span> {patient.birth_date}</p>}
                {patient.phone && <p><span className="text-gray-500">📱 TEL:</span> <a href={`tel:${patient.phone}`} className="text-blue-600 underline">{patient.phone}</a></p>}
                {patient.email && <p className="col-span-2"><span className="text-gray-500">✉️ Email:</span> <a href={`mailto:${patient.email}`} className="text-blue-600 underline">{patient.email}</a></p>}
              </div>

              {(patient.zipcode || fullAddress) && (
                <div className="border-t pt-2 mt-2">
                  {patient.zipcode && <p><span className="text-gray-500">〒</span> {patient.zipcode}</p>}
                  {fullAddress && <p><span className="text-gray-500">📍 住所:</span> {fullAddress}</p>}
                </div>
              )}

              <div className="border-t pt-2 mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                {patient.occupation && <p><span className="text-gray-500">💼 職業:</span> {patient.occupation}</p>}
                {patient.referral_source && <p><span className="text-gray-500">🔍 来院経路:</span> {patient.referral_source}</p>}
                {patient.visit_motive && <p><span className="text-gray-500">💡 来店動機:</span> {patient.visit_motive}</p>}
                {patient.customer_category && <p><span className="text-gray-500">🏷️ 顧客区分:</span> {patient.customer_category}</p>}
              </div>

              {patient.chief_complaint && (
                <div className="mt-2 bg-yellow-50 rounded-lg p-3">
                  <p className="text-xs font-bold text-yellow-700 mb-1">主訴</p>
                  <p className="text-sm text-gray-700">{patient.chief_complaint}</p>
                </div>
              )}
              {patient.medical_history && (
                <div className="mt-2 bg-red-50 rounded-lg p-3">
                  <p className="text-xs font-bold text-red-700 mb-1">既往歴</p>
                  <p className="text-sm text-gray-700">{patient.medical_history}</p>
                </div>
              )}

              {/* LINE情報 */}
              {(patient.line_date || patient.line_count > 0) && (
                <div className="mt-2 bg-green-50 rounded-lg p-3">
                  <p className="text-xs font-bold text-green-700 mb-1">LINE</p>
                  <div className="flex gap-4 text-sm">
                    {patient.line_date && <p><span className="text-gray-500">連携日:</span> {patient.line_date}</p>}
                    {patient.line_count > 0 && <p><span className="text-gray-500">配信回数:</span> {patient.line_count}回</p>}
                  </div>
                </div>
              )}

              {patient.notes && (
                <div className="mt-2 bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-bold text-gray-500 mb-1">メモ</p>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap">{patient.notes}</p>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button onClick={() => setEditing(true)} className="flex-1 text-sm py-2 border border-gray-300 rounded-lg text-gray-600">編集</button>
                <button onClick={handleDelete} className="text-sm py-2 px-4 text-red-500 border border-red-200 rounded-lg">削除</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">基本情報</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">氏名</label>
                  <input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">ふりがな</label>
                  <input value={form.furigana || ''} onChange={e => setForm({...form, furigana: e.target.value})} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">生年月日</label>
                  <input type="date" value={form.birth_date || ''} onChange={e => setForm({...form, birth_date: e.target.value})} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">性別</label>
                  <select value={form.gender || '男性'} onChange={e => setForm({...form, gender: e.target.value as Patient['gender']})} className={inputClass}>
                    <option value="男性">男性</option>
                    <option value="女性">女性</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
              </div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider pt-2 border-t mt-1">連絡先</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">電話番号</label>
                  <input value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">メール</label>
                  <input value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} className={inputClass} />
                </div>
              </div>

              <div className="border-t pt-2">
                <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">住所</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">郵便番号</label>
                    <input value={form.zipcode || ''} onChange={e => setForm({...form, zipcode: e.target.value})} placeholder="000-0000" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">都道府県</label>
                    <select value={form.prefecture || ''} onChange={e => setForm({...form, prefecture: e.target.value})} className={inputClass}>
                      <option value="">選択</option>
                      {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">市区町村</label>
                  <input value={form.city || ''} onChange={e => setForm({...form, city: e.target.value})} className={inputClass} />
                </div>
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">番地</label>
                  <input value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} className={inputClass} />
                </div>
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">建物名・部屋番号</label>
                  <input value={form.building || ''} onChange={e => setForm({...form, building: e.target.value})} className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">患者区分</label>
                <div className="flex gap-2">
                  {['整体', 'ダイエット'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm({...form, customer_category: form.customer_category === type ? '' : type})}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                        form.customer_category === type
                          ? type === '整体'
                            ? 'bg-teal-600 border-teal-600 text-white'
                            : 'bg-orange-500 border-orange-500 text-white'
                          : 'border-gray-300 text-gray-500 bg-white'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">職業</label>
                  <input value={form.occupation || ''} onChange={e => setForm({...form, occupation: e.target.value})} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">来院経路</label>
                  <select value={form.referral_source || ''} onChange={e => setForm({...form, referral_source: e.target.value})} className={inputClass}>
                    <option value="">選択</option>
                    {REFERRAL_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">予約媒体</label>
                  <select value={form.booking_channel || ''} onChange={e => setForm({...form, booking_channel: e.target.value})} className={inputClass}>
                    <option value="">選択</option>
                    <option value="LINE">LINE</option>
                    <option value="電話">電話</option>
                    <option value="ホットペッパー">ホットペッパー</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">主訴</label>
                <textarea value={form.chief_complaint || ''} onChange={e => setForm({...form, chief_complaint: e.target.value})} className={inputClass} rows={2} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">既往歴</label>
                <textarea value={form.medical_history || ''} onChange={e => setForm({...form, medical_history: e.target.value})} className={inputClass} rows={2} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">ステータス</label>
                  <select value={form.status || 'active'} onChange={e => setForm({...form, status: e.target.value as Patient['status']})} className={inputClass}>
                    <option value="active">通院中</option>
                    <option value="inactive">休止</option>
                    <option value="completed">卒業</option>
                  </select>
                </div>
                <div className="flex items-end gap-3 pb-2">
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={form.is_direct_mail ?? true} onChange={e => setForm({...form, is_direct_mail: e.target.checked})} />
                    DM可
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={form.is_enabled ?? true} onChange={e => setForm({...form, is_enabled: e.target.checked})} />
                    有効
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">メモ</label>
                <textarea value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} className={inputClass} rows={2} />
              </div>

              <div className="flex gap-2">
                <button onClick={handleUpdate} className="flex-1 text-white py-2 rounded-lg text-sm font-bold" style={{ background: '#14252A' }}>保存</button>
                <button onClick={() => { setEditing(false); setForm(patient) }} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">キャンセル</button>
              </div>
            </div>
          )}
        </div>

        {/* 施術サマリー */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl shadow-sm p-4 text-center border-t-4" style={{ borderTopColor: '#14252A' }}>
            <p className="text-2xl font-bold" style={{ color: '#14252A' }}>{visitCount}</p>
            <p className="text-xs text-gray-500 mt-1">来院回数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center border-t-4 border-t-blue-500">
            <p className="text-2xl font-bold text-blue-600">{ltvValue.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">LTV(円)</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center border-t-4 border-t-green-500">
            <p className="text-2xl font-bold text-green-600">{avgPrice.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">平均単価(円)</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center border-t-4 border-t-orange-500">
            <p className="text-2xl font-bold text-orange-600">{daysSince !== null && daysSince !== undefined ? daysSince : '-'}</p>
            <p className="text-xs text-gray-500 mt-1">最終来院(日前)</p>
          </div>
        </div>

        {/* 卒業 / 離脱 ステータス管理 */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-800 text-sm">📋 通院ステータス</h3>
            {!statusEditing && (
              <button onClick={() => setStatusEditing(true)} className="text-xs px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">変更</button>
            )}
          </div>

          {!statusEditing ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                  patient.status === 'active' ? 'bg-green-100 text-green-700' :
                  patient.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {patient.status === 'active' ? '通院中' : patient.status === 'completed' ? '卒業' : '離脱'}
                </span>
                {patient.status_date && (
                  <span className="text-xs text-gray-500">{patient.status_date}</span>
                )}
              </div>
              {patient.status_reason && (
                <p className="text-xs text-gray-600 mt-2 p-2 bg-gray-50 rounded">{patient.status_reason}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: 'active', label: '通院中', color: 'bg-green-100 text-green-700 border-green-300' },
                  { v: 'completed', label: '卒業', color: 'bg-blue-100 text-blue-700 border-blue-300' },
                  { v: 'inactive', label: '離脱', color: 'bg-red-100 text-red-700 border-red-300' },
                ].map(opt => (
                  <button key={opt.v}
                    onClick={() => setStatusForm({ ...statusForm, status: opt.v })}
                    className={`px-2 py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${
                      statusForm.status === opt.v ? opt.color : 'bg-white text-gray-400 border-gray-200'
                    }`}
                  >{opt.label}</button>
                ))}
              </div>

              {statusForm.status !== 'active' && (
                <>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">{statusForm.status === 'completed' ? '卒業日' : '離脱日'}</label>
                    <input type="date" value={statusForm.status_date}
                      onChange={e => setStatusForm({ ...statusForm, status_date: e.target.value })}
                      className={inputClass} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">理由・メモ</label>
                    <textarea value={statusForm.status_reason}
                      onChange={e => setStatusForm({ ...statusForm, status_reason: e.target.value })}
                      placeholder={statusForm.status === 'completed' ? '目標達成、コース完了など' : '通院困難、転居、料金面など'}
                      rows={3}
                      className={inputClass} />
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <button onClick={handleStatusUpdate}
                  className="flex-1 py-2 rounded-xl text-white text-sm font-bold" style={{ background: '#14252A' }}>
                  保存
                </button>
                <button onClick={() => { setStatusEditing(false); setStatusForm({ status: patient.status || 'active', status_date: patient.status_date || '', status_reason: patient.status_reason || '' }) }}
                  className="px-4 py-2 rounded-xl text-sm border border-gray-200 text-gray-600">
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 来院期間 */}
        {firstVisit && (
          <div className="bg-white rounded-xl shadow-sm p-3">
            <div className="flex justify-between text-xs text-gray-500">
              <span>初回来院: {firstVisit}</span>
              <span>最終来院: {lastVisit}</span>
            </div>
          </div>
        )}

        {/* 施術記録ボタン */}
        <Link
          href={`/visits/new?patient_id=${id}`}
          className="block w-full bg-blue-600 text-white text-center py-3 rounded-xl font-bold text-sm"
        >
          + この患者の施術記録を追加
        </Link>

        {/* 来院・売上履歴（cm_slips） */}
        {slips.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-bold text-gray-800 mb-3">来院・売上履歴 <span className="text-xs text-gray-400 font-normal">（全{visitCount}件）</span></h3>

            {/* 伝票編集モーダル */}
            {editingSlip && (
              <div className="bg-blue-50 rounded-xl p-4 mb-3 border border-blue-200">
                <p className="text-xs font-bold text-gray-700 mb-3">伝票を編集</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">来院日</label>
                    <input type="date" value={slipForm.visit_date || ''} onChange={e => setSlipForm({...slipForm, visit_date: e.target.value})} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">担当</label>
                    <input value={slipForm.staff_name || ''} onChange={e => setSlipForm({...slipForm, staff_name: e.target.value})} className={inputClass} />
                  </div>
                </div>
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">メニュー名</label>
                  <input value={slipForm.menu_name || ''} onChange={e => setSlipForm({...slipForm, menu_name: e.target.value})} className={inputClass} />
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">基本料金</label>
                    <input type="number" value={slipForm.base_price ?? 0} onChange={e => {
                      const base = parseInt(e.target.value) || 0
                      setSlipForm({...slipForm, base_price: base, total_price: base + (slipForm.option_price || 0) - (slipForm.discount || 0)})
                    }} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">オプション</label>
                    <input type="number" value={slipForm.option_price ?? 0} onChange={e => {
                      const opt = parseInt(e.target.value) || 0
                      setSlipForm({...slipForm, option_price: opt, total_price: (slipForm.base_price || 0) + opt - (slipForm.discount || 0)})
                    }} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">割引</label>
                    <input type="number" value={slipForm.discount ?? 0} onChange={e => {
                      const disc = parseInt(e.target.value) || 0
                      setSlipForm({...slipForm, discount: disc, total_price: (slipForm.base_price || 0) + (slipForm.option_price || 0) - disc})
                    }} className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">合計金額</label>
                    <input type="number" value={slipForm.total_price ?? 0} onChange={e => setSlipForm({...slipForm, total_price: parseInt(e.target.value) || 0})} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">支払方法</label>
                    <select value={slipForm.payment_method || '現金'} onChange={e => setSlipForm({...slipForm, payment_method: e.target.value})} className={inputClass}>
                      <option value="現金">現金</option>
                      <option value="カード">カード</option>
                      <option value="QR決済">QR決済</option>
                      <option value="回数券">回数券</option>
                      <option value="その他">その他</option>
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-xs text-gray-500 mb-1">メモ</label>
                  <input value={slipForm.notes || ''} onChange={e => setSlipForm({...slipForm, notes: e.target.value})} className={inputClass} />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSlipUpdate} className="flex-1 text-white py-2 rounded-lg text-xs font-bold" style={{ background: '#14252A' }}>保存</button>
                  <button onClick={() => setEditingSlip(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-xs text-gray-600">キャンセル</button>
                  <button onClick={() => handleSlipDelete(editingSlip)} className="py-2 px-3 text-red-500 border border-red-200 rounded-lg text-xs">削除</button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="text-left py-1 pr-2">#</th>
                    <th className="text-left py-1 pr-2">日付</th>
                    <th className="text-right py-1 pr-2">基本</th>
                    <th className="text-right py-1 pr-2">OP</th>
                    <th className="text-right py-1 font-bold">合計</th>
                    <th className="text-center py-1 pl-1 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {displaySlips.map((s, i) => (
                    <tr key={s.id} className={`border-b border-gray-100 ${editingSlip === s.id ? 'bg-blue-50' : i % 2 === 1 ? 'bg-gray-50/50' : ''} hover:bg-blue-50/30`}>
                      <td className="py-2 pr-2 text-gray-400">{slips.length - slips.indexOf(s)}</td>
                      <td className="py-2 pr-2">
                        {new Date(s.visit_date + 'T00:00:00').toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-2 pr-2 text-right">{s.base_price > 0 ? `￥${s.base_price.toLocaleString()}` : '-'}</td>
                      <td className="py-2 pr-2 text-right">{s.option_price > 0 ? `￥${s.option_price.toLocaleString()}` : '-'}</td>
                      <td className="py-2 text-right font-bold">{s.total_price > 0 ? `￥${s.total_price.toLocaleString()}` : '￥0'}</td>
                      <td className="py-2 pl-1 text-center">
                        <button onClick={() => handleSlipEdit(s)} className="text-gray-400 hover:text-blue-600 text-xs">✏️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {slips.length > 10 && !showAllSlips && (
              <button
                onClick={() => setShowAllSlips(true)}
                className="w-full mt-2 text-xs text-blue-600 py-2 border border-blue-200 rounded-lg"
              >
                すべて表示（残り{slips.length - 10}件）
              </button>
            )}
            {showAllSlips && slips.length > 10 && (
              <button
                onClick={() => setShowAllSlips(false)}
                className="w-full mt-2 text-xs text-gray-500 py-2 border border-gray-200 rounded-lg"
              >
                折りたたむ
              </button>
            )}
          </div>
        )}

        {slips.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-gray-400 text-sm text-center py-2">来院履歴がありません</p>
          </div>
        )}
      </div>
    </AppShell>
  )
}
