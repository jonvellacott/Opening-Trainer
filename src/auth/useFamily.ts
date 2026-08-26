import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useFamily(session: Session | null) {
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) {
      setFamilyId(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    // ensure_family() finds or creates the caller's family atomically in the
    // database, so concurrent calls (e.g. StrictMode's double effect
    // invocation) can't create duplicate families.
    async function load() {
      const { data, error } = await supabase.rpc('ensure_family')
      if (cancelled) return
      if (error) {
        setError(error.message)
      } else {
        setFamilyId(data)
      }
      setLoading(false)
    }
    load()

    return () => {
      cancelled = true
    }
  }, [session])

  return { familyId, loading, error }
}
