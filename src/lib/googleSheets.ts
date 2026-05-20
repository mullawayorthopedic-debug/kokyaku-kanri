import { JWT } from 'google-auth-library'

const SPREADSHEET_ID = (process.env.GOOGLE_SPREADSHEET_ID || '').replace(/[\s\\n]+$/g, '').trim()

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

// 媒体別広告データ
interface MediaAdData {
  count: number       // 新規数
  revenue: number     // 媒体別売上
  cost: number        // 広告費
  inquiries: number   // 問い合わせ数
  clicks: number      // アクセス数(クリック)
}

export interface MonthExportData {
  visits: number           // 施術回数
  patients: number         // カルテ枚数（全ユニーク患者）
  existPatientCount: number // 既存カルテ合計
  seitaiNewCount: number   // 整体新規数
  dietNewCount: number     // ダイエット新規数
  totalRevenue: number     // 合計売上
  newRevenue: number       // 新規売上
  existRevenue: number     // 既存売上
  adCost: number           // 広告費合計
  workingDays: number      // 営業日数
  avgPrice: number         // 単価（売上÷施術回数）
  existSeitai: ExistPatient[]
  existDiet: ExistPatient[]
  newPatients: NewPatient[]
  mediaData: {
    seitai: Record<string, MediaAdData>
    diet: Record<string, MediaAdData>
  }
}

// ===== 媒体行マッピング（シートのrow番号） =====
// 整体: row 18-23
const SEITAI_MEDIA: Record<string, number> = {
  'PPC': 18, 'ポスティング': 19, '折り込み': 20, 'インスタ': 21, 'MEO': 22, '紹介': 23,
}
// ダイエット: row 25-27
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

// 広告チャネル名→媒体名のマッピング
function normalizeAdChannel(channel: string): { media: string; type: 'seitai' | 'diet' } | null {
  const ch = channel.toLowerCase()
  if (ch.includes('ppc') || ch === 'ppc（腰痛）') return { media: 'PPC', type: 'seitai' }
  if (ch.includes('meo') && ch.includes('整体')) return { media: 'MEO', type: 'seitai' }
  if (ch.includes('meo') && ch.includes('ダイエット')) return { media: 'インスタ', type: 'diet' } // MEOダイエットはインスタ枠に
  if (ch.includes('hpb') || ch.includes('ホットペッパー')) return { media: 'HPB', type: 'diet' }
  if (ch.includes('インスタ') && ch.includes('整体')) return { media: 'インスタ', type: 'seitai' }
  if (ch.includes('インスタ') && ch.includes('ダイエット')) return { media: 'インスタ', type: 'diet' }
  if (ch.includes('ポスティング')) return { media: 'ポスティング', type: 'seitai' }
  if (ch.includes('折込') || ch.includes('チラシ')) return { media: '折り込み', type: 'seitai' }
  if (ch === '紹介') return { media: '紹介', type: 'seitai' }
  return null
}

export { normalizeAdChannel }

