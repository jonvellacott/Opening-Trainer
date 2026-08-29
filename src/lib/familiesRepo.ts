import { supabase } from './supabase'

export interface FamilyRow {
  id: string
  name: string
  suggestion_threshold_percent: number
}

export async function getFamily(familyId: string): Promise<FamilyRow> {
  const { data, error } = await supabase
    .from('families')
    .select('id, name, suggestion_threshold_percent')
    .eq('id', familyId)
    .single()
  if (error) throw error
  return data
}

export async function updateSuggestionThreshold(familyId: string, percent: number): Promise<void> {
  const { error } = await supabase
    .from('families')
    .update({ suggestion_threshold_percent: percent })
    .eq('id', familyId)
  if (error) throw error
}
