CREATE OR REPLACE FUNCTION public.cliente_caderneta_v2(p_cliente_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_resultado jsonb;
  v_meses_pt text[] := array['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  -- Estruturas para distribuição FIFO de abatimentos por mês.
  v_mes_keys text[];
  v_mes_caderneta numeric[];
  v_mes_restante numeric[];
  v_mes_idx int;
  v_n_meses int;

  v_abat record;
  v_valor_restante numeric;
  v_usado numeric;

  -- Mapa: mes -> jsonb array de detalhes de abatimento aplicados a esse mês.
  v_detalhes_por_mes jsonb := '{}'::jsonb;

  -- Acumulador da distribuição do abatimento corrente: array de jsonb {mes, mes_formatado, valor_aplicado}
  v_distribuicao jsonb;
  v_mes_fmt text;
  v_partes text[];
begin
  -- 1) Carregar lista ordenada de meses (calendário do cliente) e total_caderneta de cada mês.
  with compras_base as (
    select
      c.valor_total,
      c.forma_pagamento,
      c.paga,
      to_char(c.data_compra at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes
    from compras c
    where c.cliente_id = p_cliente_id
      and c.eh_visitante = false
  ),
  limites as (
    select
      min(mes_data) as primeiro_mes,
      date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as mes_atual
    from (
      select (mes || '-01')::date as mes_data from compras_base
      union all
      select date_trunc('month', a.criado_em at time zone 'America/Sao_Paulo')::date as mes_data
      from abatimentos a
      where a.cliente_id = p_cliente_id
    ) x
  ),
  meses_calendario as (
    select to_char(gs::date, 'YYYY-MM') as mes
    from limites l,
    generate_series(l.primeiro_mes, l.mes_atual, interval '1 month') gs
    where l.primeiro_mes is not null
  ),
  agg as (
    select
      mc.mes,
      coalesce(sum(cb.valor_total) filter (where cb.forma_pagamento = 'caderneta' and cb.paga = false), 0) as total_caderneta
    from meses_calendario mc
    left join compras_base cb on cb.mes = mc.mes
    group by mc.mes
    order by mc.mes
  )
  select
    array_agg(mes order by mes),
    array_agg(total_caderneta order by mes)
  into v_mes_keys, v_mes_caderneta
  from agg;

  v_n_meses := coalesce(array_length(v_mes_keys, 1), 0);

  -- 2) Buckets restantes (mutáveis) por mês.
  if v_n_meses > 0 then
    v_mes_restante := v_mes_caderneta;
    -- inicializar mapa por mês com array vazio
    for v_mes_idx in 1..v_n_meses loop
      v_detalhes_por_mes := jsonb_set(v_detalhes_por_mes, array[v_mes_keys[v_mes_idx]], '[]'::jsonb, true);
    end loop;
  end if;

  -- 3) Distribuir cada abatimento (em ordem cronológica) preenchendo meses mais antigos primeiro.
  if v_n_meses > 0 then
    for v_abat in
      select a.id, a.valor, a.criado_em
      from abatimentos a
      where a.cliente_id = p_cliente_id
      order by a.criado_em asc, a.id asc
    loop
      v_valor_restante := coalesce(v_abat.valor, 0);
      v_distribuicao := '[]'::jsonb;

      for v_mes_idx in 1..v_n_meses loop
        exit when v_valor_restante <= 0;
        if v_mes_restante[v_mes_idx] > 0 then
          v_usado := least(v_mes_restante[v_mes_idx], v_valor_restante);
          v_mes_restante[v_mes_idx] := v_mes_restante[v_mes_idx] - v_usado;
          v_valor_restante := v_valor_restante - v_usado;

          v_partes := string_to_array(v_mes_keys[v_mes_idx], '-');
          v_mes_fmt := v_meses_pt[v_partes[2]::int] || ' de ' || v_partes[1];

          v_distribuicao := v_distribuicao || jsonb_build_object(
            'mes', v_mes_keys[v_mes_idx],
            'mes_formatado', v_mes_fmt,
            'valor_aplicado', v_usado
          );
        end if;
      end loop;

      -- Para cada mês que recebeu parte deste abatimento, adicionar o detalhe completo no mapa.
      if jsonb_array_length(v_distribuicao) > 0 then
        declare
          j int;
          v_item jsonb;
          v_mes_key text;
          v_valor_no_mes numeric;
          v_detalhe jsonb;
          v_lista jsonb;
        begin
          for j in 0..(jsonb_array_length(v_distribuicao) - 1) loop
            v_item := v_distribuicao->j;
            v_mes_key := v_item->>'mes';
            v_valor_no_mes := (v_item->>'valor_aplicado')::numeric;

            v_detalhe := jsonb_build_object(
              'abatimento_id', v_abat.id,
              'data_lancamento', v_abat.criado_em,
              'data_lancamento_brasil', to_char(v_abat.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
              'hora_lancamento_brasil', to_char(v_abat.criado_em at time zone 'America/Sao_Paulo', 'HH24:MI'),
              'valor_lancado', v_abat.valor,
              'valor_aplicado_no_mes_visualizado', v_valor_no_mes,
              'distribuicao', v_distribuicao
            );

            v_lista := v_detalhes_por_mes->v_mes_key;
            v_lista := v_lista || v_detalhe;
            v_detalhes_por_mes := jsonb_set(v_detalhes_por_mes, array[v_mes_key], v_lista, true);
          end loop;
        end;
      end if;
    end loop;
  end if;

  -- 4) Montar o payload final (mesma lógica financeira de antes) e anexar abatimentos_detalhados por mês.
  with compras_base as (
    select
      c.id,
      c.valor_total,
      c.forma_pagamento,
      c.paga,
      c.data_compra,
      to_char(c.data_compra at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes
    from compras c
    where c.cliente_id = p_cliente_id
      and c.eh_visitante = false
  ),
  limites as (
    select
      min(mes_data) as primeiro_mes,
      date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as mes_atual
    from (
      select (mes || '-01')::date as mes_data from compras_base
      union all
      select date_trunc('month', a.criado_em at time zone 'America/Sao_Paulo')::date as mes_data
      from abatimentos a
      where a.cliente_id = p_cliente_id
    ) x
  ),
  meses_calendario as (
    select to_char(gs::date, 'YYYY-MM') as mes
    from limites l,
    generate_series(l.primeiro_mes, l.mes_atual, interval '1 month') gs
    where l.primeiro_mes is not null
  ),
  compras_mes as (
    select
      mc.mes,
      coalesce(sum(cb.valor_total) filter (where cb.forma_pagamento = 'caderneta' and cb.paga = false), 0) as total_caderneta,
      coalesce(sum(cb.valor_total) filter (where cb.forma_pagamento = 'pix'), 0) as total_pix
    from meses_calendario mc
    left join compras_base cb on cb.mes = mc.mes
    group by mc.mes
  ),
  abatimentos_total as (
    select coalesce(sum(a.valor), 0) as total_abatimentos_geral
    from abatimentos a
    where a.cliente_id = p_cliente_id
  ),
  distribuicao as (
    select
      cm.*,
      coalesce(
        sum(cm.total_caderneta) over (order by cm.mes rows between unbounded preceding and 1 preceding),
        0
      ) as divida_anterior_acumulada,
      at.total_abatimentos_geral
    from compras_mes cm
    cross join abatimentos_total at
  ),
  calculo as (
    select
      mes,
      total_caderneta,
      total_pix,
      total_caderneta + total_pix as movimentacao_mes,
      greatest(
        least(total_abatimentos_geral - divida_anterior_acumulada, total_caderneta),
        0
      ) as abatimento_aplicado_mes
    from distribuicao
  ),
  totais_gerais as (
    select
      coalesce(sum(total_caderneta), 0) as total_caderneta_geral,
      coalesce(sum(abatimento_aplicado_mes), 0) as total_abatimento_aplicado_geral,
      coalesce(sum(total_pix), 0) as total_pix_geral
    from calculo
  ),
  compras_por_mes as (
    select
      cb.mes,
      jsonb_agg(
        jsonb_build_object(
          'compra_id', cb.id,
          'data_compra', cb.data_compra,
          'data_compra_brasil', to_char(cb.data_compra at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
          'hora_compra_brasil', to_char(cb.data_compra at time zone 'America/Sao_Paulo', 'HH24:MI'),
          'valor_total', cb.valor_total,
          'forma_pagamento', cb.forma_pagamento,
          'paga', cb.paga,
          'itens', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'item_compra_id', i.id,
                'produto_id', i.produto_id,
                'nome_produto', p.nome,
                'quantidade', i.quantidade,
                'valor_unitario', i.valor_unitario,
                'valor_total', i.valor_total
              )
              order by p.nome
            )
            from itens_compra i
            left join produtos p on p.id = i.produto_id
            where i.compra_id = cb.id
          ), '[]'::jsonb)
        )
        order by cb.data_compra desc, cb.id desc
      ) as compras
    from compras_base cb
    group by cb.mes
  )
  select jsonb_build_object(
    'cliente_id', p_cliente_id,
    'total_devido_atual', greatest(tg.total_caderneta_geral - tg.total_abatimento_aplicado_geral, 0),
    'saldo_positivo_atual', greatest(tg.total_abatimento_aplicado_geral - tg.total_caderneta_geral, 0),
    'total_pix_historico', tg.total_pix_geral,
    'meses', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'mes', c.mes,
          'total_caderneta', c.total_caderneta,
          'total_pix', c.total_pix,
          'movimentacao_mes', c.movimentacao_mes,
          'abatimento_aplicado_mes', c.abatimento_aplicado_mes,
          'saldo_mes', c.total_caderneta - c.abatimento_aplicado_mes,
          'status_mes',
            case
              when c.total_caderneta = 0 and c.total_pix = 0 then 'sem_movimentacao'
              when c.total_caderneta = 0 and c.total_pix > 0 then 'quitado_pix'
              when c.abatimento_aplicado_mes >= c.total_caderneta then 'quitado'
              when c.abatimento_aplicado_mes > 0 then 'parcial'
              else 'em_aberto'
            end,
          'percentual_caderneta_grafico',
            case when c.movimentacao_mes > 0
              then round((c.total_caderneta / c.movimentacao_mes) * 100, 2) else 0 end,
          'percentual_pix_grafico',
            case when c.movimentacao_mes > 0
              then round((c.total_pix / c.movimentacao_mes) * 100, 2) else 0 end,
          'compras', coalesce(cpm.compras, '[]'::jsonb),
          'abatimentos_detalhados', coalesce(v_detalhes_por_mes->c.mes, '[]'::jsonb)
        )
        order by c.mes
      ),
      '[]'::jsonb
    )
  )
  into v_resultado
  from calculo c
  cross join totais_gerais tg
  left join compras_por_mes cpm on cpm.mes = c.mes
  group by tg.total_caderneta_geral, tg.total_abatimento_aplicado_geral, tg.total_pix_geral;

  return coalesce(
    v_resultado,
    jsonb_build_object(
      'cliente_id', p_cliente_id,
      'total_devido_atual', 0,
      'saldo_positivo_atual', 0,
      'total_pix_historico', 0,
      'meses', '[]'::jsonb
    )
  );
end;
$function$;