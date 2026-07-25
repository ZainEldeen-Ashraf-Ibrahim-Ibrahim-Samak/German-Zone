import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBrandingStore, type BrandingData } from '../../store/useBrandingStore.js'
import { Card } from '../../components/ui/Card.js'
import { Button } from '../../components/ui/Button.js'
import { Input } from '../../components/ui/Input.js'
import { Alert } from '../../components/ui/Alert.js'
import { ColorPicker } from '../../components/ui/ColorPicker.js'
import { ImageUpload } from '../../components/ui/ImageUpload.js'
import { Modal } from '../../components/ui/Modal.js'

export default function BrandingSettings() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const { branding, fetchBranding, updateBrandingLocal } = useBrandingStore()

  const [form, setForm] = useState<Partial<BrandingData>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Load branding on mount
  useEffect(() => {
    fetchBranding()
  }, [])

  // Sync local form when store branding changes
  useEffect(() => {
    if (branding) {
      setForm({ ...branding })
    }
  }, [branding])

  const updateForm = (key: keyof BrandingData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    // Apply live updates for color and title changes
    if (key === 'brand_primary_color') {
      document.documentElement.style.setProperty('--color-primary', value)
      document.documentElement.style.setProperty('--color-primary-focus', `${value}dd`)
    }
    if (key === 'brand_accent_color') {
      document.documentElement.style.setProperty('--color-accent', value)
      document.documentElement.style.setProperty('--color-accent-focus', `${value}dd`)
    }
    if (key === 'brand_app_name' || key === 'brand_tagline') {
      const appName = key === 'brand_app_name' ? value : (form.brand_app_name || '')
      const tagline = key === 'brand_tagline' ? value : (form.brand_tagline || '')
      document.title = tagline ? `${appName} - ${tagline}` : appName
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      // Filter out undefined values before saving
      const cleanForm: Record<string, string> = {}
      for (const [k, v] of Object.entries(form)) {
        if (v !== undefined && v !== null) cleanForm[k] = String(v)
      }
      await window.api.branding.save(cleanForm)
      updateBrandingLocal(form)
      setSuccess(isAr ? 'تم حفظ إعدادات الهوية البصرية بنجاح ✓' : 'Branding settings saved successfully ✓')
      await fetchBranding()
    } catch (err: any) {
      let msg = err.message || 'Failed to save branding'
      if (msg.includes('Error invoking remote method')) {
        msg = msg.replace(/^Error: Error invoking remote method '[^']+': /, '')
      }
      setError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    setIsResetting(true)
    setError(null)
    try {
      await window.api.branding.reset()
      await fetchBranding()
      setShowResetConfirm(false)
      setSuccess(isAr ? 'تم استعادة الإعدادات الافتراضية.' : 'Branding reset to defaults.')
    } catch (err: any) {
      let msg = err.message || 'Failed to reset branding'
      if (msg.includes('Error invoking remote method')) {
        msg = msg.replace(/^Error: Error invoking remote method '[^']+': /, '')
      }
      setError(msg)
    } finally {
      setIsResetting(false)
    }
  }

  const handleLogoUpload = async () => {
    const result = await window.api.branding.uploadLogo()
    if (result) {
      updateForm('brand_logo_path', result.path)
      await window.api.branding.save({ ...form, brand_logo_path: result.path })
      await fetchBranding()
    }
    return result
  }

  const handleIconUpload = async () => {
    const result = await window.api.branding.uploadIcon()
    if (result) {
      updateForm('brand_icon_path', result.path)
      await window.api.branding.save({ ...form, brand_icon_path: result.path })
      await fetchBranding()
      // Inform user about installer icon rebuild
      alert(
        isAr
          ? '✅ تم تحديث أيقونة النافذة. ملاحظة: تغيير أيقونة المثبِّت (setup.exe) يتطلب إعادة بناء التطبيق باستخدام "npm run dist".'
          : '✅ Window icon updated. Note: changing the installer icon requires rebuilding the app with "npm run dist".'
      )
    }
    return result
  }

  return (
    <div className="space-y-6">
      {success && (
        <Alert variant="success" title={isAr ? 'تم الحفظ' : 'Saved'} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert variant="danger" title={isAr ? 'خطأ' : 'Error'} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Identity & Text */}
      <Card className="p-6 space-y-5">
        <h2 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-3">
          🏷️ {isAr ? 'هوية المنشأة والنصوص' : 'Brand Identity & Text'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input
            label={isAr ? 'اسم التطبيق' : 'App Name'}
            value={form.brand_app_name || ''}
            onChange={(e) => updateForm('brand_app_name', e.target.value)}
          />
          <Input
            label={isAr ? 'اسم المنشأة' : 'Organization Name'}
            value={form.brand_org_name || ''}
            onChange={(e) => updateForm('brand_org_name', e.target.value)}
          />
          <Input
            label={isAr ? 'الشعار الوصفي / الشعار' : 'Tagline'}
            value={form.brand_tagline || ''}
            onChange={(e) => updateForm('brand_tagline', e.target.value)}
          />
        </div>
      </Card>

      {/* Contact Details */}
      <Card className="p-6 space-y-5">
        <h2 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-3">
          📞 {isAr ? 'بيانات التواصل (تظهر في التصدير)' : 'Contact Details (appear in exports)'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Input
            label={isAr ? 'رقم الهاتف' : 'Phone'}
            value={form.brand_phone || ''}
            onChange={(e) => updateForm('brand_phone', e.target.value)}
          />
          <Input
            label={isAr ? 'البريد الإلكتروني' : 'Email'}
            type="email"
            value={form.brand_email || ''}
            onChange={(e) => updateForm('brand_email', e.target.value)}
          />
          <Input
            label={isAr ? 'العنوان' : 'Address'}
            value={form.brand_address || ''}
            onChange={(e) => updateForm('brand_address', e.target.value)}
          />
        </div>
      </Card>

      {/* Colors (T079: live application) */}
      <Card className="p-6 space-y-5">
        <h2 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-3">
          🎨 {isAr ? 'الألوان (تُطبَّق فوراً)' : 'Colors (applied instantly)'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ColorPicker
            label={isAr ? 'اللون الأساسي' : 'Primary Color'}
            value={form.brand_primary_color || '#0f766e'}
            onChange={(color) => updateForm('brand_primary_color', color)}
            description={isAr ? 'لون الأزرار والروابط والعناصر التفاعلية' : 'Buttons, links, and interactive elements'}
          />
          <ColorPicker
            label={isAr ? 'لون التمييز' : 'Accent Color'}
            value={form.brand_accent_color || '#f59e0b'}
            onChange={(color) => updateForm('brand_accent_color', color)}
            description={isAr ? 'لون عناصر التمييز والتوكيد' : 'Highlight and emphasis elements'}
          />
        </div>

        {/* Live preview swatches */}
        <div className="flex items-center gap-4 pt-2">
          <div className="text-xs text-slate-400">{isAr ? 'معاينة:' : 'Preview:'}</div>
          <button
            className="px-4 py-2 rounded-lg text-white text-sm font-semibold shadow-sm"
            style={{ backgroundColor: form.brand_primary_color || '#0f766e' }}
          >
            {isAr ? 'زر رئيسي' : 'Primary Button'}
          </button>
          <button
            className="px-4 py-2 rounded-lg text-white text-sm font-semibold shadow-sm"
            style={{ backgroundColor: form.brand_accent_color || '#f59e0b' }}
          >
            {isAr ? 'زر تمييز' : 'Accent Button'}
          </button>
          <div
            className="h-8 px-3 rounded flex items-center text-xs font-semibold text-white"
            style={{ backgroundColor: form.brand_primary_color || '#0f766e', opacity: 0.8 }}
          >
            Badge
          </div>
        </div>
      </Card>

      {/* Logo & Icon (T079: upload) */}
      <Card className="p-6 space-y-5">
        <h2 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-3">
          🖼️ {isAr ? 'الشعار والأيقونة' : 'Logo & Icon'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ImageUpload
            label={isAr ? 'شعار المنشأة (PNG/JPG/SVG)' : 'Organization Logo (PNG/JPG/SVG)'}
            currentPath={form.brand_logo_path}
            onUpload={handleLogoUpload}
            description={isAr ? 'يظهر في الشريط الجانبي وصفحة تسجيل الدخول والتقارير المُصدَّرة' : 'Shown in sidebar, login screen, and exported reports'}
          />
          <ImageUpload
            label={isAr ? 'أيقونة التطبيق (ICO/PNG)' : 'App Icon (ICO/PNG)'}
            currentPath={form.brand_icon_path}
            onUpload={handleIconUpload}
            description={isAr ? 'تُطبَّق فوراً على شريط المهام. تغيير أيقونة المثبِّت يتطلب إعادة البناء.' : 'Applied immediately to taskbar. Installer icon requires rebuild.'}
          />
        </div>

        {/* Logo visibility toggles */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-sm font-medium text-slate-600">{isAr ? 'إظهار الشعار في:' : 'Show logo in:'}</p>
          <div className="flex flex-wrap gap-4">
            {[
              { key: 'brand_show_logo_sidebar', label: isAr ? 'الشريط الجانبي' : 'Sidebar' },
              { key: 'brand_show_logo_login', label: isAr ? 'صفحة تسجيل الدخول' : 'Login Page' },
              { key: 'brand_show_logo_export', label: isAr ? 'ترويسة التصدير' : 'Export Header' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[key as keyof BrandingData] === '1'}
                  onChange={(e) => updateForm(key as keyof BrandingData, e.target.checked ? '1' : '0')}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-slate-700">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </Card>

      {/* Action buttons */}
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => setShowResetConfirm(true)}
        >
          🔄 {isAr ? 'استعادة الإعدادات الافتراضية' : 'Reset to Defaults'}
        </Button>

        <Button
          variant="primary"
          onClick={handleSave}
          isLoading={isSaving}
          disabled={isSaving}
        >
          💾 {isAr ? 'حفظ إعدادات الهوية البصرية' : 'Save Branding Settings'}
        </Button>
      </div>

      {/* Reset Confirm Modal */}
      <Modal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title={isAr ? 'تأكيد استعادة الإعدادات' : 'Confirm Reset'}
      >
        <div className="space-y-4 mt-2">
          <p className="text-slate-600 text-sm">
            {isAr
              ? 'هل أنت متأكد من استعادة جميع إعدادات الهوية البصرية إلى قيمها الافتراضية؟ سيتم فقدان التخصيصات الحالية.'
              : 'Are you sure you want to restore all branding settings to their defaults? Current customizations will be lost.'}
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
              {isAr ? 'تراجع' : 'Cancel'}
            </Button>
            <Button variant="danger" onClick={handleReset} isLoading={isResetting}>
              {isAr ? 'نعم، استعادة الافتراضي' : 'Yes, Reset'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
