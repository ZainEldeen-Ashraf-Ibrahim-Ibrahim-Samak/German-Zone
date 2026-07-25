import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from './ar.json'
import en from './en.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ar,
      en,
    },
    lng: 'ar', // Default to Arabic per requirements (Cairo font, EGP currency)
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  })

const updateHtmlDirection = (lang: string) => {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

i18n.on('languageChanged', (lang) => {
  updateHtmlDirection(lang)
})

// Run initially
updateHtmlDirection(i18n.language || 'ar')

export default i18n
