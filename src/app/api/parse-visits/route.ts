import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { findBestMatch } from '@/lib/nameMatch'
import { getClinicIdServer } from '@/lib/clinic-server'
import { getToday } from '@/lib/dateUtils'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export async function POST(req: NextRequest) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const { text } = await req.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'テキストが必要です' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEYが設定されていません' }, { status: 500 })
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey)
    const clinicId = await getClinicIdServer()

    // 全患者を取得（activeに限定しない - 休止中の患者も来院する可能性あり）
    const { data: patients } = await supabase
      .from('cm_patients')
      .select('id, name, furigana')
      .eq('clinic_id', clinicId)
      .order('name')

    const { data: menus } = await supabase
      .from('cm_base_menus')
      .select('name, price, duration_minutes')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)

    const patientList = (patients || []).map(p => `${p.name}（${p.furigana || ''}）→ ID:${p.id}`).join('\n')
    const menuList = (menus || []).map(m => `${m.name}: ${m.price}円 / ${m.duration_minutes}分`).join('\n')

    const today = getToday()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `あなたは整体院の顧客管理システムのアシスタントです。
以下のテキストから施術記録を抽出してJSON配列で返してください。

【登録済み患者リスト】
${patientList}

【メニューマスタ】
${menuList}

【ルール】
- 患者名は登録済みリストから最も近い名前をマッチングし、そのIDをpatient_idにセット
- スペースの有無、漢字/ひらがなの違いは無視してマッチング
- 「回数券消費」「回数券の消化」「回数券で」→ total_price: 0, menu_name: "回数券消化"
- 金額の指定がある場合はtotal_priceにセット
- メニュー名の指定があればmenu_nameにセット。マスタに一致すれば料金も自動セット
- 日付の指定がなければ今日（${today}）
- 支払方法の指定がなければ "現金"
- 「いつもの」「通常」等はメニューマスタの最初のメニューを使用

【出力フォーマット】JSONのみ、説明文不要
[
  {
    "patient_id": "UUID or null",
    "patient_name": "患者名（リストに一致した正式名称）",
    "visit_date": "YYYY-MM-DD",
    "menu_name": "メニュー名",
    "total_price": 数値,
    "payment_method": "現金",
    "notes": "補足があれば"
  }
]

【入力テキスト】
${text}`
        }
      ]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      return NextResponse.json({ error: '解析に失敗しました' }, { status: 500 })
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: '解析結果を読み取れませんでした' }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0])

    // AIの結果をサーバー側で二重チェック・補完
    const patientCandidates = (patients || []).map(p => ({
      id: p.id,
      name: p.name,
      furigana: p.furigana,
    }))

    const verified = parsed.map((record: { patient_id: string | null; patient_name: string; [key: string]: unknown }) => {
      // patient_idがnullの場合、またはIDが患者リストに存在しない場合、名前で再マッチング
      const idExists = record.patient_id && patientCandidates.some(p => p.id === record.patient_id)

      if (!idExists && record.patient_name) {
        const match = findBestMatch(record.patient_name, patientCandidates)
        if (match) {
          return {
            ...record,
            patient_id: match.id,
            patient_name: match.name, // 正式名称に統一
          }
        }
      }

      return record
    })

    return NextResponse.json({ records: verified })
  } catch (error) {
    console.error('Parse error:', error)
    return NextResponse.json({ error: '解析中にエラーが発生しました' }, { status: 500 })
  }
}
