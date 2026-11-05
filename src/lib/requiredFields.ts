import { useState } from 'react'

/**
 * UX-84: required fields in every popup. Nothing is saved while one is empty: a banner at the top
 * names each missing field and the field itself gets a red outline until it is filled.
 */
export interface RequiredRule {
  /** Matches `data-field` on the field's wrapper */
  key: string
  /** Name shown in the banner */
  label: string
  /** True when the field is filled correctly */
  ok: boolean
}

/** Rules that are not satisfied, in form order */
export function missingFields(rules: RequiredRule[]): RequiredRule[] {
  return rules.filter(r => !r.ok)
}

/** Scroll to a field and put the cursor in it, if it has an input */
export function focusField(key: string, root: ParentNode = document) {
  const el = root.querySelector<HTMLElement>(`[data-field="${key}"]`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const input = el.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, [tabindex], button')
  input?.focus({ preventScroll: true })
}

/**
 * Pass this render's rules. `check()` on save returns false (and shows the banner) when a field is
 * missing; afterwards the banner and outlines follow the values, so they clear as fields are filled.
 */
export function useRequiredFields(rules: RequiredRule[]) {
  const [tried, setTried] = useState(false)
  const missing = tried ? missingFields(rules) : []
  const missingKeys = new Set(missing.map(r => r.key))
  return {
    missing,
    check(): boolean {
      setTried(true)
      const now = missingFields(rules)
      if (now.length > 0) {
        // the banner renders on this click; bring it and the first field into view after it does
        setTimeout(() => {
          document.querySelector('[data-required-banner]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          focusField(now[0].key)
        }, 0)
      }
      return now.length === 0
    },
    reset() { setTried(false) },
    /** Spread on the field's wrapper: `<div {...field('address')}>` */
    field(key: string) {
      return { 'data-field': key, 'data-invalid': missingKeys.has(key) ? 'true' : undefined }
    },
  }
}
