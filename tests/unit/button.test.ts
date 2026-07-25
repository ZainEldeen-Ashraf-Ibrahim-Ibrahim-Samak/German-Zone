/**
 * Unit tests for Button component class-generation logic.
 *
 * No DOM rendering — mirrors the exact clsx conditions in
 * src/components/ui/Button.tsx and asserts the expected class tokens.
 * Pattern matches lessonFields.test.ts (private-logic replication).
 */
import { describe, it, expect } from 'vitest'
import clsx from 'clsx'

// ── replicated logic ────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost'
type Size    = 'sm' | 'md' | 'lg'

function buildButtonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string): string {
  return clsx(
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
    {
      'bg-primary hover:bg-primary-focus text-white focus:ring-primary':         variant === 'primary',
      'bg-accent hover:bg-accent-focus text-white focus:ring-accent':             variant === 'secondary',
      'border border-slate-300 hover:bg-slate-50 text-slate-700 focus:ring-slate-500': variant === 'outline',
      'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500':   variant === 'success',
      'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500':               variant === 'danger',
      'hover:bg-slate-100 text-slate-700 focus:ring-slate-500':                  variant === 'ghost',
    },
    {
      'px-3 py-1.5 text-sm':  size === 'sm',
      'px-4 py-2 text-base':  size === 'md',
      'px-6 py-3 text-lg':    size === 'lg',
    },
    extra,
  )
}

// Spinner class exactly as written in Button.tsx after the RTL fix
const SPINNER_CLASS = 'animate-spin -ms-1 me-2 h-4 w-4 text-current flex-shrink-0'

// Disabled state logic: button is disabled when `disabled || isLoading`
function isButtonDisabled(disabled: boolean, isLoading: boolean): boolean {
  return disabled || isLoading
}

// ── shared base classes ─────────────────────────────────────────────────────

const BASE_CLASSES = [
  'inline-flex', 'items-center', 'justify-center', 'font-medium',
  'rounded-lg', 'transition-colors', 'focus:outline-none',
  'disabled:opacity-50', 'disabled:cursor-not-allowed',
]

