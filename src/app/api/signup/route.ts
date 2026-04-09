import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { clinicName, userId } = await req.json()

  if (!clinicName || !userId) {
    return NextResponse.json({ error: 'clinicName and userId are required' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // メール確認済みにする（確認メール不要）
  await supabase.auth.admin.updateUserById(userId, { email_confirm: true })

  // clinics の code を院名から自動生成
  const code = clinicName
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50) + '-' + Math.random().toString(36).slice(2, 7)

  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .insert({ name: clinicName, code, plan: 'free', is_active: true })
    .select('id')
    .single()

  if (clinicError || !clinic) {
    return NextResponse.json({ error: clinicError?.message || '院の作成に失敗しました' }, { status: 500 })
  }

  const { error: memberError } = await supabase
    .from('clinic_members')
    .insert({ clinic_id: clinic.id, user_id: userId, role: 'owner' })

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  return NextResponse.json({ clinicId: clinic.id })
}
