import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { AuthProvider } from './auth/AuthContext'
import { Toaster } from './components/ui/sonner'
import { registerPushServiceWorker } from './modules/services/pushNotifications'
import { TooltipProvider } from './components/ui/tooltip'
import { ThemeProvider } from './theme/ThemeContext'
import { I18nRoot } from './i18n'
import './index.css'

void registerPushServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <TooltipProvider disableHoverableContent delayDuration={200}>
          <AuthProvider>
            <I18nRoot>
              <App />
            </I18nRoot>
            <Toaster position='top-right' closeButton />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
