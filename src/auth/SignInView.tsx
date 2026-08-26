import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'sign-in' | 'sign-up'

export function SignInView() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error' | 'check-email'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setError(null)

    const { data, error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    if (error) {
      setStatus('error')
      setError(error.message)
      return
    }

    // If email confirmation is required, signUp succeeds but returns no session yet.
    if (mode === 'sign-up' && !data.session) {
      setStatus('check-email')
      return
    }

    // Otherwise the session is set and App re-renders via onAuthStateChange.
    setStatus('idle')
  }

  function toggleMode() {
    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
    setStatus('idle')
    setError(null)
  }

  if (status === 'check-email') {
    return (
      <div style={{ padding: '1rem', maxWidth: 360, margin: '4rem auto', textAlign: 'center' }}>
        <p>Check {email} to confirm your account, then sign in.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 360, margin: '4rem auto' }}>
      <h2>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <button type="submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
      </form>
      <button
        type="button"
        onClick={toggleMode}
        style={{
          marginTop: '0.75rem',
          background: 'none',
          border: 'none',
          color: '#666',
          textDecoration: 'underline',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {mode === 'sign-in' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}
