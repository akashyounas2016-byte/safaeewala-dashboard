import type { Agency } from '@/types'

export const defaultAgencies: Agency[] = [
  {
    id: 'agency-safaeewala',
    name: 'Safaeewala',
    company_type: 'Parent Company',
    contact_person: 'Corporate Operations Desk',
    contact_persons: [
      { id: 'cp-saf-1', name: 'Corporate Operations Desk', phone: '+971 4 800 7232', email: 'operations@safaeewala.com', role: 'Head of Operations' },
      { id: 'cp-saf-2', name: 'Compliance & Fleet Director', phone: '+971 50 123 4567', email: 'compliance@safaeewala.com', role: 'Compliance Officer' }
    ],
    phone: '+971 4 800 7232',
    email: 'info@safaeewala.com',
    address: 'Al Barsha 1, Sheikh Zayed Road, Dubai, UAE',
    commission_rate: 0,
    commission_type: 'percentage',
    payment_terms: 'Internal Corporate / Parent HQ',
    termination_notice: 'Not Applicable (Parent Company)',
    notes: 'Parent Company Headquarters & Corporate Master Fleet for Safaeewala Group',
    status: 'active',
    contract_ref: 'PARENT-HQ-SAFAEEWALA',
    contract_start_date: '2023-01-01',
    contract_end_date: '2030-12-31',
    trade_license_no: 'TL-DXB-982103',
    trn_no: '100452391000003',
    noc_no: 'NOC-DXB-2023-001',
    quota_cleaners: 12,
    contracted_amount: 0,
    replacement_guarantee: 'Safaeewala Corporate Fleet Pool',
    replacement_guarantee_enabled: true,
    bank_details: {
      bank_name: 'Emirates NBD',
      iban: 'AE990260001009876543210',
      account_title: 'Safaeewala'
    },
    created_at: new Date('2023-01-01').toISOString(),
  },
]
