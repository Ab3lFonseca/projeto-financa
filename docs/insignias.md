# Insígnias

Conquistas por usar bem o Finança. São **53 insígnias** em 8 assuntos, e cada uma tem **6 níveis**: Bronze, Prata, Ouro, Platina, Diamante e, no topo, **Mestre**
(roxo profundo, com brasão, coroa e asas). O catálogo inteiro (nomes, textos e a meta de cada nível) está em `packages/shared/src/badges.ts`.

## Como funciona

- **O servidor decide, o app só mostra.** `GET /v1/badges` calcula os números da pessoa a partir dos dados dela (dentro da transação com RLS: ela só
  enxerga o que é dela), grava os níveis novos em `user_badges` e devolve todas as insígnias com valor, nível, datas e `unseen` (níveis ganhos cuja
  comemoração ainda não foi vista). Ler já avalia; não há rotina em segundo plano nem estado a manter.
- **Nível ganho nunca sai.** Apagar lançamentos baixa o número da insígnia, mas o nível já conquistado e a data continuam.
- **Idempotente.** Avaliar duas vezes, ou em paralelo, não duplica nada (restrição única `(user_id, badge_id, tier)`).
- **Na tela, na hora.** O app confere ao abrir, ao voltar para ele e ~1,5 s depois de qualquer gravação com sucesso (lançamento, meta, orçamento...), e
  comemora em tela cheia o que for novo (`POST /v1/badges/seen` marca como visto). Mais de 3 de uma vez (conta antiga que ganhou o catálogo)
  viram **uma** comemoração-resumo.
- **Boas-vindas.** A insígnia *Boas-vindas* (tempo de conta; o dia do cadastro conta como o primeiro) dá o Bronze **assim que a conta existe**: a primeira
  abertura mostra "Boas-vindas ao Finança, \<nome\>!" antes das perguntas do primeiro acesso.
- **Pontos.** Cada nível vale 10, 25, 50, 100, 200 e 400 pontos (soma de todos os níveis ganhos).

## Assuntos

Constância (tempo de conta, dias e semanas seguidos...), Lançamentos, Economia (meses no azul, quanto guardou, patrimônio, colchão...), Planejamento
(orçamentos, mês perfeito, recorrências), Metas, Contas e cartões, Organização e Você no app (primeiros passos, segurança, dados).

O que **não** conta, de propósito: lançamentos gerados sozinhos pelas recorrências ou importados do banco não inflam as insígnias de "anotar"; só o que a
pessoa registrou. Dias sem gastar só valem em meses fechados em que ela acompanhou de verdade (10 dias ou mais com movimento). Orçamento e economia só
contam **meses fechados** (o mês corrente ainda pode virar).

## Desconto na assinatura

As insígnias dão **desconto na assinatura** (mensal e anual): **a cada 5 insígnias no nível Ouro ou acima, 5%; teto de 15%**.

| Insígnias em Ouro ou acima | Desconto |
|---|---|
| 0 a 4 | 0% |
| 5 a 9 | 5% |
| 10 a 14 | 10% |
| 15 ou mais | **15% (teto)** |

- Conta o **nível mais alto de cada insígnia**: Ouro, Platina, Diamante e Mestre valem; Bronze e Prata não. Níveis ganhos nunca saem, então o desconto **só cresce**.
- As regras estão em um lugar só, `badgeDiscount` em `packages/shared/src/badges.ts` (constantes `DISCOUNT_MIN_LEVEL`, `DISCOUNT_BADGES_PER_STEP`,
  `DISCOUNT_STEP_PERCENT`, `DISCOUNT_CAP_PERCENT`). Mudar os números é mudar essas quatro constantes (e o texto da novidade em `content/roadmap.ts`).
- **Quem calcula é o servidor.** O pedido de pagamento não aceita percentual nem cupom (o corpo é estrito); a API avalia as insígnias da pessoa na hora e
  aplica o degrau. O app só mostra o progresso (Mais → Minhas insígnias) e os preços com desconto (Assinatura).
- Como o desconto chega ao Stripe, o que acontece com quem já assina e o que o painel considera: veja [assinatura.md](assinatura.md#desconto-por-insígnias).

## Privacidade

`user_badges` guarda só *quem ganhou o quê e quando*: nenhum valor financeiro. A pessoa só lê as próprias linhas (RLS); quem grava é o servidor. Entra na
exportação de dados (LGPD, `data.badges`) e some junto com a conta (exclusão em cascata).

## Para criar uma insígnia nova

1. Se precisar de um número novo, acrescente a chave em `METRIC_KEYS` e calcule-o em `services/api/src/modules/badges/metrics.ts`.
2. Acrescente a definição em `BADGES` (`packages/shared/src/badges.ts`): 6 metas **estritamente crescentes**, textos e um ícone que exista no `Icon.tsx`.
3. Os testes conferem sozinhos: metas crescentes, textos completos, métrica usada, nomes únicos e ícones existentes (`badges.test.ts`, `badge-icons.test.ts`).
4. Insígnia nova **não** precisa de migration: quem já cumpre a meta ganha o nível na próxima avaliação.
