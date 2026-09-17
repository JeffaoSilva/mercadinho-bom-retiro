# Roadmap

## PIX PagBank — Finalização transacional
- [x] Inspeção de schema (reservas_checkout, itens, pagbank, compras, itens_compra, prateleiras)
- [x] Migration: coluna compra_id + unique partial + RPC finalizar_venda_pix_pagbank (rascunho)
- [ ] Corrigir validação de estoque para descontar reservas PIX ativas concorrentes (NÃO executar)
- [ ] Apresentar trecho alterado e 6 confirmações (aguardando OK do usuário)
- [ ] Executar migration após aprovação
- [ ] Atualizar pagbank-webhook para chamar a RPC em PAID
- [ ] Bateria de 10 testes controlados (sem chamar PagBank)
- [ ] Limpeza + auditoria final + relatório 30 itens
