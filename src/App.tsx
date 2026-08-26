import { useState } from 'react'
import { SignInView } from './auth/SignInView'
import { useSession } from './auth/useSession'
import { supabase } from './lib/supabase'
import { DebugImportView } from './views/DebugImportView'
import { QuizView } from './views/QuizView'

type View = 'quiz' | 'debug'

function App() {
  const [view, setView] = useState<View>('quiz')
  const { session, loading } = useSession()

  if (loading) return null
  if (!session) return <SignInView />

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
      {view === 'quiz' ? <QuizView /> : <DebugImportView />}
    </div>
  )
}

export default App
