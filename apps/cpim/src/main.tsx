import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@qijenchen/design-system'
import App from './App'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={500} skipDelayDuration={300}>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
