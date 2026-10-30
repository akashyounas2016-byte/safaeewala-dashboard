import { normalizePhone, isUaeMobile, isValidEmiratesId, formatEmiratesId, findDuplicateClient, findDuplicateEmployee } from '@/lib/validation'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1 } else console.log('PASS ', m) }
eq(normalizePhone('050 123 4567'), '971501234567', 'local format')
eq(normalizePhone('+971 50-123-4567'), '971501234567', 'international format')
eq(normalizePhone('00971501234567'), '971501234567', '00 prefix')
eq(isUaeMobile('0501234567'), true, 'uae mobile ok')
eq(isUaeMobile('04 123 4567'), false, 'landline not mobile')
eq(isUaeMobile('+92 300 1234567'), false, 'pakistan number flagged')
eq(isValidEmiratesId('784-1990-1234567-1'), true, 'EID with dashes')
eq(isValidEmiratesId('784199012345'), false, 'EID too short')
eq(formatEmiratesId('784199012345671'), '784-1990-1234567-1', 'EID formatted')
const clients: any[] = [{ id: 'c1', full_name: 'TEST Fatima', phone: '+971 50 111 2222', building_name: 'Marina Tower' }]
eq(findDuplicateClient(clients, { full_name: 'Other', phone: '0501112222', building_name: '' })?.reason, 'same phone number', 'client dup by phone')
eq(findDuplicateClient(clients, { full_name: 'test fatima', phone: '', building_name: 'marina  tower' })?.reason, 'same name and building', 'client dup by name+building')
eq(findDuplicateClient(clients, { full_name: 'TEST Fatima', phone: '0501112222', building_name: '' }, 'c1'), null, 'editing itself is not a duplicate')
const emps: any[] = [{ id: 'e1', full_name: 'TEST Rupa', emirates_id: '784-1990-1234567-1', passport_number: 'N1234567', phone: '0502223333' }]
eq(findDuplicateEmployee(emps, { emirates_id: '784199012345671', passport_number: '', phone: '' })?.reason, 'same Emirates ID', 'employee dup by EID')
eq(findDuplicateEmployee(emps, { emirates_id: '', passport_number: 'n1234567', phone: '' })?.reason, 'same passport number', 'employee dup by passport')
eq(findDuplicateEmployee(emps, { emirates_id: '', passport_number: '', phone: '' }), null, 'empty fields never match')
