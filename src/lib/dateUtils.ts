/** ローカルタイムゾーンで YYYY-MM-DD 形式の日付文字列を返す */
export function formatLocalDate(d?: Date): string {
  const date = d ?? new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** 今日の日付を YYYY-MM-DD 形式で返す（ローカルタイムゾーン） */
export function getToday(): string {
  return formatLocalDate()
}
