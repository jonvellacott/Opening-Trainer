import { supabase } from './supabase'

export type PlayerSource = 'chess.com' | 'lichess'

export interface TrackedPlayerRow {
  id: string
  family_id: string
  source: PlayerSource
  username: string
  last_imported_at: string | null
}

const COLUMNS = 'id, family_id, source, username, last_imported_at'

export async function listTrackedPlayers(familyId: string): Promise<TrackedPlayerRow[]> {
  const { data, error } = await supabase
    .from('tracked_players')
    .select(COLUMNS)
    .eq('family_id', familyId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function createTrackedPlayer(params: {
  familyId: string
  source: PlayerSource
  username: string
}): Promise<TrackedPlayerRow> {
  const { data, error } = await supabase
    .from('tracked_players')
    .insert({ family_id: params.familyId, source: params.source, username: params.username })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function deleteTrackedPlayer(id: string): Promise<void> {
  const { error } = await supabase.from('tracked_players').delete().eq('id', id)
  if (error) throw error
}

export async function markImported(id: string): Promise<void> {
  const { error } = await supabase
    .from('tracked_players')
    .update({ last_imported_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** The `move_stats.source` string identifying this account's imported games. */
export function statsSourceFor(player: Pick<TrackedPlayerRow, 'source' | 'username'>): string {
  return `${player.source}:${player.username.toLowerCase()}`
}
