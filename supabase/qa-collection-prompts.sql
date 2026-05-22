do $$
declare
  v_session_id uuid;
  v_prompt record;
begin
  insert into public.live_sessions (code, title)
  values ('RETREAT', 'SYANA Gurmat Retreat')
  on conflict (code) do update
  set title = excluded.title
  returning id into v_session_id;

  for v_prompt in
    select *
    from (
      values
        (1, 'Workshop 1', 'Workshop 1: Do you have any questions about this workshop?'),
        (2, 'Workshop 2', 'Workshop 2: Do you have any questions about this workshop?'),
        (3, 'Workshop 3', 'Workshop 3: Do you have any questions about this workshop?'),
        (4, 'Workshop 4', 'Workshop 4: Do you have any questions about this workshop?'),
        (5, 'Workshop 5', 'Workshop 5: Do you have any questions about this workshop?'),
        (6, 'Mini workshop 1', 'Mini workshop 1: Do you have any questions about this workshop?'),
        (7, 'Mini workshop 2', 'Mini workshop 2: Do you have any questions about this workshop?')
    ) as prompts(sort_order, workshop_label, prompt_title)
  loop
    insert into public.live_prompts (
      session_id,
      type,
      title,
      description,
      status,
      is_active,
      settings
    )
    values (
      v_session_id,
      'open_text',
      v_prompt.prompt_title,
      'For admin review before the end-of-retreat Q/A session. Not intended for projector display.',
      'draft',
      false,
      jsonb_build_object(
        'moderate', true,
        'internalOnly', true,
        'category', 'End-of-retreat Q/A',
        'workshop', v_prompt.workshop_label,
        'sortOrder', v_prompt.sort_order
      )
    )
    on conflict do nothing;
  end loop;

  update public.live_prompts
  set status = 'draft',
      is_active = false,
      description = 'For admin review before the end-of-retreat Q/A session. Not intended for projector display.',
      settings = settings
        || jsonb_build_object(
          'moderate', true,
          'internalOnly', true,
          'category', 'End-of-retreat Q/A'
        )
  where session_id = v_session_id
    and title in (
      'Workshop 1: Do you have any questions about this workshop?',
      'Workshop 2: Do you have any questions about this workshop?',
      'Workshop 3: Do you have any questions about this workshop?',
      'Workshop 4: Do you have any questions about this workshop?',
      'Workshop 5: Do you have any questions about this workshop?',
      'Mini workshop 1: Do you have any questions about this workshop?',
      'Mini workshop 2: Do you have any questions about this workshop?'
    );
end $$;
