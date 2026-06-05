import { useState, useEffect } from 'react'

export function useDarkMode() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Check localStorage
    const stored = localStorage.getItem('theme-mode')
    if (stored) {
      setIsDark(stored === 'dark')
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setIsDark(prefersDark)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
      localStorage.setItem('theme-mode', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme-mode', 'light')
    }
  }, [isDark])

  return {
    isDark,
    toggleDark: () => setIsDark(!isDark),
  }
}
