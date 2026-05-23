// __APP_PASCAL__ — entry point
// Consumes @qijenchen/design-system via npm workspace
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Button, Avatar } from '@qijenchen/design-system'
import '@qijenchen/design-system/styles/globals.css'

function App() {
  return (
    <div className="min-h-screen bg-canvas text-foreground p-8">
      <h1 className="text-h2 mb-4">__APP_PASCAL__</h1>
      <div className="flex gap-3 items-center">
        <Avatar size={32} initials="DS" />
        <Button variant="primary">主要動作</Button>
        <Button variant="secondary">次要動作</Button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
