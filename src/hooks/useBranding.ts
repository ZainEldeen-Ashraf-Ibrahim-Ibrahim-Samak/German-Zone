import { useEffect } from 'react'
import { useBrandingStore } from '../store/useBrandingStore.js'

export function useBranding() {
  const { branding, isLoading, fetchBranding } = useBrandingStore()

  useEffect(() => {
    if (!branding && !isLoading) {
      fetchBranding()
    }
  }, [branding, isLoading, fetchBranding])

  return { branding, isLoading }
}
