import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'

import en from './locales/en.json'
import zh from './locales/zh.json'
import fr from './locales/fr.json'
import ar from './locales/ar.json'
import zh_TW from './locales/zh_TW.json'
import ru from './locales/ru.json'
import ja from './locales/ja.json'
import de from './locales/de.json'
import uk from './locales/uk.json'
import ko from './locales/ko.json'
import vi from './locales/vi.json'

// Detect default language based on timezone and browser language
const detectDefaultLanguage = (): string => {
  try {
    // Check timezone first
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timezone) {
      // CJK timezones (China, Japan, Korea, Taiwan, etc.)
      const cjkTimezones = [
        'Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Urumqi',
        'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei',
        'Asia/Tokyo', 'Asia/Seoul', 'Asia/Pyongyang',
      ]
      if (cjkTimezones.some(tz => timezone.startsWith(tz))) {
        // Check if it's Taiwan specifically
        if (timezone === 'Asia/Taipei') return 'zh_TW'
        return 'zh'
      }
    }

    // Fallback to browser language
    const browserLang = navigator.language || (navigator as any).userLanguage || 'en'
    const langMap: Record<string, string> = {
      'zh': 'zh',
      'zh-cn': 'zh',
      'zh-hans': 'zh',
      'zh-tw': 'zh_TW',
      'zh-hk': 'zh_TW',
      'zh-hant': 'zh_TW',
      'ja': 'ja',
      'ko': 'ko',
      'fr': 'fr',
      'ar': 'ar',
      'ru': 'ru',
      'de': 'de',
      'uk': 'uk',
      'vi': 'vi',
    }

    // Try exact match first, then prefix match
    const lowerLang = browserLang.toLowerCase()
    if (langMap[lowerLang]) return langMap[lowerLang]
    const prefix = lowerLang.split('-')[0]
    if (langMap[prefix]) return langMap[prefix]
  } catch (e) {
    console.error('Language detection failed:', e)
  }
  return 'en'
}

const getStoredLanguage = () => {
  try {
    const settingsString = localStorage.getItem('settings-storage')
    if (settingsString) {
      const settings = JSON.parse(settingsString)
      if (settings.state?.language) {
        return settings.state.language
      }
    }
  } catch (e) {
    console.error('Failed to get stored language:', e)
  }
  // No stored language — auto-detect
  return detectDefaultLanguage()
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
      fr: { translation: fr },
      ar: { translation: ar },
      zh_TW: { translation: zh_TW },
      ru: { translation: ru },
      ja: { translation: ja },
      de: { translation: de },
      uk: { translation: uk },
      ko: { translation: ko },
      vi: { translation: vi }
    },
    lng: getStoredLanguage(), // Use stored language settings
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    // Configuration to handle missing translations
    returnEmptyString: false,
    returnNull: false,
  })

// Subscribe to language changes
useSettingsStore.subscribe((state) => {
  const currentLanguage = state.language
  if (i18n.language !== currentLanguage) {
    i18n.changeLanguage(currentLanguage)
  }
})

export default i18n
