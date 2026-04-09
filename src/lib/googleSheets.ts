import { JWT } from 'google-auth-library'

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID!

function getServiceAccount(): { client_email: string; private_key: string } {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set')
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'))
}

function getAuth(): JWT {
  const sa = getServiceAccount()
  return new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
  })
}

async function getToken(): Promise<string> {
  const auth = getAuth()
  await auth.authorize()
  return auth.credentials.access_token as string
}

async function sheetsApi(path: string, options?: RequestInit) {
  const token = await getToken()
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options?.headers },
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${body.error?.message || JSON.stringify(body)}`)
  return body
}

async function getSheets(): Promise<{ title: string; sheetId: number; index: number }[]> {
  const data = await sheetsApi('?fields=sheets.properties')
  return data.sheets?.map((s: { properties: { title: string; sheetId: number; index: number } }) => ({
    title: s.properties.title, sheetId: s.properties.sheetId, index: s.properties.index,
  })) || []
}

async function batchUpdate(ranges: { range: string; values: (string | number)[][] }[]) {
  if (ranges.length === 0) return
  await sheetsApi('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: ranges })
  })
}

// ========== データ型 ==========

interface ExistPatient { name: string; revenue: number }
interface NewPatient {
  name: string; city: string; gender: string; age: number | null
  visitMotive: string; chiefComplaint: string; referralSource: string
  category: string
}

export interface MonthExportData {
  visits: number           // 施術回数
  patients: number         // カルテ枚数
  existPatientCount: number // 既存カルテ合計
  seitaiNewCount: number   // 整体新規数
  dietNewCount: number     // ダイエット新規数
  totalRevenue: number     // 合計売上
  newRevenue: number       // 新規売上
  adCost: number           // 広告費
  existSeitai: ExistPatient[]
  existDiet: ExistPatient[]
  newPatients: NewPatient[]
  mediaRevenue: {
    seitai: Record<string, { count: number; revenue: number }>
    diet: Record<string, { count: number; revenue: number }>
  }
}

// 来院経路→媒体行マッピング（整体: row 18-23, ダイエット: row 25-27）
const SEITAI_MEDIA: Record<string, number> = {
  'PPC': 18, 'ポスティング': 19, '折り込み': 20, 'インスタ': 21, 'MEO': 22, '紹介': 23,
}
const DIET_MEDIA: Record<string, number> = {
  'HPB': 25, 'インスタ': 26, '紹介': 27,
}

export function normalizeReferral(source: string): string {
  if (!source) return ''
  const s = source.toLowerCase()
  if (s.includes('ppc') || s.includes('リスティング')) return 'PPC'
  if (s.includes('ポスティング')) return 'ポスティング'
  if (s.includes('折り込み') || s.includes('チラシ')) return '折り込み'
  if (s.includes('インスタ') || s.includes('instagram') || s.includes('meta') || s.includes('メタ')) return 'インスタ'
  if (s.includes('meo') || s.includes('google')) return 'MEO'
  if (s.includes('hpb') || s.includes('ホットペッパー')) return 'HPB'
  if (s.includes('紹介')) return '紹介'
  if (s.includes('line')) return 'インスタ'
  if (s.includes('tel') || s.includes('電話')) return 'PPC'
  return ''
}

export async function writeMonthlySheet(year: string, month: number, data: MonthExportData): Promise<string> {
  const sheets = await getSheets()

  // テンプレート＝「のコピー」シート（正しい様式）
  const template = sheets.find(s => s.title.includes('のコピー'))
  if (!template) throw new Error('テンプレートシート（のコピー）が見つかりません')

  const newTitle = `${year}年${month}月実績（自動）`

  // 同名シートがあれば削除
  const existing = sheets.find(s => s.title === newTitle)
  if (existing) {
    await sheetsApi(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: existing.sheetId } }] })
    })
  }

  // 一番右に複製
  const maxIndex = Math.max(...sheets.map(s => s.index)) + 1
  await sheetsApi(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ duplicateSheet: { sourceSheetId: template.sheetId, newSheetName: newTitle, insertSheetIndex: maxIndex } }]
    })
  })

  const s = newTitle

  // テンプレートに残っている旧データをクリア（関数セルは壊さない、入力セルのみ）
  await sheetsApi('/values:batchClear', {
    method: 'POST',
    body: JSON.stringify({
      ranges: [
        `'${s}'!B3`,          // 営業日数
        `'${s}'!B4`,          // 施術回数
        `'${s}'!B7`,          // カルテ枚数
        `'${s}'!E9`,          // 既存カルテ合計
        `'${s}'!F4`,          // 整体新規数
        `'${s}'!G4:H4`,       // リピート数
        `'${s}'!F8`,          // ダイエット新規数
        `'${s}'!G8:H8`,       // リピート数
        `'${s}'!I14:K14`,     // 回数券購入数
        `'${s}'!B18:B23`,     // 整体媒体 新規数
        `'${s}'!C18:D23`,     // 整体媒体 問い合わせ・アクセス
        `'${s}'!G18:H23`,     // 整体媒体 費用・売上
        `'${s}'!B25:B27`,     // ダイエット媒体 新規数
        `'${s}'!C25:D27`,     // ダイエット媒体 問い合わせ・アクセス
        `'${s}'!G25:H27`,     // ダイエット媒体 費用・売上
        `'${s}'!A33:D67`,     // 既存患者リスト
        `'${s}'!N4:U25`,      // 新規患者管理（全行クリア）
      ]
    })
  })

  const r: { range: string; values: (string | number)[][] }[] = []

  // ===== 1. タイトル =====
  r.push({ range: `'${s}'!A1`, values: [[`${year}年${month}月間実績`]] })

  // ===== 2. 左上サマリー（指定セルのみ）=====
  // B4: 施術回数
  r.push({ range: `'${s}'!B4`, values: [[data.visits]] })
  // B7: カルテ枚数
  r.push({ range: `'${s}'!B7`, values: [[data.patients]] })
  // F4: 整体新規数合計
  r.push({ range: `'${s}'!F4`, values: [[data.seitaiNewCount]] })
  // F8: ダイエット新規合計
  r.push({ range: `'${s}'!F8`, values: [[data.dietNewCount]] })
  // E9: 既存カルテ合計
  r.push({ range: `'${s}'!E9`, values: [[data.existPatientCount]] })

  // ===== 3. 媒体別（新規数 B列 + 売上 H列のみ。費用G列は手動）=====
  for (const [media, row] of Object.entries(SEITAI_MEDIA)) {
    const d = data.mediaRevenue.seitai[media]
    if (d && d.count > 0) {
      r.push({ range: `'${s}'!B${row}`, values: [[d.count]] })
      r.push({ range: `'${s}'!H${row}`, values: [[d.revenue]] })
    }
  }
  for (const [media, row] of Object.entries(DIET_MEDIA)) {
    const d = data.mediaRevenue.diet[media]
    if (d && d.count > 0) {
      r.push({ range: `'${s}'!B${row}`, values: [[d.count]] })
      r.push({ range: `'${s}'!H${row}`, values: [[d.revenue]] })
    }
  }

  // ===== 4. 既存患者リスト（A33-D67）0円は除外 =====
  const seitaiFiltered = data.existSeitai.filter(p => p.revenue > 0)
  const dietFiltered = data.existDiet.filter(p => p.revenue > 0)
  if (seitaiFiltered.length > 0) {
    r.push({ range: `'${s}'!A33:B${32 + seitaiFiltered.length}`, values: seitaiFiltered.map(p => [p.name, p.revenue]) })
  }
  if (dietFiltered.length > 0) {
    r.push({ range: `'${s}'!C33:D${32 + dietFiltered.length}`, values: dietFiltered.map(p => [p.name, p.revenue]) })
  }

  // ===== 5. 新規患者管理（N4-U列のみ。V:CVの有無、W:初回施術後 は手動）=====
  if (data.newPatients.length > 0) {
    r.push({
      range: `'${s}'!N4:U${3 + data.newPatients.length}`,
      values: data.newPatients.map((p, i) => [
        i + 1,            // N: 番号
        p.name,           // O: 氏名
        p.city,           // P: 地域
        p.gender,         // Q: 性別
        p.age ?? '',      // R: 年齢
        p.visitMotive,    // S: 検索キーワード
        p.chiefComplaint, // T: 症状
        p.referralSource, // U: 来院経路
      ])
    })
  }

  await batchUpdate(r)

  // ===== 6. 年間統計表にも書き込み =====
  const yearSheetName = sheets.find(s2 => s2.title.includes(`${year}年,年間統計表`))?.title
  if (yearSheetName) {
    const yearRow = month + 1 // 1月=row2, 2月=row3, 3月=row4...
    const yr: { range: string; values: (string | number)[][] }[] = []
    // D: 施術回数, E: カルテ枚数, H: 新規数, I: 売上, J: 新規売上, L: 広告費
    yr.push({ range: `'${yearSheetName}'!D${yearRow}`, values: [[data.visits]] })
    yr.push({ range: `'${yearSheetName}'!E${yearRow}`, values: [[data.patients]] })
    yr.push({ range: `'${yearSheetName}'!H${yearRow}`, values: [[data.seitaiNewCount + data.dietNewCount]] })
    yr.push({ range: `'${yearSheetName}'!I${yearRow}`, values: [[data.totalRevenue]] })
    yr.push({ range: `'${yearSheetName}'!J${yearRow}`, values: [[data.newRevenue]] })
    yr.push({ range: `'${yearSheetName}'!L${yearRow}`, values: [[data.adCost]] })
    await batchUpdate(yr)
  }

  return newTitle
}
