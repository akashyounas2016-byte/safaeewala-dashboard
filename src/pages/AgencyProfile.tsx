import { useMemo } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useData } from '@/store/DataContext'
import { defaultAgencies } from '@/lib/defaultAgencies'
import { AgencyDashboard } from '@/components/agencies/AgencyDashboard'
import { slugifyAgencyName } from '@/lib/utils'

export function AgencyProfile() {
  const { id: routeAgencyId } = useParams<{ id?: string }>()
  const [searchParams] = useSearchParams()
  const queryAgencyId = searchParams.get('id') || searchParams.get('agencyId') || searchParams.get('name')
  const navigate = useNavigate()
  const { agencies } = useData()

  const rawParam = routeAgencyId || queryAgencyId || ''

  const agency = useMemo(() => {
    if (!rawParam) return null
    let decoded = ''
    try {
      decoded = decodeURIComponent(rawParam).toLowerCase().trim()
    } catch {
      decoded = rawParam.toLowerCase().trim()
    }
    const paramSlug = slugifyAgencyName(decoded)

    const normalizeFuzzy = (s: string) =>
      s.toLowerCase()
       .replace(/sifa/g, 'safa')
       .replace(/safaa/g, 'safa')
       .replace(/[^a-z0-9]/g, ' ')
       .replace(/\s+/g, ' ')
       .trim()

    const fuzzyParam = normalizeFuzzy(decoded)
    const paramWords = fuzzyParam
      .split(' ')
      .filter(w => w.length > 1 && !['llc', 'fze', 'est', 'agency', 'and', 'the', 'al'].includes(w))

    const pool = agencies && agencies.length > 0 ? agencies : defaultAgencies

    return (
      pool.find(a => {
        if (!a) return false
        const aId = (a.id || '').toLowerCase().trim()
        const aName = (a.name || '').toLowerCase().trim()
        const aSlug = slugifyAgencyName(a.name || '')
        const aFuzzy = normalizeFuzzy(a.name || '')

        // 1. Direct ID / Name / Slug exact match
        if (
          aId === decoded ||
          aName === decoded ||
          aSlug === paramSlug ||
          aSlug === decoded ||
          aId === paramSlug
        ) {
          return true
        }

        // 2. Substring matching
        if (decoded.length >= 3 && aName.includes(decoded)) return true
        if (paramSlug.length >= 3 && aSlug.includes(paramSlug)) return true

        // 3. Normalized fuzzy / transliteration match
        if (fuzzyParam.length >= 3 && (aFuzzy.includes(fuzzyParam) || fuzzyParam.includes(aFuzzy))) {
          return true
        }

        // 4. Token overlap matching (at least 2 distinctive words match)
        if (paramWords.length > 0) {
          const aWords = aFuzzy.split(' ')
          const matchedWords = paramWords.filter(pw => aWords.includes(pw))
          if (matchedWords.length >= 2 || (paramWords.length === 1 && matchedWords.length === 1)) {
            return true
          }
        }

        return false
      }) || null
    )
  }, [agencies, rawParam])

  const handleBack = () => {
    navigate('/agencies')
    const scrollEl = document.getElementById('main-content-scroll')
    if (scrollEl) {
      scrollEl.style.scrollBehavior = 'auto'
      scrollEl.scrollTop = 0
    }
    window.scrollTo(0, 0)
  }

  if (!agency) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center bg-white rounded-[28px] border border-slate-200">
        <Building2 size={40} className="text-slate-400 mb-3" />
        <h2 className="text-xl font-black text-slate-800">Agency Not Found</h2>
        <p className="text-[13px] text-slate-500 mt-1 max-w-sm">
          The requested agency vendor could not be located in the system.
        </p>
        <Button
          type="button"
          className="mt-4 bg-teal-600 hover:bg-teal-700 text-white font-bold"
          onClick={handleBack}
        >
          Return to Agencies List
        </Button>
      </div>
    )
  }

  return <AgencyDashboard agency={agency} onBack={handleBack} />
}
