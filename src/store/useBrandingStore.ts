import { create } from 'zustand'
import i18n from 'i18next'

export interface BrandingData {
  brand_app_name: string
  brand_org_name: string
  brand_tagline: string
  brand_primary_color: string
  brand_accent_color: string
  brand_logo_path: string
  brand_icon_path: string
  brand_phone: string
  brand_address: string
  brand_email: string
  brand_show_logo_sidebar: string
  brand_show_logo_login: string
  brand_show_logo_export: string
}

interface BrandingState {
  branding: BrandingData | null
  isLoading: boolean
  fetchBranding: () => Promise<void>
  updateBrandingLocal: (data: Partial<BrandingData>) => void
}

export const useBrandingStore = create<BrandingState>((set) => ({
  branding: null,
  isLoading: false,
  fetchBranding: async () => {
    set({ isLoading: true })
    try {
      const data = await window.api.branding.get()
      set({ branding: data as any, isLoading: false })
      
      if (data) {
        const root = document.documentElement
        if (data.brand_primary_color) {
          root.style.setProperty('--color-primary', data.brand_primary_color)
          // Derive a slightly darker version for hover/focus state
          // For simplicity, we can set the focus version to same or standard hover
          root.style.setProperty('--color-primary-focus', `${data.brand_primary_color}dd`)
        }
        if (data.brand_accent_color) {
          root.style.setProperty('--color-accent', data.brand_accent_color)
          root.style.setProperty('--color-accent-focus', `${data.brand_accent_color}dd`)
        }
        
        // Update document title
        const appName = data.brand_app_name || i18n.t('app_name')
        const tagline = data.brand_tagline || ''
        document.title = tagline ? `${appName} - ${tagline}` : appName
      }
    } catch (err) {
      console.error('Fetch branding error:', err)
      set({ isLoading: false })
    }
  },
  updateBrandingLocal: (data) => {
    set((state) => {
      const updated = state.branding ? { ...state.branding, ...data } : null
      if (updated) {
        const root = document.documentElement
        if (data.brand_primary_color) {
          root.style.setProperty('--color-primary', data.brand_primary_color)
          root.style.setProperty('--color-primary-focus', `${data.brand_primary_color}dd`)
        }
        if (data.brand_accent_color) {
          root.style.setProperty('--color-accent', data.brand_accent_color)
          root.style.setProperty('--color-accent-focus', `${data.brand_accent_color}dd`)
        }
      }
      return { branding: updated }
    })
  }
}))
