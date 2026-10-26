import type { Agency } from '@/types'

// ── XML Escaping Helper for SVG Generation ──
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ── Instant Digital UAE Certificate Generator (for quick Trade Lic & NOC viewing) ──
export function generateCertificateDataUrl(
  agency: Agency,
  category: 'trade_license' | 'noc',
  certNumber: string
): string {
  const isTradeLicense = category === 'trade_license'
  const title = isTradeLicense ? 'COMMERCIAL TRADE LICENSE' : 'NO OBJECTION CERTIFICATE (NOC)'
  const authority = isTradeLicense
    ? 'GOVERNMENT OF DUBAI — DEPARTMENT OF ECONOMY & TOURISM'
    : 'MINISTRY OF HUMAN RESOURCES & EMIRATISATION (MOHRE)'
  const emirate = 'DUBAI, UNITED ARAB EMIRATES'
  const issueDate = escapeXml(agency.license_issue_date || '2024-01-01')
  const expiryDate = escapeXml(agency.license_expiry_date || '2027-12-31')
  const primaryContact = escapeXml(agency.contact_person || 'Authorized Corporate Representative')
  const trn = escapeXml(agency.trn_no || '100234567800001')
  const safeName = escapeXml(agency.name)
  const safeCert = escapeXml(certNumber)
  const safeType = escapeXml(agency.company_type || 'Commercial Partner')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" width="900" height="600">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#f8fafc"/>
      </linearGradient>
    </defs>
    <rect x="15" y="15" width="870" height="570" rx="20" fill="url(#bgGrad)" stroke="#cbd5e1" stroke-width="2"/>
    <rect x="25" y="25" width="850" height="550" rx="16" fill="none" stroke="#0d9488" stroke-width="2" stroke-dasharray="6,4" opacity="0.6"/>

    <rect x="40" y="40" width="820" height="85" rx="14" fill="#0f172a"/>
    <text x="70" y="75" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="800" fill="#2dd4bf" letter-spacing="2">${authority}</text>
    <text x="70" y="102" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="900" fill="#ffffff" letter-spacing="0.5">${title}</text>
    <text x="830" y="85" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#94a3b8">${emirate}</text>

    <g transform="translate(670, 145)">
      <rect x="0" y="0" width="170" height="32" rx="16" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="1.5"/>
      <circle cx="20" cy="16" r="6" fill="#10b981"/>
      <text x="35" y="21" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="800" fill="#065f46" letter-spacing="1">VERIFIED ACTIVE</text>
    </g>

    <text x="70" y="170" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="800" fill="#64748b" letter-spacing="1.5">REGISTERED ENTITY / COMPANY NAME</text>
    <text x="70" y="205" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="900" fill="#0f172a">${safeName}</text>

    <g transform="translate(70, 240)">
      <g>
        <rect x="0" y="0" width="230" height="68" rx="10" fill="#f1f5f9" stroke="#e2e8f0"/>
        <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#64748b" letter-spacing="1">${isTradeLicense ? 'TRADE LICENSE NO' : 'NOC REFERENCE NO'}</text>
        <text x="16" y="50" font-family="Courier, monospace" font-size="16" font-weight="900" fill="#0f766e">${safeCert}</text>
      </g>
      <g transform="translate(250, 0)">
        <rect x="0" y="0" width="230" height="68" rx="10" fill="#f1f5f9" stroke="#e2e8f0"/>
        <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#64748b" letter-spacing="1">TAX TRN NUMBER</text>
        <text x="16" y="50" font-family="Courier, monospace" font-size="15" font-weight="800" fill="#334155">${trn}</text>
      </g>
      <g transform="translate(500, 0)">
        <rect x="0" y="0" width="260" height="68" rx="10" fill="#f1f5f9" stroke="#e2e8f0"/>
        <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#64748b" letter-spacing="1">LEGAL STATUS / CATEGORY</text>
        <text x="16" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" fill="#334155">${safeType}</text>
      </g>
    </g>

    <g transform="translate(70, 330)">
      <g>
        <rect x="0" y="0" width="230" height="68" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
        <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#64748b" letter-spacing="1">ISSUE DATE</text>
        <text x="16" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="800" fill="#0f172a">${issueDate}</text>
      </g>
      <g transform="translate(250, 0)">
        <rect x="0" y="0" width="230" height="68" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
        <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#64748b" letter-spacing="1">EXPIRY DATE</text>
        <text x="16" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="800" fill="#0f172a">${expiryDate}</text>
      </g>
      <g transform="translate(500, 0)">
        <rect x="0" y="0" width="260" height="68" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
        <text x="16" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" fill="#64748b" letter-spacing="1">AUTHORIZED CONTACT</text>
        <text x="16" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" fill="#0f172a">${primaryContact}</text>
      </g>
    </g>

    <line x1="70" y1="430" x2="830" y2="430" stroke="#cbd5e1" stroke-width="1"/>
    <g transform="translate(70, 450)">
      <text x="0" y="20" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="700" fill="#64748b">Verified by Safaeewala Procurement &amp; Compliance Management Portal</text>
      <text x="0" y="38" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="500" fill="#94a3b8">This electronic document verification record confirms active registration in accordance with UAE commercial law.</text>
    </g>

    <g transform="translate(730, 440)">
      <circle cx="45" cy="45" r="42" fill="none" stroke="#0d9488" stroke-width="2.5" stroke-dasharray="4,2"/>
      <circle cx="45" cy="45" r="36" fill="none" stroke="#0d9488" stroke-width="1"/>
      <text x="45" y="42" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="900" fill="#0d9488" letter-spacing="1">GOVT OF DUBAI</text>
      <text x="45" y="55" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="800" fill="#0d9488">VALIDATED</text>
    </g>
  </svg>`

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}
