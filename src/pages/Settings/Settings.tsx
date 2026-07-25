import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import PricingSettings from './PricingSettings.js'
import BrandingSettings from './BrandingSettings.js'
import SecuritySettings from './SecuritySettings.js'
import UsersList from '../Users/UsersList.js'
import SalaryTypes from './SalaryTypes.js'
import ServiceDefinitions from './ServiceDefinitions.js'
import PaymentMethods from './PaymentMethods.js'

type TabType = 'pricing' | 'branding' | 'security' | 'users' | 'salary_types' | 'services' | 'payment_methods'

interface TabDef {
  id: TabType
  labelAr: string
  labelEn: string
  icon: string
  descAr: string
  descEn: string
}

const TAB_DEFS: TabDef[] = [
  {
    id: 'pricing',
    labelAr: 'الأهداف والقدرة الاستيعابية',
    labelEn: 'Targets & Capacity',
    icon: '📈',
    descAr: 'الحدود الربحية والقدرة الاستيعابية — أسعار الخدمات في تبويب «الخدمات»',
    descEn: 'Profit targets and capacity — service pricing is on the "Services" tab',
  },
  {
    id: 'branding',
    labelAr: 'الهوية البصرية',
    labelEn: 'Branding',
    icon: '🎨',
    descAr: 'الشعار والألوان والبيانات التعريفية',
    descEn: 'Logo, colors and identity',
  },
  {
    id: 'security',
    labelAr: 'الأمان والمزامنة',
    labelEn: 'Security & Sync',
    icon: '🔒',
    descAr: 'كلمة المرور والمزامنة السحابية',
    descEn: 'Password and cloud sync',
  },
  {
    id: 'users',
    labelAr: 'المستخدمون',
    labelEn: 'User Accounts',
    icon: '👥',
    descAr: 'إدارة حسابات المسؤولين والموظفين',
    descEn: 'Manage admin and employee accounts',
  },
  {
    id: 'salary_types',
    labelAr: 'أنواع الرواتب',
    labelEn: 'Salary Types',
    icon: '📊',
    descAr: 'تعريف أنواع الرواتب وتعيينها للوظائف',
    descEn: 'Define salary types and assign to roles',
  },
  {
    id: 'services',
    labelAr: 'الخدمات',
    labelEn: 'Services',
    icon: '🏷️',
    descAr: 'تعريف الخدمات المتاحة وأسعارها',
    descEn: 'Define available services and pricing',
  },
  {
    id: 'payment_methods',
    labelAr: 'طرق الدفع',
    labelEn: 'Payment Methods',
    icon: '💳',
    descAr: 'إدارة طرق الدفع المتاحة للمدفوعات',
    descEn: 'Manage available payment methods',
  },
]

export default function Settings() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [activeTab, setActiveTab] = useState<TabType>('pricing')

  const activeTabDef = TAB_DEFS.find((tab) => tab.id === activeTab)!

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('settings')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isAr
            ? 'تكوين أسعار الخدمات الافتراضية والحدود الربحية وإعدادات النظام.'
            : 'Configure service rate defaults, targets, and system preferences.'}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-1" aria-label="Settings tabs">
          {TAB_DEFS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'group flex items-center gap-2 whitespace-nowrap py-3.5 px-4 border-b-2 font-medium text-sm transition-all focus:outline-none rounded-t-lg',
                  isActive
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                ].join(' ')}
                aria-selected={isActive}
                role="tab"
              >
                <span className="text-base">{tab.icon}</span>
                <span>{isAr ? tab.labelAr : tab.labelEn}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Active tab description */}
      <div className="flex items-center gap-2 -mt-2 pb-1">
        <span className="text-lg">{activeTabDef.icon}</span>
        <div>
          <span className="text-sm font-semibold text-slate-700">
            {isAr ? activeTabDef.labelAr : activeTabDef.labelEn}
          </span>
          <span className="text-slate-400 text-xs ms-2">
            — {isAr ? activeTabDef.descAr : activeTabDef.descEn}
          </span>
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'pricing' && <PricingSettings />}
        {activeTab === 'branding' && <BrandingSettings />}
        {activeTab === 'security' && <SecuritySettings />}
        {activeTab === 'users' && <UsersList />}
        {activeTab === 'salary_types' && <SalaryTypes />}
        {activeTab === 'services' && <ServiceDefinitions />}
        {activeTab === 'payment_methods' && <PaymentMethods />}
      </div>
    </div>
  )
}