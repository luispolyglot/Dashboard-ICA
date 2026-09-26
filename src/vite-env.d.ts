/// <reference types="vite/client" />

import type { BridgeStorage } from './modules/types'

declare global {
  interface Window {
    storage?: BridgeStorage
  }

  const __APP_BUILD_ID__: string
}

export {}

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_MODEL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
