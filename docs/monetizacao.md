# Monetização: como cobrar de forma rentável

Modelo adotado: **30 dias grátis (sem pedir cartão) → mensalidade**, com um **plano a mais** (Rendimentos) que também vem incluso no teste. Este
documento ajuda a escolher **preço, periodicidade e meio de pagamento** pensando no que sobra no bolso depois das taxas. A parte técnica está em
[assinatura.md](assinatura.md).

> **Sobre os números:** as tarifas abaixo foram lidas nas páginas oficiais dos provedores em **outubro de 2026** e **mudam**. Confirme nelas antes de
> decidir (links no fim). Os preços de exemplo (R$ 9,90 e R$ 99,90) são **só simulação**, não uma recomendação de preço: o valor é decisão sua e fica
> no painel do Stripe, nunca no código.

## 1. O que as taxas fazem com uma mensalidade pequena

Tarifas lidas (Brasil):

| Provedor | Cartão | Pix | Observação |
|---|---|---|---|
| **Stripe** | 3,99% + R$ 0,39 (cartões nacionais) | 1,19%, **somente por convite** | Stripe Billing (assinaturas) soma 0,7% do volume; boleto R$ 3,45. A API do Stripe já aceita Pix recorrente. |
| **Asaas** | R$ 0,49 + 2,99% (à vista; promoção 1,99% em período inicial) | R$ 1,99 por transação (promoção R$ 0,99 nos 3 primeiros meses) | Assinaturas seguem a estrutura de tarifas do parcelamento; Pix Automático sem custo além da tarifa do Pix. |

A **parte fixa** (R$ 0,39 + 0,7%) pesa muito em ticket pequeno. Simulação com o Stripe (cartão nacional + Billing):

| Cobrança | Taxas | % do valor | Sobra por mês |
|---|---|---|---|
| R$ 9,90 por mês | R$ 0,40 + 0,39 + 0,07 = **R$ 0,86** | ≈ 8,7% | R$ 9,04 |
| R$ 99,90 por ano | R$ 3,99 + 0,39 + 0,70 = **R$ 5,08** | ≈ 5,1% | R$ 7,90 (R$ 94,82 ÷ 12) |

E o **Pix de R$ 1,99 fixo** (Asaas) sobre uma mensalidade de R$ 9,90 come ≈ 20% (≈ 10% na promoção); sobre uma cobrança **anual** de R$ 99,90 come ≈ 2%.

Conclusões práticas:

1. **O plano anual é o mais rentável por taxa** (a parte fixa é paga uma vez por ano) **e por retenção** (a pessoa não decide "renovar ou não" todo mês).
   Compare: R$ 9,90 × 12 = R$ 118,80 no mensal; R$ 99,90 no anual dá ≈ 16% de desconto e ainda sobra uma fatia maior para você, além de receber o ano adiantado.
2. **O adicional Rendimentos não duplica a taxa fixa:** ele entra como um **segundo item da mesma assinatura** (mesma fatura, mesma cobrança), então o R$ 0,39 é
   cobrado uma vez só para os dois.
3. **Pix só compensa em cobrança anual** (ou com tarifa baixa/promocional). Para mensalidade pequena, cartão é melhor. **Boleto** (R$ 3,45) não vale para ticket de mensalidade.
4. **Referência de mercado:** o Mobills Premium anual está em R$ 99,90 (≈ R$ 8,40 por mês) na página de preços dele, o que dá uma âncora para o que o público
   brasileiro já paga por um app de finanças pessoais. Só âncora; o seu preço depende do que o app entrega.

## 2. Recomendação de partida

1. **Ofereça anual como padrão e mensal como alternativa.** Já é assim: a tela de assinatura mostra o **anual primeiro** (já marcado), com a economia
   calculada dos dois preços, e o mensal como alternativa. Cada ciclo é um produto no Stripe (`STRIPE_PRODUCT_ID_MONTHLY` / `STRIPE_PRODUCT_ID_YEARLY`);
   vender só um deles também funciona.
2. **Mantenha o teste sem cartão.** Mais gente chega a usar de verdade (o teste mostra tudo, inclusive o Rendimentos); em troca, converte menos que "teste com
   cartão". O modo **somente leitura** (nada é apagado, dá para exportar) é gentil e ainda deixa claro o que se perde ao não assinar.
3. **Use o Rendimentos como motivo para assinar.** Ele fica liberado nos 30 dias; no fim, quem já cadastrou o porquinho e vê o rendimento diário tem um
   motivo concreto para contratar o adicional. Preço do adicional: ao menos o suficiente para a fatia pós-taxa valer a pena (veja o item 2 acima).
4. **Preço de lançamento por cupom:** o pagamento já aceita **códigos promocionais** do Stripe (`allow_promotion_codes`). Crie no painel, por exemplo,
   "primeiros usuários: 30% por 12 meses" sem mexer em código.
5. **Cortesia para os seus:** administradores e contas com cortesia não pagam e **não entram na receita estimada** do painel.

## 3. Ainda não implementado (ideias que aumentam a conversão)

- Lembretes antes do fim do teste (por exemplo no dia 23, 28 e 30) por notificação no app.
- Mural de novidades com o que vem por aí (inclusive para o Rendimentos).
- Pix Automático para a cobrança anual/mensal, via um segundo provedor (Asaas, por exemplo), se o Stripe não liberar Pix recorrente para a sua conta.
- Pausar a assinatura em vez de cancelar.

## 4. Conta do negócio (ponto de equilíbrio)

```
assinantes_necessários = custo_fixo_mensal ÷ líquido_médio_por_assinante_por_mês
```

Com o líquido da tabela acima (≈ R$ 7,90/mês no anual, ≈ R$ 9,04 no mensal) e os seus custos reais de hospedagem (Render, Supabase, domínio), dá para
saber em quantos assinantes o app se paga. Some também imposto sobre a receita: converse com um(a) contador(a) sobre o enquadramento.

## 5. Fontes (consultadas em outubro de 2026)

- Stripe, preços no Brasil: <https://stripe.com/br/pricing>
- Stripe, Pix recorrente na API (notas de versão, 22/04/2026): <https://docs.stripe.com/changelog/dahlia/2026-04-22/pix-recurring-payments-support>
- Asaas, tarifas: <https://www.asaas.com/precos-e-taxas>
- Mobills, planos: <https://www.mobills.com.br/pricing/>
- Não foi possível consultar a tabela do Mercado Pago (a página de custos, `mercadopago.com.br/costs-section/ecommerce-pricing`, bloqueou o acesso); por isso ele não está comparado aqui.
