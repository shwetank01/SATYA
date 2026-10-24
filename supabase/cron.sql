-- VISMRITI timers + Doctor helper (Sections 12.5, 12.6). Enable pg_cron in the Dashboard first.

create extension if not exists pg_cron;

create or replace function public.doctor_info() returns json
language sql stable security definer set search_path = public, cron as $$
  select json_build_object(
    'cron_jobs', (select coalesce(json_agg(jobname), '[]'::json) from cron.job),
    'realtime_tables', (select coalesce(json_agg(tablename), '[]'::json)
                        from pg_publication_tables where pubname = 'supabase_realtime'));
$$;
revoke execute on function public.doctor_info() from public, anon, authenticated;

select cron.schedule('satya_purge_blobs', '17 * * * *',
  $$delete from public.report_blobs b using public.reports r
    where b.report_id = r.id and r.closed_at is not null and r.closed_at < now() - interval '30 days'$$);
select cron.schedule('satya_purge_sightings', '23 3 * * *',
  $$delete from public.sightings where day < current_date - 30$$);
