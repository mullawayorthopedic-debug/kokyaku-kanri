import { SupabaseClient } from '@supabase/supabase-js'

/**
 * サーバーサイド用: Supabaseの1000件制限を回避して全件取得
 */
export async function fetchAllSlipsServer(
  supabase: SupabaseClient,
  clinicId: string,
  selectColumns: string = '*',
  filters?: { gte?: [string, string]; lte?: [string, string] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const PAGE_SIZE = 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allData: any[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    let query = supabase
      .from('cm_slips')
      .select(selectColumns)
      .eq('clinic_id', clinicId)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (filters?.gte) query = query.gte(filters.gte[0], filters.gte[1])
    if (filters?.lte) query = query.lte(filters.lte[0], filters.lte[1])

    const { data, error } = await query
    if (error || !data) break

    allData = allData.concat(data)
    hasMore = data.length === PAGE_SIZE
    offset += PAGE_SIZE
  }

  return allData
}
