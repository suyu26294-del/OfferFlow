'use client'

import { ThemeProvider } from '@/store/ThemeContext'
import { AppProvider } from '@/store/AppContext'
import { AuthProvider } from '@/store/AuthContext'

export default function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          {children}
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
