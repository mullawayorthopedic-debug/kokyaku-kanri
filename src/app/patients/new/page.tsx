'use client'

import { useState, useRef, useCallback } from 'react'

function getEra(year: number): string {
  if (year >= 2019) return `令和${year - 2018}年`
  if (year >= 1989) return `平成${year - 1988}年`
  if (year >= 1926) return `昭和${year - 1925}年`
  if (year >= 1912) return `大正${year - 1911}年`
  return `明治${year - 1867}年`
}
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'
import { REFERRAL_SOURCES, PREFECTURES } from '@/lib/types'

export default function NewPatientPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [voiceText, setVoiceText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [listening, setListening] = useState(false)
  const [parseError, setParseError] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [form, setForm] = useState({
    name: '', furigana: '', birth_date: '', gender: '男性',
    phone: '', email: '',
    zipcode: '', prefecture: '', city: '', address: '', building: '',
    occupation: '',
    referral_source: '', booking_channel: '', visit_motive: '', customer_category: '',
    chief_complaint: '', medical_history: '', notes: '',
    is_direct_mail: true, is_enabled: true,
  })

  const update = (key: string, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }))

  const handleZipcodeChange = async (value: string) => {
    update('zipcode', value)
    const digits = value.replace(/[^0-9]/g, '')
    if (digits.length === 7) {
      try {
        const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`)
        const data = await res.json()
        if (data.results?.[0]) {
          const r = data.results[0]
          setForm(prev => ({
            ...prev,
            zipcode: value,
            prefecture: r.address1 || prev.prefecture,
            city: (r.address2 || '') + (r.address3 || '') || prev.city,
          }))
        }
      } catch { /* ignore */ }
    }
  }

  // 音声入力
  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      alert('お使いのブラウザは音声入力に対応していません')
      return
    }

    const recognition = new SR()
    recognition.lang = 'ja-JP'
    recognition.continuous = true
    recognition.interimResults = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript
        }
      }
      if (transcript) {
        setVoiceText(prev => prev ? prev + '\n' + transcript : transcript)
      }
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [listening])

  // AI解析して各項目に自動振り分け
  const handleParse = async () => {
    if (!voiceText.trim()) return
    setParsing(true)
    setParseError('')

    try {
      const res = await fetch('/api/parse-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: voiceText }),
      })
      const data = await res.json()

      if (!res.ok) {
        setParseError(data.error || '解析に失敗しました')
      } else if (data.patient) {
        const p = data.patient
        setForm(prev => ({
          ...prev,
          name: p.name || prev.name,
          furigana: p.furigana || prev.furigana,
          birth_date: p.birth_date || prev.birth_date,
          gender: p.gender || prev.gender,
          phone: p.phone || prev.phone,
          email: p.email || prev.email,
          zipcode: p.zipcode || prev.zipcode,
          prefecture: p.prefecture || prev.prefecture,
          city: p.city || prev.city,
          address: p.address || prev.address,
          building: p.building || prev.building,
          occupation: p.occupation || prev.occupation,
          referral_source: p.referral_source || prev.referral_source,
          chief_complaint: p.chief_complaint || prev.chief_complaint,
          medical_history: p.medical_history || prev.medical_history,
        }))
      }
    } catch {
      setParseError('通信エラーが発生しました')
    }
    setParsing(false)
  }

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)

    // 最大chart_noを取得して+1を自動採番
    const { data: maxData } = await supabase
      .from('cm_patients')
      .select('chart_no')
      .eq('clinic_id', clinicId)
      .not('chart_no', 'is', null)
      .order('chart_no', { ascending: false })
      .limit(1)
    const nextChartNo = maxData && maxData[0]?.chart_no ? maxData[0].chart_no + 1 : 1

    const { error } = await supabase.from('cm_patients').insert({
      ...form,
      chart_no: nextChartNo,
      status: 'active',
      clinic_id: clinicId,
    })
    if (!error) {
      setSaved(true)
      setTimeout(() => router.push('/patients'), 800)
    }
    setSaving(false)
  }

  const inputClass = "w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A] focus:border-transparent"

  if (saved) {
    return (
      <AppShell>
        <Header title="新規患者登録" />
        <div className="px-4 py-16 text-center">
          <div className="text-5xl mb-4">&#10003;</div>
          <p className="font-bold text-lg text-gray-800">登録しました</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Header title="新規患者登録" />
      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">

        {/* 音声一括入力エリア */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="font-bold text-gray-800 text-sm">まとめて音声入力</h3>
          <p className="text-xs text-gray-500">
            例:「山田花子さん、やまだはなこ、女性、昭和55年6月10日生まれ、電話番号090-1234-5678、大阪府住吉区長居、腰痛と肩こりで来院、Googleマップで検索して来ました、職業は主婦です」
          </p>

          <textarea
            value={voiceText}
            onChange={(e) => setVoiceText(e.target.value)}
            placeholder="ここにテキスト入力、または音声ボタンで話してください..."
            className="w-full px-3 py-3 border border-blue-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A] min-h-[80px] resize-y bg-white"
            rows={3}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={toggleVoice}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                listening
                  ? 'bg-red-500 text-white animate-pulse shadow-lg'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
              {listening ? '録音中...' : '音声入力'}
            </button>

            <button
              onClick={handleParse}
              disabled={parsing || !voiceText.trim()}
              className="flex-1 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
              style={{ background: '#14252A' }}
            >
              {parsing ? '解析中...' : '各項目に自動反映'}
            </button>
          </div>

          {parseError && (
            <p className="text-xs text-red-600">{parseError}</p>
          )}
        </div>

        {/* 基本情報 */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <h3 className="font-bold text-gray-800 text-sm border-b pb-2">基本情報</h3>

          <div>
            <label className="block text-xs text-gray-600 mb-1">氏名 *</label>
            <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} className={inputClass} placeholder="大口 太郎" />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">ふりがな</label>
            <input type="text" value={form.furigana} onChange={(e) => update('furigana', e.target.value)} className={inputClass} placeholder="おおぐち たろう" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">生年月日</label>
              {(() => {
                const parts = form.birth_date ? form.birth_date.split('-') : ['', '', '']
                const by = parts[0] || ''
                const bm = parts[1] ? String(parseInt(parts[1])) : ''
                const bd = parts[2] ? String(parseInt(parts[2])) : ''
                const updateBirth = (y: string, m: string, d: string) => {
                  if (y && m && d) {
                    update('birth_date', `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)
                  } else {
                    update('birth_date', [y, m ? m.padStart(2, '0') : '', d ? d.padStart(2, '0') : ''].filter(Boolean).join('-'))
                  }
                }
                const currentYear = new Date().getFullYear()
                return (
                  <div className="flex gap-1">
                    <select value={by} onChange={e => updateBirth(e.target.value, bm, bd)}
                      className="flex-1 min-w-0 px-1 py-2.5 border border-gray-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#14252A]">
                      <option value="">年</option>
                      {Array.from({ length: currentYear - 1919 }, (_, i) => currentYear - i).map(y => (
                        <option key={y} value={String(y)}>{y}年（{getEra(y)}）</option>
                      ))}
                    </select>
                    <select value={bm} onChange={e => updateBirth(by, e.target.value, bd)}
                      className="w-14 px-1 py-2.5 border border-gray-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#14252A]">
                      <option value="">月</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <option key={m} value={String(m)}>{m}月</option>
                      ))}
                    </select>
                    <select value={bd} onChange={e => updateBirth(by, bm, e.target.value)}
                      className="w-14 px-1 py-2.5 border border-gray-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#14252A]">
                      <option value="">日</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={String(d)}>{d}日</option>
                      ))}
                    </select>
                  </div>
                )
              })()}
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">性別</label>
              <select value={form.gender} onChange={(e) => update('gender', e.target.value)} className={inputClass}>
                <option>男性</option>
                <option>女性</option>
                <option>その他</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">電話番号</label>
              <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} className={inputClass} placeholder="090-1234-5678" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">メールアドレス</label>
              <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className={inputClass} placeholder="example@email.com" />
            </div>
          </div>
        </div>

        {/* 住所 */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <h3 className="font-bold text-gray-800 text-sm border-b pb-2">住所</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">郵便番号</label>
              <input type="text" value={form.zipcode} onChange={(e) => handleZipcodeChange(e.target.value)} className={inputClass} placeholder="000-0000" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">都道府県</label>
              <select value={form.prefecture} onChange={(e) => update('prefecture', e.target.value)} className={inputClass}>
                <option value="">選択</option>
                {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">市区町村</label>
            <input type="text" value={form.city} onChange={(e) => update('city', e.target.value)} className={inputClass} placeholder="住吉区長居" />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">番地</label>
            <input type="text" value={form.address} onChange={(e) => update('address', e.target.value)} className={inputClass} placeholder="1-2-3" />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">建物名・部屋番号</label>
            <input type="text" value={form.building} onChange={(e) => update('building', e.target.value)} className={inputClass} placeholder="○○マンション101" />
          </div>
        </div>

        {/* 来院情報 */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <h3 className="font-bold text-gray-800 text-sm border-b pb-2">来院情報</h3>

          <div>
            <label className="block text-xs text-gray-600 mb-1">患者区分 *</label>
            <div className="flex gap-2">
              {['整体', 'ダイエット'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => update('customer_category', form.customer_category === type ? '' : type)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
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

          <div>
            <label className="block text-xs text-gray-600 mb-1">職業</label>
            <input type="text" value={form.occupation} onChange={(e) => update('occupation', e.target.value)} className={inputClass} placeholder="会社員" />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">来院経路</label>
            <select value={form.referral_source} onChange={(e) => update('referral_source', e.target.value)} className={inputClass}>
              <option value="">選択してください</option>
              {REFERRAL_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">予約媒体</label>
            <select value={form.booking_channel} onChange={(e) => update('booking_channel', e.target.value)} className={inputClass}>
              <option value="">選択してください</option>
              <option value="LINE">LINE</option>
              <option value="電話">電話</option>
              <option value="ホットペッパー">ホットペッパー</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">主訴（お困りの症状）</label>
            <textarea value={form.chief_complaint} onChange={(e) => update('chief_complaint', e.target.value)} className={inputClass} rows={3} placeholder="腰痛、肩こり、頭痛..." />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">既往歴</label>
            <textarea value={form.medical_history} onChange={(e) => update('medical_history', e.target.value)} className={inputClass} rows={2} placeholder="手術歴、持病など" />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">メモ</label>
            <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} className={inputClass} rows={2} placeholder="注意点など" />
          </div>

          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_direct_mail} onChange={e => update('is_direct_mail', e.target.checked)} className="rounded" />
              DM送付可
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_enabled} onChange={e => update('is_enabled', e.target.checked)} className="rounded" />
              有効
            </label>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !form.name}
          className="w-full text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50 shadow-lg transition-all active:scale-95"
          style={{ background: '#14252A' }}
        >
          {saving ? '登録中...' : '患者を登録する'}
        </button>
      </div>
    </AppShell>
  )
}
