import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-center"
        containerStyle={{ top: 76 }}
        toastOptions={{
          duration: 3500,
          // Toasts inherit the theme tokens so they are readable in dark mode,
          // which the previous hard-coded white background was not.
          style: {
            background: 'rgb(var(--surface))',
            color: 'rgb(var(--content))',
            border: '1px solid rgb(var(--hairline))',
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '14px',
            boxShadow: 'var(--elevation-3)',
            maxWidth: '420px',
          },
          success: { iconTheme: { primary: 'rgb(var(--ok))', secondary: 'rgb(var(--surface))' } },
          error: { iconTheme: { primary: 'rgb(var(--risk))', secondary: 'rgb(var(--surface))' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
)
