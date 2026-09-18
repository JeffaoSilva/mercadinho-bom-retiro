# Roadmap

## PIX PagBank — Finalização transacional
- [x] Migration aplicada (compra_id + índice único parcial + RPC + grants)
- [x] Bateria T1–T10 da RPC (todos PASSARAM, rollback integral)
- [x] pagbank-webhook chamando finalizar_venda_pix_pagbank em PAID (testes A–G PASSARAM)
- [ ] Integração com o kiosk/frontend (não iniciada por decisão do usuário)
- [ ] Teste de concorrência real entre transações simultâneas (opcional)

- [x] Kiosk PIX: iniciar-checkout-pix + status-checkout-pix + tela PixPagamento (testes 1-12 OK)
- [ ] Teste real de pagamento PIX Sandbox (pagar QR e confirmar webhook -> venda)
