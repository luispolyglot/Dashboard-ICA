/// <reference types="vite/client" />

import type { BridgeStorage } from './modules/types'

declare global {
  interface Window {
    storage?: BridgeStorage
  }
}

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY?: string
  readonly VITE_ANTHROPIC_MODEL?: string
  readonly VITE_ANTHROPIC_BASE_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
