import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button.js'

export const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation()

  const currentLang = i18n.language

  const toggleLanguage = () => {
    const nextLang = currentLang === 'ar' ? 'en' : 'ar'
    i18n.changeLanguage(nextLang)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleLanguage}
      className="flex items-center gap-1.5 font-semibold text-slate-600 hover:text-primary transition-colors border-slate-200"
    >
      <svg
        className="h-4.5 w-4.5 text-slate-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 11.37 7.37 16.5 3 19"
        />
      </svg>
      <span>{currentLang === 'ar' ? 'English' : 'العربية'}</span>
    </Button>
  )
}
