do $$
declare
  v_session_id uuid;
  v_prompt_id uuid;
begin
  insert into public.live_sessions (code, title)
  values ('RETREAT', 'SYANA Gurmat Retreat')
  on conflict (code) do update
  set title = excluded.title
  returning id into v_session_id;

  select id into v_prompt_id
  from public.live_prompts
  where session_id = v_session_id
    and title = 'What word or short phrase describes the Sangat you hope we build?'
  limit 1;

  if v_prompt_id is null then
    insert into public.live_prompts (session_id, type, title, description, settings)
    values (
      v_session_id,
      'word_cloud',
      'What word or short phrase describes the Sangat you hope we build?',
      '',
      '{}'::jsonb
    )
    returning id into v_prompt_id;
  else
    update public.live_prompts
    set type = 'word_cloud',
        description = '',
        settings = '{}'::jsonb
    where id = v_prompt_id;
  end if;

  select id into v_prompt_id
  from public.live_prompts
  where session_id = v_session_id
    and title = 'Which retreat format helps you engage most deeply?'
  limit 1;

  if v_prompt_id is null then
    insert into public.live_prompts (session_id, type, title, description, settings)
    values (
      v_session_id,
      'multiple_choice',
      'Which retreat format helps you engage most deeply?',
      '',
      '{}'::jsonb
    )
    returning id into v_prompt_id;
  else
    update public.live_prompts
    set type = 'multiple_choice',
        description = '',
        settings = '{}'::jsonb
    where id = v_prompt_id;
  end if;

  delete from public.live_prompt_options where prompt_id = v_prompt_id;
  insert into public.live_prompt_options (prompt_id, label, sort_order)
  values
    (v_prompt_id, 'Keertan', 1),
    (v_prompt_id, 'Gurbani Vichaar', 2),
    (v_prompt_id, 'Small-group discussion', 3),
    (v_prompt_id, 'Reflection or journaling', 4),
    (v_prompt_id, 'Seva', 5);

  select id into v_prompt_id
  from public.live_prompts
  where session_id = v_session_id
    and title = 'How grounded do you feel after this session?'
  limit 1;

  if v_prompt_id is null then
    insert into public.live_prompts (session_id, type, title, description, settings)
    values (
      v_session_id,
      'rating',
      'How grounded do you feel after this session?',
      '',
      '{"scaleMax": 5}'::jsonb
    )
    returning id into v_prompt_id;
  else
    update public.live_prompts
    set type = 'rating',
        description = '',
        settings = '{"scaleMax": 5}'::jsonb
    where id = v_prompt_id;
  end if;

  delete from public.live_prompt_options where prompt_id = v_prompt_id;

  select id into v_prompt_id
  from public.live_prompts
  where session_id = v_session_id
    and title = 'What is one question or tension you want us to carry into Vichaar?'
  limit 1;

  if v_prompt_id is null then
    insert into public.live_prompts (session_id, type, title, description, settings)
    values (
      v_session_id,
      'open_text',
      'What is one question or tension you want us to carry into Vichaar?',
      'Responses can be approved before they appear on the display.',
      '{"moderate": true, "scaleMax": 5}'::jsonb
    )
    returning id into v_prompt_id;
  else
    update public.live_prompts
    set type = 'open_text',
        description = 'Responses can be approved before they appear on the display.',
        settings = '{"moderate": true, "scaleMax": 5}'::jsonb
    where id = v_prompt_id;
  end if;

  delete from public.live_prompt_options where prompt_id = v_prompt_id;

  select id into v_prompt_id
  from public.live_prompts
  where session_id = v_session_id
    and title = 'Which topic should we spend more time with tomorrow?'
  limit 1;

  if v_prompt_id is null then
    insert into public.live_prompts (session_id, type, title, description, settings)
    values (
      v_session_id,
      'multiple_choice',
      'Which topic should we spend more time with tomorrow?',
      '',
      '{}'::jsonb
    )
    returning id into v_prompt_id;
  else
    update public.live_prompts
    set type = 'multiple_choice',
        description = '',
        settings = '{}'::jsonb
    where id = v_prompt_id;
  end if;

  delete from public.live_prompt_options where prompt_id = v_prompt_id;
  insert into public.live_prompt_options (prompt_id, label, sort_order)
  values
    (v_prompt_id, 'Hukam', 1),
    (v_prompt_id, 'Sangat', 2),
    (v_prompt_id, 'Seva', 3),
    (v_prompt_id, 'Daily practice', 4),
    (v_prompt_id, 'Family and community', 5);

  select id into v_prompt_id
  from public.live_prompts
  where session_id = v_session_id
    and title = 'Where are you arriving right now?'
  limit 1;

  if v_prompt_id is null then
    insert into public.live_prompts (session_id, type, title, description, settings)
    values (
      v_session_id,
      'reflection_map',
      'Where are you arriving right now?',
      '',
      '{"xMinLabel": "Unclear", "xMaxLabel": "Clear", "yMinLabel": "Closed", "yMaxLabel": "Open"}'::jsonb
    )
    returning id into v_prompt_id;
  else
    update public.live_prompts
    set type = 'reflection_map',
        description = '',
        settings = '{"xMinLabel": "Unclear", "xMaxLabel": "Clear", "yMinLabel": "Closed", "yMaxLabel": "Open"}'::jsonb
    where id = v_prompt_id;
  end if;

  delete from public.live_prompt_options where prompt_id = v_prompt_id;

  select id into v_prompt_id
  from public.live_prompts
  where session_id = v_session_id
    and title = 'What would support your learning today?'
  limit 1;

  if v_prompt_id is null then
    insert into public.live_prompts (session_id, type, title, description, settings)
    values (
      v_session_id,
      'spectrum',
      'What would support your learning today?',
      '',
      '{"minLabel": "More structure", "maxLabel": "More spaciousness"}'::jsonb
    )
    returning id into v_prompt_id;
  else
    update public.live_prompts
    set type = 'spectrum',
        description = '',
        settings = '{"minLabel": "More structure", "maxLabel": "More spaciousness"}'::jsonb
    where id = v_prompt_id;
  end if;

  delete from public.live_prompt_options where prompt_id = v_prompt_id;

  select id into v_prompt_id
  from public.live_prompts
  where session_id = v_session_id
    and title = 'What should our Sangat prioritize after retreat?'
  limit 1;

  if v_prompt_id is null then
    insert into public.live_prompts (session_id, type, title, description, settings)
    values (
      v_session_id,
      'ranking',
      'What should our Sangat prioritize after retreat?',
      'Tap choices in the order you would prioritize them.',
      '{}'::jsonb
    )
    returning id into v_prompt_id;
  else
    update public.live_prompts
    set type = 'ranking',
        description = 'Tap choices in the order you would prioritize them.',
        settings = '{}'::jsonb
    where id = v_prompt_id;
  end if;

  delete from public.live_prompt_options where prompt_id = v_prompt_id;
  insert into public.live_prompt_options (prompt_id, label, sort_order)
  values
    (v_prompt_id, 'Daily simran', 1),
    (v_prompt_id, 'Seva projects', 2),
    (v_prompt_id, 'Youth mentorship', 3),
    (v_prompt_id, 'Gurbani study', 4),
    (v_prompt_id, 'Family conversations', 5);
end $$;
