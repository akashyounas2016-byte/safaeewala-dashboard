-- R-SCHED-08: Contract Status of a Monthly / Bi-Weekly client (Edit Client → Contract Status toggle).
-- false = Off: no visits sync to the Daily Job Sheet. NULL / true = On (every existing client stays On).
alter table public.clients add column if not exists contract_active boolean;
