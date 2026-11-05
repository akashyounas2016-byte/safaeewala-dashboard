/**
 * UX-87: copy text on every address. `navigator.clipboard` exists only on https / localhost; on the
 * VPS address (http://187.77.116.14:8080) it is undefined, so Copy buttons silently did nothing.
 * The fallback copies through a hidden textarea. Returns true when the text was copied.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through to the textarea copy */ }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.top = '-1000px'
  area.style.opacity = '0'
  // inside an open popup the focus trap may keep focus, so append next to the active element
  const host = (document.activeElement?.closest('[role=dialog]') as HTMLElement | null) || document.body
  host.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  area.remove()
  return ok
}
