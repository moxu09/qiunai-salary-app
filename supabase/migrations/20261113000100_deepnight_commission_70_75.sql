-- Extend the current salary normalizer while preserving its other rules.
do $migration$
declare
  definition text := pg_get_functiondef('public.sync_play_order_salary_fields()'::regprocedure);
  original_case constant text := 'when ''rate_80'' then 80';
  extended_case constant text := 'when ''rate_70'' then 70 when ''rate_75'' then 75 when ''rate_80'' then 80';
  match_count integer;
begin
  match_count := (length(definition) - length(replace(definition, original_case, ''))) / length(original_case);
  if match_count <> 2 then
    raise exception 'Unexpected commission cases in sync_play_order_salary_fields';
  end if;
  if (length(definition) - length(replace(definition, extended_case, ''))) / length(extended_case) = match_count then
    return;
  end if;
  if definition like '%rate_70%' or definition like '%rate_75%' then
    raise exception 'Review existing 70/75 commission mappings before applying';
  end if;
  execute replace(definition, original_case, extended_case);
end
$migration$;
