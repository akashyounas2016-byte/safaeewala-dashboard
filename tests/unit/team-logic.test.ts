// Team isolation and multi-cleaner verification rules (R-SCHED-01, R-TEAM-01)
import { normalizeJobAddress, isGenericAddress, cleanAddressDisplay } from '@/lib/utils'
import { getMultiCleanerPaymentInfo, checkTimesOverlap } from '@/pages/JobSheetSpreadsheet'
import type { DailyJob } from '@/types'

const eq = (a: unknown, b: unknown, m: string) => {
  if (a !== b) {
    console.log('FAIL', m, a, b)
    process.exitCode = 1
  } else {
    console.log('PASS ', m)
  }
}

// 1. Address Normalization
eq(normalizeJobAddress('Villa 104, Springs (Monthly)'), 'villa 104 springs', 'strips punctuation and monthly tag')
eq(normalizeJobAddress('Flat 202 - Marina Gate [Monthly]'), 'flat 202 marina gate', 'strips brackets and tags')

// 2. Generic Address Detection
eq(isGenericAddress('Villa'), true, 'generic Villa rejected')
eq(isGenericAddress('Dubai'), true, 'generic Dubai rejected')
eq(isGenericAddress('custom'), true, 'generic custom rejected')
eq(isGenericAddress('—'), true, 'generic dash rejected')
eq(isGenericAddress(''), true, 'empty rejected')
eq(isGenericAddress('Villa 14, JVC'), false, 'specific address allowed')
eq(isGenericAddress('807 Nilofer Tower'), false, 'specific tower allowed')

// 3. Time Overlap
eq(checkTimesOverlap('09:00 AM', '01:00 PM', '10:00 AM', '02:00 PM'), true, 'overlapping times detected')
eq(checkTimesOverlap('09:00 AM', '01:00 PM', '02:00 PM', '06:00 PM'), false, 'non-overlapping times separated')

// 4. Multi-Cleaner Isolation by Address
const job1: DailyJob = {
  id: 'j1',
  date: '2026-10-31',
  staff_name: 'Cleaner A',
  address: '807 Nilofer Tower',
  start_time: '09:00 AM',
  end_time: '01:00 PM',
  charges: 200,
  received: 200,
  created_at: new Date().toISOString()
}

const job2DifferentAddress: DailyJob = {
  id: 'j2',
  date: '2026-10-31',
  staff_name: 'Cleaner B',
  address: '202 Salama Tower',
  start_time: '09:00 AM',
  end_time: '01:00 PM',
  charges: 150,
  received: 150,
  created_at: new Date().toISOString()
}

const allDiff = [job1, job2DifferentAddress]
const mcDiff1 = getMultiCleanerPaymentInfo(job1, allDiff)
const mcDiff2 = getMultiCleanerPaymentInfo(job2DifferentAddress, allDiff)
eq(mcDiff1, null, 'cleaner at Nilofer Tower is NOT in team with cleaner at Salama Tower')
eq(mcDiff2, null, 'cleaner at Salama Tower is NOT in team with cleaner at Nilofer Tower')

// 5. Genuine Multi-Cleaner at Same Address & Overlapping Time
const job2SameAddress: DailyJob = {
  id: 'j3',
  date: '2026-10-31',
  staff_name: 'Cleaner B',
  address: '807 Nilofer Tower',
  start_time: '09:00 AM',
  end_time: '01:00 PM',
  charges: 0,
  received: 0,
  created_at: new Date().toISOString()
}

const allSame = [job1, job2SameAddress]
const mcSame1 = getMultiCleanerPaymentInfo(job1, allSame)
const mcSame2 = getMultiCleanerPaymentInfo(job2SameAddress, allSame)
eq(mcSame1 !== null, true, 'genuine team formed at same address and time')
eq(mcSame1?.isPrimary, true, 'first cleaner is primary')
eq(mcSame2?.isSecondary, true, 'second cleaner is secondary')
eq(mcSame1?.teamRef, mcSame2?.teamRef, 'both cleaners share the same teamRef')
