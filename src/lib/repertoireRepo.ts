import type { Color } from '../domain/repertoire'
import { supabase } from './supabase'

export interface RepertoireRow {
  id: string
  family_id: string
  name: string
  training_color: Color
  root_fen: string
}

export async function listRepertoires(familyId: string): Promise<RepertoireRow[]> {
  const { data, error } = await supabase
    .from('repertoires')
    .select('id, family_id, name, training_color, root_fen')
    .eq('family_id', familyId)
    .order('created_at')
  if (error) throw error
  return data
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

/** Saves a played move as an active repertoire edge, creating its positions if new. */
export async function saveEdge(params: {
  repertoireId: string
  fromFen: string
  san: string
  toFen: string
}): Promise<void> {
  await upsertPosition(params.fromFen)
  await upsertPosition(params.toFen)
  const { error } = await supabase.from('repertoire_edges').upsert(
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
  if (error) throw error
}
