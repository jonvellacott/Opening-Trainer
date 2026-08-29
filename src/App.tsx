import { useState } from 'react'
import { SignInView } from './auth/SignInView'
import { useFamily } from './auth/useFamily'
import { useSession } from './auth/useSession'
import { parseBuildHash } from './lib/buildHash'
import { supabase } from './lib/supabase'
import { BuildView } from './views/BuildView'
import { DebugImportView } from './views/DebugImportView'
import { QuizView } from './views/QuizView'
import { SettingsView } from './views/SettingsView'

type View = 'quiz' | 'build' | 'settings' | 'debug'

function App() {
  // A bookmarked/refreshed Build deep link should land straight back in Build mode.
  const [view, setView] = useState<View>(() => (parseBuildHash(window.location.hash) ? 'build' : 'quiz'))
  const { session, loading } = useSession()
  const { familyId, loading: familyLoading, error: familyError } = useFamily(session)

  if (loading) return null
  if (!session) return <SignInView />

  if (familyLoading) return null
  if (familyError) {
    return (
      <div style={{ padding: '1rem', maxWidth: 480, margin: '2rem auto' }}>
        <p style={{ color: 'crimson' }}>Couldn't set up your family: {familyError}</p>
      </div>
    )
  }

  return (
    <div>
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem',
          borderBottom: '1px solid #ccc',
        }}
      >
        <button type="button" onClick={() => setView('quiz')} disabled={view === 'quiz'}>
          Quiz
        </button>
        <button type="button" onClick={() => setView('build')} disabled={view === 'build'}>
          Build
        </button>
        <button type="button" onClick={() => setView('settings')} disabled={view === 'settings'}>
          Settings
        </button>
        <button type="button" onClick={() => setView('debug')} disabled={view === 'debug'}>
          Debug tree
        </button>
        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#666' }}>
          {session.user.email}
        </span>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </nav>
      {view === 'quiz' && <QuizView />}
      {view === 'build' && familyId && <BuildView familyId={familyId} userId={session.user.id} />}
      {view === 'settings' && familyId && <SettingsView familyId={familyId} />}
      {view === 'debug' && <DebugImportView />}
    </div>
  )
}

export default App
