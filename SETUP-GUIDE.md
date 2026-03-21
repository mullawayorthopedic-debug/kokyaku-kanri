# 顧客管理システム セットアップガイド

このガイドに従って、顧客管理システムを自分の環境にセットアップできます。

---

## 必要なもの

- **GitHubアカウント**（コードの管理）
- **Supabaseアカウント**（データベース・認証）※無料で作成可能
- **Vercelアカウント**（アプリの公開）※無料で作成可能
- **Claude Code**（ターミナルでの操作）※あると便利

---

## ステップ1：コードをフォークする

1. GitHubにログイン
2. https://github.com/yosinkyuin1031-glitch/kokyaku-kanri にアクセス
3. 右上の「**Fork**」ボタンをクリック
4. 自分のアカウントにコピーが作成される

### 自分のPCにクローン

ターミナルで以下を実行：

```bash
git clone https://github.com/あなたのユーザー名/kokyaku-kanri.git
cd kokyaku-kanri
npm install
```

---

## ステップ2：Supabaseプロジェクトを作成する

1. https://supabase.com にアクセスしてアカウント作成（またはログイン）
2. 「**New Project**」をクリック
3. プロジェクト名：任意（例：`kokyaku-kanri`）
4. データベースパスワード：メモしておく
5. リージョン：**Northeast Asia (Tokyo)**を選択
6. 「**Create new project**」をクリック

### SQLを実行してテーブルを作成

Supabaseのダッシュボードで **SQL Editor** を開き、以下のファイルを **この順番で** 実行してください：

1. `supabase-setup.sql`（基本テーブル作成）
2. `supabase-migration-v2.sql`（予約・伝票テーブル追加）
3. `supabase-migration-v3-multitenant.sql`（マルチテナント対応）
4. `supabase-migration-v4-stripe.sql`（Stripe連携カラム追加）
5. `supabase-migration-v5-rls.sql`（セキュリティポリシー設定）

各ファイルの中身をコピーして、SQL Editorに貼り付けて「**Run**」を押すだけです。

### Supabase認証設定

1. Supabaseダッシュボード → **Authentication** → **Providers**
2. **Email** が有効になっていることを確認
3. 「Confirm email」は必要に応じてON/OFF

### SupabaseのURLとキーをメモ

Supabaseダッシュボード → **Settings** → **API** で以下をメモ：

- **Project URL**（例：`https://xxxxx.supabase.co`）
- **anon public key**（`eyJ...`で始まる長い文字列）

---

## ステップ3：Vercelにデプロイする

1. https://vercel.com にアクセスしてアカウント作成（またはログイン）
2. 「**Add New Project**」をクリック
3. 「**Import Git Repository**」でフォークしたリポジトリを選択
4. **Environment Variables**（環境変数）を設定：

| 変数名 | 値 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ステップ2でメモしたProject URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ステップ2でメモしたanon public key |

5. 「**Deploy**」をクリック

デプロイが完了すると、URLが発行されます（例：`https://kokyaku-kanri-xxxxx.vercel.app`）

---

## ステップ4：初期アカウントを作成する

1. デプロイされたURLにアクセス
2. 「**新規登録**」画面で院の情報を入力
3. メールアドレスとパスワードでアカウント作成
4. ログインして利用開始

---

## オプション：Stripe決済を使う場合

Stripe決済（サブスク課金）を使う場合は、追加で以下の環境変数をVercelに設定してください：

| 変数名 | 値 |
|---|---|
| `STRIPE_SECRET_KEY` | Stripeダッシュボードから取得 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripeダッシュボードから取得 |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhookから取得 |

※ Stripe決済が不要な場合、この設定は不要です。

---

## トラブルシューティング

### デプロイが失敗する場合
- 環境変数が正しく設定されているか確認
- Supabaseプロジェクトが正しく作成されているか確認

### ログインできない場合
- Supabaseの認証設定を確認
- SQLマイグレーションが全て実行されているか確認

### データが表示されない場合
- RLSポリシーが正しく適用されているか確認（v5のSQLを実行済みか）
- clinic_membersテーブルに自分のレコードがあるか確認

---

## ローカルで開発する場合

```bash
# プロジェクトフォルダで
cp .env.local.example .env.local
# .env.localにSupabaseのURL・キーを記入
npm run dev
```

ブラウザで http://localhost:3000 にアクセスして動作確認できます。

---

## サポート

セットアップで困ったことがあれば、Claude Codeに「このSETUP-GUIDEに沿ってセットアップして」と伝えてください。