export async function writeMonthlySheet(year: string, month: number, data: MonthExportData): Promise<string> {
  const sheets = await getSheets()

  // テンプレート: 「マスター」を含むシート → 「月間統計表サンプル」→「のコピー」
  const template = sheets.find(s => s.title.includes('マスター'))
    || sheets.find(s => s.title.includes('月間統計表サンプル'))
    || sheets.find(s => s.title.includes('のコピー'))
  if (!template) throw new Error(`テンプレートシートが見つかりません。シート一覧: ${sheets.map(s => s.title).join(', ')}`)

  const newTitle = `${year}月${month}月間統計表`

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

  // テンプレートの入力セルのみクリア（数式セルは絶対に触らない）
  await sheetsApi('/values:batchClear', {
    method: 'POST',
    body: JSON.stringify({
      ranges: [
        // 左上サマリー（入力セルのみ）
        `'${s}'!B3`,            // 営業日数
        `'${s}'!B4`,            // 施術回数
        `'${s}'!B7`,            // カルテ枚数
        `'${s}'!B9`,            // 単価
        `'${s}'!E7`,            // 新規合計
        `'${s}'!F4`,            // 整体新規数
        `'${s}'!G4:H4`,         // 整体 2回目/6回目リピ数
        `'${s}'!F8`,            // ダイエット新規数
        `'${s}'!G8:H8`,         // ダイエット 2回目/6回目リピ数
        `'${s}'!E9`,            // 既存カルテ合計
        `'${s}'!I14:K14`,       // 回数券購入数
        // 媒体別（入力セルのみ: B=新規数, C=問合せ, D=アクセス, G=費用, H=売上）
        `'${s}'!B18:D23`,       // 整体媒体 新規/問合せ/アクセス
        `'${s}'!G18:H23`,       // 整体媒体 費用/売上
        `'${s}'!B25:D27`,       // ダイエット媒体 新規/問合せ/アクセス
        `'${s}'!G25:H27`,       // ダイエット媒体 費用/売上
        // 既存患者リスト
        `'${s}'!A33:D67`,
        // 新規患者管理
        `'${s}'!N4:X25`,
      ]
    })
  })

  const r: { range: string; values: (string | number)[][] }[] = []

  // ===== 1. タイトル =====
  r.push({ range: `'${s}'!A1`, values: [[`${year}年${month}月間実績`]] })

  // ===== 2. 左上サマリー（入力セルのみ。数式セルは触らない） =====
  // B3: 営業日数
  r.push({ range: `'${s}'!B3`, values: [[data.workingDays]] })
  // B4: 施術回数
  r.push({ range: `'${s}'!B4`, values: [[data.visits]] })
  // B7: カルテ枚数
  r.push({ range: `'${s}'!B7`, values: [[data.patients]] })
  // B9: 単価
  if (data.avgPrice > 0) {
    r.push({ range: `'${s}'!B9`, values: [[data.avgPrice]] })
  }
  // E7: 新規合計
  r.push({ range: `'${s}'!E7`, values: [[data.seitaiNewCount + data.dietNewCount]] })
  // F4: 整体新規数
  r.push({ range: `'${s}'!F4`, values: [[data.seitaiNewCount]] })
  // F8: ダイエット新規数
  r.push({ range: `'${s}'!F8`, values: [[data.dietNewCount]] })
  // E9: 既存カルテ合計
  r.push({ range: `'${s}'!E9`, values: [[data.existPatientCount]] })

  // ===== 3. 媒体別（入力セルのみ: B=新規数, C=問合せ, D=アクセス, G=費用, H=売上） =====
  // E列(反応率), F列(CV率), I列(LTV), J列(CPA), K列(利益LTV), L列(ROAS)は全て数式→触らない

  // シートの媒体マップに存在しないmediaDataエントリを「紹介」に統合
  // （例: ダイエット患者の経路が'PPC'の場合、DIET_MAPに'PPC'がないので'紹介'に合算）
  const consolidateMedia = (
    mediaMap: Record<string, { count: number; revenue: number; cost: number; inquiries: number; clicks: number }>,
    validKeys: Record<string, number>,
    fallbackKey: string
  ) => {
    const invalidKeys = Object.keys(mediaMap).filter(k => !(k in validKeys))
    if (invalidKeys.length === 0) return
    if (!mediaMap[fallbackKey]) mediaMap[fallbackKey] = { count: 0, revenue: 0, cost: 0, inquiries: 0, clicks: 0 }
    for (const k of invalidKeys) {
      mediaMap[fallbackKey].count += mediaMap[k].count
      mediaMap[fallbackKey].revenue += mediaMap[k].revenue
      mediaMap[fallbackKey].cost += mediaMap[k].cost
      mediaMap[fallbackKey].inquiries += mediaMap[k].inquiries
      mediaMap[fallbackKey].clicks += mediaMap[k].clicks
      delete mediaMap[k]
    }
  }
  consolidateMedia(data.mediaData.seitai, SEITAI_MEDIA, '紹介')
  consolidateMedia(data.mediaData.diet, DIET_MEDIA, '紹介')

  for (const [media, row] of Object.entries(SEITAI_MEDIA)) {
    const d = data.mediaData.seitai[media]
    if (d) {
      r.push({ range: `'${s}'!B${row}`, values: [[d.count]] })
      if (d.inquiries > 0) r.push({ range: `'${s}'!C${row}`, values: [[d.inquiries]] })
      if (d.clicks > 0) r.push({ range: `'${s}'!D${row}`, values: [[d.clicks]] })
      if (d.cost > 0) r.push({ range: `'${s}'!G${row}`, values: [[d.cost]] })
      if (d.revenue > 0) r.push({ range: `'${s}'!H${row}`, values: [[d.revenue]] })
    }
  }
  for (const [media, row] of Object.entries(DIET_MEDIA)) {
    const d = data.mediaData.diet[media]
    if (d) {
      r.push({ range: `'${s}'!B${row}`, values: [[d.count]] })
      if (d.inquiries > 0) r.push({ range: `'${s}'!C${row}`, values: [[d.inquiries]] })
      if (d.clicks > 0) r.push({ range: `'${s}'!D${row}`, values: [[d.clicks]] })
      if (d.cost > 0) r.push({ range: `'${s}'!G${row}`, values: [[d.cost]] })
      if (d.revenue > 0) r.push({ range: `'${s}'!H${row}`, values: [[d.revenue]] })
    }
  }

  // ===== 4. 既存患者リスト（A33:B=整体, C33:D=ダイエット） =====
  const seitaiFiltered = data.existSeitai
  const dietFiltered = data.existDiet
  if (seitaiFiltered.length > 0) {
    r.push({ range: `'${s}'!A33:B${32 + seitaiFiltered.length}`, values: seitaiFiltered.map(p => [p.name, p.revenue]) })
  }
  if (dietFiltered.length > 0) {
    r.push({ range: `'${s}'!C33:D${32 + dietFiltered.length}`, values: dietFiltered.map(p => [p.name, p.revenue]) })
  }

  // ===== 5. 新規患者管理（N4:U列） =====
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
  // 年間統計: row43=1月 ~ row54=12月
  // O=施術回数, P=カルテ枚数, R=新規数, S=売上, T=新規売上, V=広告費
  // Q(頻度), U(既存売上), W(LTV), X(CPA), Y(利益LTV)は数式→触らない
  const yearSheetName = sheets.find(s2 => s2.title.includes(`${year}年,年間統計表`))?.title
  if (yearSheetName) {
    const yearRow = 42 + month // 1月=43, 2月=44, ...
    const yr: { range: string; values: (string | number)[][] }[] = []
    yr.push({ range: `'${yearSheetName}'!O${yearRow}`, values: [[data.visits]] })
    yr.push({ range: `'${yearSheetName}'!P${yearRow}`, values: [[data.patients]] })
    yr.push({ range: `'${yearSheetName}'!R${yearRow}`, values: [[data.seitaiNewCount + data.dietNewCount]] })
    yr.push({ range: `'${yearSheetName}'!S${yearRow}`, values: [[data.totalRevenue]] })
    yr.push({ range: `'${yearSheetName}'!T${yearRow}`, values: [[data.newRevenue]] })
    yr.push({ range: `'${yearSheetName}'!V${yearRow}`, values: [[data.adCost]] })
    await batchUpdate(yr)
  }

  return newTitle
}
