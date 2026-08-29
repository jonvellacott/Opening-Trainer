import { supabase } from './supabase'
import type { ExplorerMove } from './lichessExplorer'

export interface MoveStatsRow {
  from_fen: string
  san: string
  to_fen: string
  source: string
  stats: { white: number; draws: number; black: number }
}

/** Reshapes cached move_stats rows to look like a live explorer response, so callers don't care which source they came from. */
export function moveStatsToExplorerMoves(rows: MoveStatsRow[]): ExplorerMove[] {
  const total = rows.reduce((sum, r) => sum + r.stats.white + r.stats.draws + r.stats.black, 0)
  if (total === 0) return []

  return rows.map((r) => {
    const games = r.stats.white + r.stats.draws + r.stats.black
    return {
      san: r.san,
      games,
      percentage: (games / total) * 100,
      white: r.stats.white,
      draws: r.stats.draws,
      black: r.stats.black,
    }
  })
}

const CHUNK_SIZE = 500

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

async function upsertPositions(fens: string[]): Promise<void> {
  for (const batch of chunk(fens, CHUNK_SIZE)) {
    const { error } = await supabase
      .from('positions')
      .upsert(
        batch.map((fen) => ({ fen })),
        { onConflict: 'fen', ignoreDuplicates: true },
      )
    if (error) throw error
  }
}

/** Writes a freshly computed set of move_stats rows for one source (positions are created as needed). */
export async function saveMoveStats(rows: MoveStatsRow[]): Promise<void> {
  if (rows.length === 0) return
  const fens = [...new Set(rows.flatMap((r) => [r.from_fen, r.to_fen]))]
  await upsertPositions(fens)

  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const { error } = await supabase.from('move_stats').upsert(batch, { onConflict: 'from_fen,san,source' })
    if (error) throw error
  }
}

export async function listMoveStatsBySource(source: string, fen: string): Promise<MoveStatsRow[]> {
  const { data, error } = await supabase
    .from('move_stats')
    .select('from_fen, san, to_fen, source, stats')
    .eq('source', source)
    .eq('from_fen', fen)
  if (error) throw error
  return data
}
