import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_CLINIC_ID = '00000000-0000-0000-0000-000000000001'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

interface ChannelData {
  cost: number
  impressions: number
  clicks: number
  conversions: number
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400, headers: cors })

  const { month, meta, ppc, secret } = body as {
    month: string
    meta: ChannelData
    ppc: ChannelData
    secret: string
  }

  const syncSecret = process.env.ADS_SYNC_SECRET
  if (!syncSecret || secret !== syncSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: cors })
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format' }, { status: 400, headers: cors })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const targetChannels = ['インスタ（整体）', 'PPC（腰痛）']

  // 既存データを取得して inquiries / new_patients を保持
  const { data: existing } = await supabase
    .from('cm_ad_costs')
    .select('channel, inquiries, new_patients')
    .eq('clinic_id', DEFAULT_CLINIC_ID)
    .eq('month', month)
    .in('channel', targetChannels)

  const existingMap = Object.fromEntries(
    (existing || []).map(r => [r.channel, r])
  )

  // 対象チャネルの既存行を削除
  await supabase
    .from('cm_ad_costs')
    .delete()
    .eq('clinic_id', DEFAULT_CLINIC_ID)
    .eq('month', month)
    .in('channel', targetChannels)

  const syncDate = new Date().toLocaleDateString('ja-JP')

  const inserts = [
    { channel: 'インスタ（整体）', ...meta },
    { channel: 'PPC（腰痛）', ...ppc },
  ]
    .filter(c => c.cost > 0 || c.impressions > 0 || c.clicks > 0)
    .map(c => ({
      clinic_id: DEFAULT_CLINIC_ID,
      month,
      channel: c.channel,
      cost: c.cost,
      impressions: c.impressions,
      clicks: c.clicks,
      conversions: c.conversions,
      inquiries: existingMap[c.channel]?.inquiries || 0,
      new_patients: existingMap[c.channel]?.new_patients || 0,
      notes: `広告ダッシュボードより同期 ${syncDate}`,
    }))

  if (inserts.length === 0) {
    return NextResponse.json({ ok: true, message: 'データなし（0件）' }, { headers: cors })
  }

  const { error } = await supabase.from('cm_ad_costs').insert(inserts)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cors })
  }

  return NextResponse.json({ ok: true, synced: inserts.length, month }, { headers: cors })
}
