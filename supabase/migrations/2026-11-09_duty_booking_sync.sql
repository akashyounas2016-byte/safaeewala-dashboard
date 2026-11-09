-- R-DUTY-02: My Duties ↔ Bookings. When a cleaner presses Start job / End job in My Duties, the job row and its
-- booking follow: Started → "in_progress", End job → "completed" (once nobody else on that job is still working).
-- A cleaner login may not write bookings (SEC-A03), so the database does it in this trigger.
-- The office keeps full control: a booking completed in the office is shown as done in My Duties (job row status).
-- Run once in Supabase → SQL editor. Safe to run again.

create or replace function public.duty_to_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  bid text;
  still_working int;
begin
  select booking_id into bid from public.daily_jobs where id = new.job_id;

  if new.status = 'started' then
    update public.daily_jobs set status = 'in_progress'
      where id = new.job_id and coalesce(status, '') not in ('in_progress', 'completed', 'cancelled');
    if bid is not null then
      update public.bookings set status = 'in_progress' where id = bid and status in ('pending', 'confirmed');
    end if;

  elsif new.status = 'done' then
    select count(*) into still_working from public.job_checkins
      where job_id = new.job_id and id <> new.id and status in ('on_way', 'started');
    if still_working = 0 then
      update public.daily_jobs set status = 'completed'
        where id = new.job_id and coalesce(status, '') not in ('completed', 'cancelled');
      if bid is not null then
        update public.bookings set status = 'completed' where id = bid and status in ('pending', 'confirmed', 'in_progress');
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists job_checkins_to_booking on public.job_checkins;
create trigger job_checkins_to_booking
  after insert or update of status on public.job_checkins
  for each row execute function public.duty_to_booking();

-- the office sees booking changes live
do $$ begin
  begin execute 'alter publication supabase_realtime add table public.bookings'; exception when others then null; end;
end $$;

notify pgrst, 'reload schema';