function hasAll(cls: string, tokens: string[]) {
  return tokens.every((t) => cls.split(' ').includes(t))
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('Button class logic', () => {

  // Base classes
  it('includes base layout and accessibility classes for every variant', () => {
    for (const v of ['primary', 'secondary', 'danger', 'success', 'outline', 'ghost'] as Variant[]) {
      const cls = buildButtonClass(v)
      expect(hasAll(cls, BASE_CLASSES), `variant=${v} missing base classes`).toBe(true)
    }
  })

  // Variant: primary
  it('primary variant uses bg-primary and text-white', () => {
    const cls = buildButtonClass('primary')
    expect(cls).toContain('bg-primary')
    expect(cls).toContain('text-white')
    expect(cls).toContain('focus:ring-primary')
  })

  // Variant: secondary
  it('secondary variant uses bg-accent and text-white', () => {
    const cls = buildButtonClass('secondary')
    expect(cls).toContain('bg-accent')
    expect(cls).toContain('text-white')
    expect(cls).toContain('focus:ring-accent')
  })

  // Variant: danger
  it('danger variant uses bg-red-600', () => {
    const cls = buildButtonClass('danger')
    expect(cls).toContain('bg-red-600')
    expect(cls).toContain('hover:bg-red-700')
    expect(cls).toContain('focus:ring-red-500')
    // Must not bleed into other variants
    expect(cls).not.toContain('bg-primary')
    expect(cls).not.toContain('bg-emerald')
  })

  // Variant: success
  it('success variant uses bg-emerald-600', () => {
    const cls = buildButtonClass('success')
    expect(cls).toContain('bg-emerald-600')
    expect(cls).toContain('hover:bg-emerald-700')
    expect(cls).not.toContain('bg-red')
  })

  // Variant: outline
  it('outline variant uses border and no solid background', () => {
    const cls = buildButtonClass('outline')
    expect(cls).toContain('border')
    expect(cls).toContain('border-slate-300')
    expect(cls).toContain('text-slate-700')
    expect(cls).not.toContain('bg-primary')
    expect(cls).not.toContain('text-white')
  })

  // Variant: ghost
  it('ghost variant has no border and no solid background', () => {
    const cls = buildButtonClass('ghost')
    expect(cls).toContain('hover:bg-slate-100')
    expect(cls).not.toContain('border')
    expect(cls).not.toContain('bg-primary')
  })

  // Size: sm
  it('sm size uses px-3 py-1.5 text-sm', () => {
    const cls = buildButtonClass('primary', 'sm')
    expect(cls).toContain('px-3')
    expect(cls).toContain('py-1.5')
    expect(cls).toContain('text-sm')
    expect(cls).not.toContain('px-4')
    expect(cls).not.toContain('px-6')
  })

  // Size: md (default)
  it('md size uses px-4 py-2 text-base', () => {
    const cls = buildButtonClass('primary', 'md')
    expect(cls).toContain('px-4')
    expect(cls).toContain('py-2')
    expect(cls).toContain('text-base')
    expect(cls).not.toContain('text-sm')
    expect(cls).not.toContain('text-lg')
  })

  // Size: lg
  it('lg size uses px-6 py-3 text-lg', () => {
    const cls = buildButtonClass('primary', 'lg')
    expect(cls).toContain('px-6')
    expect(cls).toContain('py-3')
    expect(cls).toContain('text-lg')
    expect(cls).not.toContain('px-3')
    expect(cls).not.toContain('px-4')
  })

  // Extra (className prop merge)
  it('merges extra className at the end', () => {
    const cls = buildButtonClass('primary', 'md', 'w-full mt-1')
    expect(cls).toContain('w-full')
    expect(cls).toContain('mt-1')
    expect(cls).toContain('bg-primary')
  })

  // Variant isolation: only one variant's classes appear at a time
  it('each variant produces mutually exclusive color tokens', () => {
    const variants: Variant[] = ['primary', 'secondary', 'danger', 'success', 'outline', 'ghost']
    for (const v of variants) {
      const cls = buildButtonClass(v)
      const otherColors = variants.filter((x) => x !== v)
      // Classes that are exclusive to specific variants
      const exclusiveMap: Record<string, string> = {
        primary: 'bg-primary',
        secondary: 'bg-accent',
        danger: 'bg-red-600',
        success: 'bg-emerald-600',
      }
      for (const other of otherColors) {
        const exclusive = exclusiveMap[other]
        if (exclusive) {
          expect(cls, `${v} should not contain ${exclusive}`).not.toContain(exclusive)
        }
      }
    }
  })
})

describe('Button disabled / loading logic', () => {
  it('not disabled and not loading → enabled', () => {
    expect(isButtonDisabled(false, false)).toBe(false)
  })

  it('disabled=true → disabled regardless of isLoading', () => {
    expect(isButtonDisabled(true, false)).toBe(true)
    expect(isButtonDisabled(true, true)).toBe(true)
  })

  it('isLoading=true → disabled even when disabled prop is false', () => {
    expect(isButtonDisabled(false, true)).toBe(true)
  })
})

describe('Button spinner RTL classes', () => {
  it('spinner uses logical margin-inline-start (-ms-1) not physical -ml-1', () => {
    expect(SPINNER_CLASS).toContain('-ms-1')
    expect(SPINNER_CLASS).not.toContain('-ml-1')
  })

  it('spinner uses logical margin-inline-end (me-2) not physical mr-2', () => {
    expect(SPINNER_CLASS).toContain('me-2')
    expect(SPINNER_CLASS).not.toContain('mr-2')
  })

  it('spinner includes flex-shrink-0 to prevent layout collapse', () => {
    expect(SPINNER_CLASS).toContain('flex-shrink-0')
  })

  it('spinner has animate-spin and correct size', () => {
    expect(SPINNER_CLASS).toContain('animate-spin')
    expect(SPINNER_CLASS).toContain('h-4')
    expect(SPINNER_CLASS).toContain('w-4')
    expect(SPINNER_CLASS).toContain('text-current')
  })
})
