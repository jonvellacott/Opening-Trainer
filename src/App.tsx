import { useState } from 'react'
import { DebugImportView } from './views/DebugImportView'
import { QuizView } from './views/QuizView'

type View = 'quiz' | 'debug'

function App() {
  const [view, setView] = useState<View>('quiz')

  return (
    <div>
      <nav style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem', borderBottom: '1px solid #ccc' }}>
        <button type="button" onClick={() => setView('quiz')} disabled={view === 'quiz'}>
          Quiz
        </button>
        <button type="button" onClick={() => setView('debug')} disabled={view === 'debug'}>
          Debug tree
        </button>
      </nav>
      {view === 'quiz' ? <QuizView /> : <DebugImportView />}
    </div>
  )
}

export default App
