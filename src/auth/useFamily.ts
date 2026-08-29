import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useFamily(session: Session | null) {
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Supabase issues a new session object on every token refresh (including
  // ones triggered just by the tab regaining focus), even for the same
  // signed-in user. Keying off user id instead of the session object itself
  // means those refreshes don't re-trigger this effect and tear the app down.
  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!userId) {
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
  }, [userId])

  return { familyId, loading, error }
}
