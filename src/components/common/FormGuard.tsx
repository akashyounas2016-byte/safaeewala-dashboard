import { useEffect } from 'react'

/**
 * UX-84: required fields in every popup. A save stopped because a field is empty shows
 *  - a red message at the top of the form naming every missing field (a click jumps to it), and
 *  - a red outline on each missing field, removed as soon as it is edited.
 * <FormGuard /> does this for every field marked `required` (it replaces the browser's small bubble).
 * Forms that check values in code call requireFields(form, checks) for the same message.
 * Controlled forms can use useRequiredFields + <RequiredBanner> instead (`noValidate`).
 */

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
interface Flag { box: HTMLElement; label: string; focus: HTMLElement; native: boolean }

const BANNER_ATTR = 'data-form-guard-banner'
/** A form, or a popup body for popups without a <form> */
const flagsByRoot = new WeakMap<HTMLElement, Map<HTMLElement, Flag>>()
const roots = new Set<HTMLElement>()

const cleanLabel = (text: string) => text.replace(/\*/g, '').replace(/\s+/g, ' ').trim()

/** The visible name of a field: its <label>, a label next to it, or its placeholder / name */
function labelOf(el: HTMLElement): string {
  const own = (el as Control).labels?.[0]?.textContent
  if (own && cleanLabel(own)) return cleanLabel(own)
  let node: HTMLElement | null = el.parentElement
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    const label = node.querySelector('label')
    if (label && cleanLabel(label.textContent || '')) return cleanLabel(label.textContent || '')
  }
  return cleanLabel(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || 'Required field')
}

/** The box to outline: the field's own wrapper (label + input) when it has one, else the element */
function wrapperOf(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el.parentElement
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    if (node.tagName === 'FORM') break
    if (node.querySelector('label') && node.querySelectorAll('input:not([type=hidden]), select, textarea').length <= 2) return node
  }
  return el
}

function flagsOf(form: HTMLElement) {
  roots.add(form)
  if (!flagsByRoot.has(form)) flagsByRoot.set(form, new Map())
  return flagsByRoot.get(form)!
}

function addFlag(form: HTMLElement, el: HTMLElement, native: boolean, label?: string) {
  const box = wrapperOf(el)
  box.setAttribute('data-invalid', 'true')
  const focus = el.matches('input, select, textarea, button') ? el : el.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button') || el
  flagsOf(form).set(el, { box, label: label || labelOf(el), focus, native })
}

function removeFlag(form: HTMLElement, el: HTMLElement) {
  const flags = flagsByRoot.get(form)
  const flag = flags?.get(el)
  if (!flags || !flag) return
  if (![...flags.values()].some(f => f !== flag && f.box === flag.box)) flag.box.removeAttribute('data-invalid')
  flags.delete(el)
}

function jumpTo(flag: Flag) {
  flag.box.scrollIntoView({ behavior: 'smooth', block: 'center' })
  flag.focus.focus({ preventScroll: true })
}

function renderBanner(form: HTMLElement) {
  const flags = flagsByRoot.get(form)
  let banner = form.querySelector<HTMLDivElement>(`:scope > [${BANNER_ATTR}]`)
  if (!flags || flags.size === 0) { banner?.remove(); roots.delete(form); return }
  if (!banner) {
    banner = document.createElement('div')
    banner.setAttribute(BANNER_ATTR, '')
    banner.setAttribute('role', 'alert')
    banner.className = 'mb-3 px-3.5 py-2.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 text-[12.5px]'
    form.prepend(banner)
  }
  const title = document.createElement('p')
  title.className = 'font-bold'
  title.textContent = `⚠ Not saved: ${flags.size === 1 ? 'this field is required' : `${flags.size} required fields are empty`}`
  const list = document.createElement('div')
  list.className = 'mt-1.5 flex flex-wrap gap-1.5'
  flags.forEach(flag => {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'px-2 py-0.5 rounded-lg bg-white border border-rose-300 text-rose-700 font-semibold text-[11.5px] hover:bg-rose-100 cursor-pointer'
    chip.textContent = flag.label
    chip.onclick = () => jumpTo(flag)
    list.appendChild(chip)
  })
  banner.replaceChildren(title, list)
}

function showFirst(form: HTMLElement) {
  renderBanner(form)
  form.querySelector(`:scope > [${BANNER_ATTR}]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  const first = flagsByRoot.get(form)?.values().next().value
  first?.focus.focus({ preventScroll: true })
}

export interface RequireCheck {
  /** The field's `name` or `data-field` … */
  name?: string
  /** … or the element to outline (e.g. a table of days) */
  el?: HTMLElement | null
  /** Name in the message; defaults to the field's label */
  label?: string
  ok: boolean
}

/**
 * For forms that check values in code: outline every failed check and show the top message.
 * Returns true when all checks pass.
 */
export function requireFields(form: HTMLElement, checks: RequireCheck[]): boolean {
  checks.forEach(c => {
    const el = c.el || (c.name ? form.querySelector<HTMLElement>(`[name="${c.name}"], [data-field="${c.name}"]`) : null)
    if (!el) return
    if (c.ok) removeFlag(form, el)
    else addFlag(form, el, false, c.label)
  })
  const failed = checks.some(c => !c.ok)
  if (failed) showFirst(form)
  else renderBanner(form)
  return !failed
}

/** requireFields for a popup without a <form>: `from` is any element inside it, e.g. the Save button */
export function requireInPopup(from: EventTarget | null, checks: RequireCheck[]): boolean {
  const dialog = (from as HTMLElement | null)?.closest?.('[role=dialog]')
  const root = dialog?.querySelector<HTMLElement>('[data-modal-body]') || (from as HTMLElement | null)?.closest?.('form')
  return root ? requireFields(root, checks) : checks.every(c => c.ok)
}

export function FormGuard() {
  useEffect(() => {
    let batch: Control[] = []
    const flush = () => {
      const forms = new Set<HTMLFormElement>()
      batch.forEach(el => { if (el.form) { addFlag(el.form, el, true); forms.add(el.form) } })
      batch = []
      forms.forEach(showFirst)
    }
    const onInvalid = (e: Event) => {
      const el = e.target as Control
      if (!el.form) return
      e.preventDefault() // our message replaces the browser bubble
      if (batch.length === 0) queueMicrotask(flush)
      batch.push(el)
    }
    const onEdit = (e: Event) => {
      const target = e.target as HTMLElement
      roots.forEach(form => {
        const flags = flagsByRoot.get(form)
        if (!form.isConnected) { roots.delete(form); return }
        if (!flags || !form.contains(target)) return
        flags.forEach((flag, el) => {
          if (el !== target && !el.contains(target)) return
          if (flag.native && !(el as Control).validity?.valid) return
          removeFlag(form, el)
        })
        renderBanner(form)
      })
    }
    document.addEventListener('invalid', onInvalid, true)
    document.addEventListener('input', onEdit, true)
    document.addEventListener('change', onEdit, true)
    return () => {
      document.removeEventListener('invalid', onInvalid, true)
      document.removeEventListener('input', onEdit, true)
      document.removeEventListener('change', onEdit, true)
    }
  }, [])
  return null
}
