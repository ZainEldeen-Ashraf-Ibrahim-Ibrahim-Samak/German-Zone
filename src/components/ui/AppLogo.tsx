import * as React from 'react'
import { useBranding } from '../../hooks/useBranding.js'

interface AppLogoProps {
  className?: string
  logoClassName?: string
}

export const AppLogo: React.FC<AppLogoProps> = ({ className = 'w-10 h-10', logoClassName = '' }) => {
  const { branding } = useBranding()

  const logoUrl = branding?.brand_logo_path 
    ? `asset://${branding.brand_logo_path}` 
    : null

  if (logoUrl) {
    return (
      <div className={`flex items-center justify-center overflow-hidden ${className}`}>
        <img 
          src={logoUrl} 
          alt={branding?.brand_app_name || 'App Logo'} 
          className={`object-contain max-h-full max-w-full ${logoClassName}`}
        />
      </div>
    )
  }

  // Default Fallback circular logo
  return (
    <div className={`flex items-center justify-center rounded-lg bg-primary text-white font-bold shadow-sm uppercase ${className}`}>
      {branding?.brand_app_name ? branding.brand_app_name[0] : 'ز'}
    </div>
  )
}
export default AppLogo
