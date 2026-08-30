/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_LICHESS_API_TOKEN?: string
  readonly VITE_QUIZ_ONLY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
