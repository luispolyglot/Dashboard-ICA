begin;

drop trigger if exists daily_metrics_auto_freeze_previous_day_trigger on public.daily_metrics;
create trigger daily_metrics_auto_freeze_previous_day_trigger
after insert or update on public.daily_metrics
for each row execute procedure public.daily_metrics_auto_freeze_previous_day();

commit;
