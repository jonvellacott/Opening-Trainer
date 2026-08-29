import type { Color } from '../domain/repertoire'
import { supabase } from './supabase'

export interface RepertoireRow {
  id: string
  family_id: string
  name: string
  training_color: Color
  root_fen: string
}

export type EdgeStatus = 'unexplored' | 'active' | 'ignored' | 'terminal'

export interface EdgeRow {
  id: string
  from_fen: string
  san: string
  to_fen: string
  status: EdgeStatus
}

const EDGE_COLUMNS = 'id, from_fen, san, to_fen, status'

export async function listRepertoires(familyId: string): Promise<RepertoireRow[]> {
  const { data, error } = await supabase
    .from('repertoires')
    .select('id, family_id, name, training_color, root_fen')
    .eq('family_id', familyId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function getRepertoire(id: string): Promise<RepertoireRow> {
  const { data, error } = await supabase
    .from('repertoires')
    .select('id, family_id, name, training_color, root_fen')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/** Permanently removes a repertoire and everything under it (edges, training history). */
export async function deleteRepertoire(id: string): Promise<void> {
  const { error } = await supabase.from('repertoires').delete().eq('id', id)
  if (error) throw error
}

async function upsertPosition(fen: string): Promise<void> {
  // ignoreDuplicates -> ON CONFLICT DO NOTHING: a position's fen never
  // changes, so there's nothing to update, and DO NOTHING doesn't require
  // an UPDATE policy the way DO UPDATE would.
  const { error } = await supabase
    .from('positions')
    .upsert({ fen }, { onConflict: 'fen', ignoreDuplicates: true })
  if (error) throw error
}

export async function createRepertoire(params: {
  familyId: string
  createdBy: string
  name: string
  trainingColor: Color
  rootFen: string
}): Promise<RepertoireRow> {
  await upsertPosition(params.rootFen)
  const { data, error } = await supabase
    .from('repertoires')
    .insert({
      family_id: params.familyId,
      created_by: params.createdBy,
      name: params.name,
      training_color: params.trainingColor,
      root_fen: params.rootFen,
    })
    .select('id, family_id, name, training_color, root_fen')
    .single()
  if (error) throw error
  return data
}

export async function listEdges(repertoireId: string): Promise<EdgeRow[]> {
  const { data, error } = await supabase
    .from('repertoire_edges')
    .select(EDGE_COLUMNS)
    .eq('repertoire_id', repertoireId)
  if (error) throw error
  return data
}

/** Sets an edge's status (e.g. 'ignored' to soft-delete a line, 'active' to restore it). */
export async function setEdgeStatus(edgeId: string, status: EdgeStatus): Promise<EdgeRow> {
  const { data, error } = await supabase
    .from('repertoire_edges')
    .update({ status })
    .eq('id', edgeId)
    .select(EDGE_COLUMNS)
    .single()
  if (error) throw error
  return data
}

/** Permanently removes a set of edges (e.g. a move and its whole descendant subtree). */
export async function deleteEdges(edgeIds: string[]): Promise<void> {
  const { error } = await supabase.from('repertoire_edges').delete().in('id', edgeIds)
  if (error) throw error
}

/** Saves a played move as an active repertoire edge, creating its positions if new. */
export async function saveEdge(params: {
  repertoireId: string
  fromFen: string
  san: string
  toFen: string
}): Promise<EdgeRow> {
  await upsertPosition(params.fromFen)
  await upsertPosition(params.toFen)
  const { data, error } = await supabase
    .from('repertoire_edges')
    .upsert(
      {
        repertoire_id: params.repertoireId,
        from_fen: params.fromFen,
        san: params.san,
        to_fen: params.toFen,
        status: 'active',
        provenance: { source: 'manual' },
      },
      { onConflict: 'repertoire_id,from_fen,san' },
    )
    .select(EDGE_COLUMNS)
    .single()
  if (error) throw error
  return data
}
