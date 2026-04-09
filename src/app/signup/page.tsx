'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Suspense } from 'react'

function SignupForm() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!clinicName.trim()) {
      setError('院名を入力してください')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください')
      setLoading(false)
      return
    }

    try {
      // 1. Supabase Auth でユーザー作成
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      })
      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('このメールアドレスは既に登録されています')
        } else {
          setError(authError.message)
        }
        setLoading(false)
        return
      }

      const userId = authData.user?.id
      if (!userId) {
        setError('ユーザー作成に失敗しました')
        setLoading(false)
        return
      }

      // 2. API Route 経由で clinic 作成（service_role で RLS バイパス）
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicName: clinicName.trim(), userId }),
      })
      const resData = await res.json()

      if (!res.ok) {
        setError('院の作成に失敗しました: ' + (resData.error || ''))
        setLoading(false)
        return
      }

      // 4. 成功後リダイレクト
      window.location.href = '/'
    } catch (err) {
      setError('予期しないエラーが発生しました')
      console.error(err)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'linear-gradient(135deg, #14252A 0%, #1a3a42 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">顧客管理シート</h1>
          <p className="text-gray-300 text-sm mt-1">アカウントを作成</p>
        </div>

        {reason === 'no_clinic' && (
          <div className="bg-yellow-50 text-yellow-700 text-sm p-3 rounded-lg mb-4">
            所属する院が見つかりませんでした。新しい院を登録してください。
          </div>
        )}

        <form onSubmit={handleSignup} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">院名 *</label>
            <input
              type="text"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A] focus:border-transparent"
              placeholder="例：○○整骨院"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A] focus:border-transparent"
              placeholder="example@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A] focus:border-transparent"
              placeholder="6文字以上"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50"
            style={{ background: '#14252A' }}
          >
            {loading ? 'アカウント作成中...' : 'アカウントを作成'}
          </button>

          <p className="text-center text-sm text-gray-500">
            既にアカウントをお持ちの方は{' '}
            <Link href="/login" className="text-blue-600 font-medium hover:underline">
              ログイン
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #14252A 0%, #1a3a42 100%)' }}>
        <p className="text-white">読み込み中...</p>
      </div>
    }>
      <SignupForm />
    </Suspense>
  )
}
