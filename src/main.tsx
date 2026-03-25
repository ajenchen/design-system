import React from 'react'
import ReactDOM from 'react-dom/client'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="min-h-screen bg-background text-foreground p-8">
      <h1 className="text-2xl font-bold">UI Playground</h1>
      <p className="text-muted-foreground mt-2">請使用 Storybook 瀏覽元件：<code>npm run storybook</code></p>
    </div>
  </React.StrictMode>,
)
