/// <reference types="vite/client" />

import type { BridgeStorage } from './modules/types'

declare global {
  interface Window {
    storage?: BridgeStorage
  }
}
