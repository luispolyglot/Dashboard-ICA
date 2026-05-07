begin;

alter table public.phrase_voice_activations
  add column if not exists activation_source text not null default 'direct',
  add column if not exists activation_source_id uuid;

alter table public.phrase_voice_activations
  drop constraint if exists phrase_voice_activations_activation_source_check;

alter table public.phrase_voice_activations
  add constraint phrase_voice_activations_activation_source_check
  check (activation_source in ('direct', 'master_note_chunk'));

create index if not exists phrase_voice_activations_source_idx
  on public.phrase_voice_activations (activation_source, activation_source_id);

commit;
