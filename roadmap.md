# Roadmap

## PIX PagBank — Finalização transacional
- [x] Inspeção de schema (reservas_checkout, itens, pagbank, compras, itens_compra, prateleiras)
- [x] Migration: coluna compra_id + unique partial + RPC finalizar_venda_pix_pagbank (rascunho)
- [x] Corrigir validação de estoque para descontar reservas PIX ativas concorrentes (NÃO executar)
- [x] Inspeção somente leitura: protocolo de lock em criar_reserva_checkout_pix vs finalizar_venda_pix_pagbank
- [ ] Apresentar trecho alterado e 6 confirmações (aguardando OK do usuário)
- [ ] Executar migration após aprovação
- [ ] Atualizar pagbank-webhook para chamar a RPC em PAID
- [x] Migration aplicada (compra_id + índice único parcial + RPC + grants)
- [ ] Corrigir harness T7: CHECK reservas_checkout_itens_consistencia_check impede item inconsistente (aguardando OK)
- [ ] Bateria de 10 testes controlados (sem chamar PagBank)
- [ ] Limpeza + auditoria final + relatório 30 itens
