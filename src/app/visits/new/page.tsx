'use client'

import { useEffect, useState, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import VoiceInput from '@/components/VoiceInput'
import { createClient } from '@/lib/supabase/client'
import { PAYMENT_METHODS } from '@/lib/types'
import type { Patient } from '@/lib/types'
import { getToday } from '@/lib/dateUtils'
import { normalizeName } from '@/lib/nameMatch'
import { getClinicId } from '@/lib/clinic'

interface BaseMenu {
  id: string
  name: string
  price: number
  duration_minutes: number
  is_active: boolean
  sort_order: number
}

interface OptionMenu {
  id: string
  name: string
  price: number
  duration_minutes: number
  is_active: boolean
  sort_order: number
}

function VisitForm() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedPatientId = searchParams.get('patient_id') || ''

  const [patients, setPatients] = useState<Patient[]>([])
  const [baseMenus, setBaseMenus] = useState<BaseMenu[]>([])
  const [optionMenus, setOptionMenus] = useState<OptionMenu[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [patientStats, setPatientStats] = useState<{
    lastVisitDate: string | null
    visitCount: number
    totalAmount: number
    daysSinceLastVisit: number | null
    lastMenuName: string | null
    lastMenuPrice: number | null
    lastNotes: string | null
  } | null>(null)

  const [form, setForm] = useState({
    patient_id: preselectedPatientId,
    visit_date: getToday(),
    menu_name: '',
    base_price: 0,
    option_names: [] as string[],
    option_price: 0,
    total_price: 0,
    duration_minutes: 0,
    payment_method: '現金' as string,
    staff_name: '',
    notes: '',
  })

  useEffect(() => {
    const load = async () => {
      const [patientsRes, baseMenusRes, optionMenusRes] = await Promise.all([
        supabase.from('cm_patients').select('*').eq('clinic_id', clinicId).eq('status', 'active').order('name'),
        supabase.from('cm_base_menus').select('*').eq('clinic_id', clinicId).eq('is_active', true).order('sort_order'),
        supabase.from('cm_option_menus').select('*').eq('clinic_id', clinicId).eq('is_active', true).order('sort_order'),
      ])
      setPatients(patientsRes.data || [])
      setBaseMenus(baseMenusRes.data || [])
      setOptionMenus(optionMenusRes.data || [])
    }
    load()
  }, [])

  // 患者選択時に来店統計を取得
  useEffect(() => {
    if (!form.patient_id) { setPatientStats(null); return }
    const fetchStats = async () => {
      const { data } = await supabase
        .from('cm_slips')
        .select('visit_date, total_price, menu_name, notes')
        .eq('clinic_id', clinicId)
        .eq('patient_id', form.patient_id)
        .order('visit_date', { ascending: false })
      if (!data || data.length === 0) { setPatientStats({ lastVisitDate: null, visitCount: 0, totalAmount: 0, daysSinceLastVisit: null, lastMenuName: null, lastMenuPrice: null, lastNotes: null }); return }
      const lastVisitDate = data[0].visit_date
      const totalAmount = data.reduce((sum: number, s: { total_price?: number }) => sum + (s.total_price || 0), 0)
      const daysSinceLastVisit = Math.floor((new Date().getTime() - new Date(lastVisitDate).getTime()) / 86400000)
      setPatientStats({ lastVisitDate, visitCount: data.length, totalAmount, daysSinceLastVisit, lastMenuName: data[0].menu_name || null, lastMenuPrice: data[0].total_price ?? null, lastNotes: data[0].notes || null })
    }
    fetchStats()
  }, [form.patient_id])

  const update = (key: string, value: string | number | string[]) => setForm(prev => ({ ...prev, [key]: value }))

  const filteredPatients = search.length > 0
    ? patients.filter(p => {
        const q = normalizeName(search)
        const name = normalizeName(p.name)
        const furigana = normalizeName(p.furigana || '')
        return name.includes(q) || q.includes(name) || furigana.includes(q) || q.includes(furigana)
      })
    : []

  const selectedPatient = patients.find(p => p.id === form.patient_id)

  // 基本メニュー選択
  const selectBaseMenu = (menu: BaseMenu) => {
    const newTotal = menu.price + form.option_price
    setForm(prev => ({
      ...prev,
      menu_name: menu.name,
      base_price: menu.price,
      duration_minutes: menu.duration_minutes,
      total_price: newTotal,
    }))
  }

  // オプションメニュー切り替え
  const toggleOption = (option: OptionMenu) => {
    setForm(prev => {
      const exists = prev.option_names.includes(option.name)
      const newOptions = exists
        ? prev.option_names.filter(n => n !== option.name)
        : [...prev.option_names, option.name]
      const newOptionPrice = optionMenus
        .filter(o => newOptions.includes(o.name))
        .reduce((sum, o) => sum + o.price, 0)
      return {
        ...prev,
        option_names: newOptions,
        option_price: newOptionPrice,
        total_price: prev.base_price + newOptionPrice,
      }
    })
  }

  // 音声入力で患者名を検索
  const handleVoicePatientSearch = useCallback((text: string) => {
    setSearch(text)
  }, [])

  // 音声入力でメニュー名をマッチング
  const handleVoiceMenu = useCallback((text: string) => {
    const normalized = text.replace(/\s/g, '')
    // 基本メニューからマッチング
    const match = baseMenus.find(m =>
      m.name.includes(normalized) || normalized.includes(m.name)
    )
    if (match) {
      selectBaseMenu(match)
    } else {
      // マッチしなければ手入力用にメニュー名をセット
      setForm(prev => ({ ...prev, menu_name: text }))
    }
  }, [baseMenus])

  // 音声入力で料金をセット
  const handleVoicePrice = useCallback((text: string) => {
    // 数字部分を抽出（「8000円」「はっせんえん」等に対応）
    const numMap: Record<string, string> = {
      '〇': '0', '一': '1', '二': '2', '三': '3', '四': '4',
      '五': '5', '六': '6', '七': '7', '八': '8', '九': '9',
    }
    let cleaned = text.replace(/[円えん、,\s]/g, '')
    // 漢数字を半角数字に
    Object.entries(numMap).forEach(([k, v]) => { cleaned = cleaned.replace(new RegExp(k, 'g'), v) })
    // 全角数字を半角に
    cleaned = cleaned.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    // 日本語数詞のパース
    const jpNum = parseJapaneseNumber(cleaned)
    if (jpNum > 0) {
      setForm(prev => ({ ...prev, total_price: jpNum }))
    } else {
      const num = parseInt(cleaned.replace(/[^0-9]/g, ''))
      if (!isNaN(num) && num > 0) {
        setForm(prev => ({ ...prev, total_price: num }))
      }
    }
  }, [])

  // 音声入力でメモをセット
  const handleVoiceNotes = useCallback((text: string) => {
    setForm(prev => ({ ...prev, notes: prev.notes ? prev.notes + ' ' + text : text }))
  }, [])

  const handleSave = async () => {
    if (!form.patient_id || !form.visit_date) return
    setSaving(true)

    const patientName = selectedPatient?.name || ''

    // cm_slipsに保存（売上データ）
    const { error } = await supabase.from('cm_slips').insert({
      clinic_id: clinicId,
      patient_id: form.patient_id,
      patient_name: patientName,
      visit_date: form.visit_date,
      menu_name: form.menu_name,
      base_price: form.base_price,
      option_names: form.option_names.join(', '),
      option_price: form.option_price,
      total_price: form.total_price,
      payment_method: form.payment_method,
      staff_name: form.staff_name,
      duration_minutes: form.duration_minutes,
      notes: form.notes,
    })

    if (!error) {
      // 患者のupdated_atを更新
      await supabase.from('cm_patients').update({ updated_at: new Date().toISOString() }).eq('id', form.patient_id)

      setSaved(true)
      setTimeout(() => {
        router.push(`/patients/${form.patient_id}`)
      }, 800)
    }
    setSaving(false)
  }

  const inputClass = "w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A] focus:border-transparent"

  if (saved) {
    return (
      <div className="px-4 py-16 text-center">
        <div className="text-5xl mb-4">&#10003;</div>
        <p className="font-bold text-lg text-gray-800">保存しました</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 max-w-lg mx-auto space-y-4">

      {/* 1. 患者選択 */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-3 border-b pb-2">
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: '#14252A' }}>1</span>
          <h3 className="font-bold text-gray-800 text-sm">患者を選択</h3>
        </div>

        {selectedPatient ? (
          <div className="space-y-2">
            {/* 氏名・変更ボタン */}
            <div className="flex justify-between items-center bg-blue-50 rounded-lg px-3 py-2">
              <div>
                <p className="font-bold text-sm">{selectedPatient.name}</p>
                <p className="text-xs text-gray-500">{selectedPatient.furigana}</p>
              </div>
              <button onClick={() => { update('patient_id', ''); setSearch(''); setPatientStats(null) }} className="text-xs text-red-500 font-medium">変更</button>
            </div>
            {/* 顧客情報パネル */}
            {patientStats && (
              <div className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-2 text-xs">
                {/* 最終来院 */}
                <div className="flex items-center gap-2">
                  {patientStats.lastVisitDate ? (
                    <>
                      <span className={`font-bold px-2 py-0.5 rounded-full text-white text-[11px] ${
                        patientStats.daysSinceLastVisit !== null && patientStats.daysSinceLastVisit >= 30
                          ? 'bg-red-500' : patientStats.daysSinceLastVisit !== null && patientStats.daysSinceLastVisit >= 14
                          ? 'bg-orange-400' : 'bg-green-500'
                      }`}>
                        最終来院から{patientStats.daysSinceLastVisit}日経過
                      </span>
                      <span className="text-gray-500">{patientStats.lastVisitDate}</span>
                    </>
                  ) : (
                    <span className="text-gray-400">来院記録なし</span>
                  )}
                </div>
                {/* 統計 */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white rounded-lg py-1.5">
                    <p className="font-bold text-gray-800">{patientStats.visitCount}</p>
                    <p className="text-gray-400 text-[10px]">来店数</p>
                  </div>
                  <div className="bg-white rounded-lg py-1.5">
                    <p className="font-bold text-gray-800">{patientStats.visitCount > 0 ? Math.round(patientStats.totalAmount / patientStats.visitCount).toLocaleString() : 0}</p>
                    <p className="text-gray-400 text-[10px]">平均単価</p>
                  </div>
                  <div className="bg-white rounded-lg py-1.5">
                    <p className="font-bold text-gray-800">{patientStats.totalAmount.toLocaleString()}</p>
                    <p className="text-gray-400 text-[10px]">合計金額</p>
                  </div>
                </div>
                {/* 基本情報 */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-gray-600">
                  {selectedPatient.gender && <span>性別: {selectedPatient.gender}</span>}
                  {selectedPatient.phone && <span>📞 {selectedPatient.phone}</span>}
                  {selectedPatient.address && <span className="truncate max-w-full">🏠 {selectedPatient.address}</span>}
                </div>
                {/* 前回の施術内容 */}
                {patientStats.lastMenuName && (
                  <div className="bg-white rounded-lg px-3 py-2 space-y-0.5">
                    <p className="text-[10px] text-gray-400 font-medium">前回の施術</p>
                    <div className="flex items-center justify-between">
                      <p className="text-gray-800 font-medium">{patientStats.lastMenuName}</p>
                      {patientStats.lastMenuPrice !== null && (
                        <p className="text-gray-600">{patientStats.lastMenuPrice.toLocaleString()}円</p>
                      )}
                    </div>
                    {patientStats.lastNotes && (
                      <p className="text-gray-500 text-[11px] leading-snug">{patientStats.lastNotes}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            <div className="flex gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="患者名で検索（音声OK）"
                className={`${inputClass} flex-1`}
              />
              <VoiceInput onResult={handleVoicePatientSearch} size="md" />
            </div>
            {search.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg mt-1 shadow-lg z-10 max-h-48 overflow-y-auto">
                {filteredPatients.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-400 text-center">該当なし</p>
                ) : filteredPatients.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { update('patient_id', p.id); setSearch('') }}
                    className="block w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-100"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{p.furigana}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. 来店日 */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-3 border-b pb-2">
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: '#14252A' }}>2</span>
          <h3 className="font-bold text-gray-800 text-sm">来店日</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => update('visit_date', getToday())}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
              form.visit_date === getToday()
                ? 'border-[#14252A] bg-[#14252A] text-white'
                : 'border-gray-200 text-gray-600'
            }`}
          >
            今日
          </button>
          <input
            type="date"
            value={form.visit_date}
            onChange={(e) => update('visit_date', e.target.value)}
            className={`${inputClass} flex-1`}
          />
        </div>
      </div>

      {/* 3. 施術メニュー */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: '#14252A' }}>3</span>
            <h3 className="font-bold text-gray-800 text-sm">施術メニュー</h3>
          </div>
          <VoiceInput onResult={handleVoiceMenu} size="sm" />
        </div>

        {/* 基本メニュー */}
        {baseMenus.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">基本メニュー</p>
            <div className="flex flex-wrap gap-2">
              {baseMenus.map(m => (
                <button
                  key={m.id}
                  onClick={() => selectBaseMenu(m)}
                  className={`px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all min-w-[100px] ${
                    form.menu_name === m.name
                      ? 'border-[#14252A] bg-[#14252A] text-white shadow-md'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  {m.name}
                  <span className="block text-[10px] opacity-75 mt-0.5">{m.price.toLocaleString()}円 / {m.duration_minutes}分</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* オプションメニュー */}
        {optionMenus.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">オプション</p>
            <div className="flex flex-wrap gap-2">
              {optionMenus.map(o => (
                <button
                  key={o.id}
                  onClick={() => toggleOption(o)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                    form.option_names.includes(o.name)
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {o.name}
                  <span className="block text-[10px] opacity-75">+{o.price.toLocaleString()}円</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* メニュー名手入力（マスターにない場合） */}
        {baseMenus.length === 0 && (
          <div>
            <label className="block text-xs text-gray-600 mb-1">メニュー名</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.menu_name}
                onChange={(e) => update('menu_name', e.target.value)}
                placeholder="施術メニュー名"
                className={`${inputClass} flex-1`}
              />
            </div>
          </div>
        )}

        {form.menu_name && (
          <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-600">
            選択中: <span className="font-bold text-gray-800">{form.menu_name}</span>
            {form.option_names.length > 0 && (
              <span className="ml-1">+ {form.option_names.join(', ')}</span>
            )}
          </div>
        )}
      </div>

      {/* 4. 料金 */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: '#14252A' }}>4</span>
            <h3 className="font-bold text-gray-800 text-sm">料金</h3>
          </div>
          <VoiceInput onResult={handleVoicePrice} size="sm" />
        </div>

        <div className="text-center py-2">
          <p className="text-3xl font-bold" style={{ color: '#14252A' }}>
            {form.total_price.toLocaleString()}<span className="text-lg">円</span>
          </p>
          {form.base_price > 0 && form.option_price > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              基本 {form.base_price.toLocaleString()}円 + オプション {form.option_price.toLocaleString()}円
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">金額を直接入力</label>
          <input
            type="number"
            value={form.total_price || ''}
            onChange={(e) => update('total_price', parseInt(e.target.value) || 0)}
            placeholder="8000"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">支払方法</label>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map(m => (
              <button
                key={m}
                onClick={() => update('payment_method', m)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                  form.payment_method === m
                    ? 'border-[#14252A] bg-[#14252A] text-white'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* メモ（任意） */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-bold text-gray-800 text-sm">メモ（任意）</h3>
          <VoiceInput onResult={handleVoiceNotes} size="sm" />
        </div>
        <textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          className={inputClass}
          rows={2}
          placeholder="特記事項があれば..."
        />
      </div>

      {/* 保存ボタン */}
      <button
        onClick={handleSave}
        disabled={saving || !form.patient_id}
        className="w-full text-white py-4 rounded-xl font-bold text-base disabled:opacity-50 shadow-lg transition-all active:scale-95"
        style={{ background: '#14252A' }}
      >
        {saving ? '保存中...' : '記録を保存する'}
      </button>

      {/* 入力サマリー */}
      {form.patient_id && (
        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-1">
          <p>患者: <span className="text-gray-800 font-medium">{selectedPatient?.name}</span></p>
          <p>来店日: <span className="text-gray-800 font-medium">{form.visit_date}</span></p>
          <p>メニュー: <span className="text-gray-800 font-medium">{form.menu_name || '未選択'}{form.option_names.length > 0 ? ` + ${form.option_names.join(', ')}` : ''}</span></p>
          <p>料金: <span className="text-gray-800 font-medium">{form.total_price.toLocaleString()}円</span></p>
        </div>
      )}
    </div>
  )
}

/** 日本語の数詞をパース（例: 「はっせん」→8000, 「ろくせんごひゃく」→6500） */
function parseJapaneseNumber(text: string): number {
  const units: Record<string, number> = {
    'まん': 10000, '万': 10000,
    'せん': 1000, 'ぜん': 1000, '千': 1000,
    'ひゃく': 100, 'びゃく': 100, 'ぴゃく': 100, '百': 100,
    'じゅう': 10, 'じゅ': 10, '十': 10,
  }

  const nums: Record<string, number> = {
    'いち': 1, 'に': 2, 'さん': 3, 'し': 4, 'よん': 4,
    'ご': 5, 'ろく': 6, 'なな': 7, 'しち': 7, 'はち': 8, 'はっ': 8,
    'きゅう': 9, 'く': 9, 'いっ': 1, 'にっ': 2, 'ろっ': 6,
  }

  // 簡易的なパース
  let result = 0
  let current = 0
  let remaining = text

  // まず直接数字があればそれを返す
  const directNum = parseInt(text.replace(/[^0-9]/g, ''))
  if (!isNaN(directNum) && directNum > 0) return directNum

  // 数詞のパース
  for (const [unitWord, unitValue] of Object.entries(units).sort((a, b) => b[1] - a[1])) {
    const idx = remaining.indexOf(unitWord)
    if (idx >= 0) {
      const before = remaining.slice(0, idx)
      let multiplier = 1
      for (const [numWord, numValue] of Object.entries(nums)) {
        if (before.endsWith(numWord)) {
          multiplier = numValue
          break
        }
      }
      result += multiplier * unitValue
      remaining = remaining.slice(idx + unitWord.length)
    }
  }

  // 残りの数字
  for (const [numWord, numValue] of Object.entries(nums)) {
    if (remaining.includes(numWord)) {
      result += numValue
    }
  }

  return result
}

export default function NewVisitPage() {
  return (
    <AppShell>
      <Header title="施術記録" />
      <Suspense fallback={<p className="text-center py-8 text-gray-400">読み込み中...</p>}>
        <VisitForm />
      </Suspense>
    </AppShell>
  )
}
