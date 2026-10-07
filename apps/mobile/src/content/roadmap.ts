/**
 * Mural de atualizações: tudo o que chegou (do mais recente para o mais antigo) e o que está a caminho. Texto para o público: sem nome de
 * fornecedor e sem prometer data para o que ainda não existe.
 *
 * REGRA 1: toda novidade ganha uma ANIMAÇÃO PRÓPRIA (`flight`: algo que cruza o fundo do quadro bem rápido, de 3 a 5 vezes) e uma COR PRÓPRIA (`hue`),
 * diferentes de todas as outras. Para uma novidade nova: crie uma entrada nova em `FLIGHTS` (`lib/noveltyLook.ts`, ícone + trajetória que ainda não existam
 * juntos) e escolha um matiz livre. Os testes quebram se faltar ou repetir.
 *
 * REGRA 2: toda mudança que a pessoa perceba entra aqui (visual ou de funcionalidade que influencie o cliente final). Quando algo for lançado, crie
 * o item com `status: "done"` e `since` (AAAA-MM-DD, a data em que chegou); o mural ordena sozinho. O que está sendo feito fica em
 * "building"/"soon" (sem data) e vira "done" quando chegar. **Todo item "done" TEM a caixinha `preview`** (um teste confere): o que aconteceu
 * (`purpose`), o que mudou e como usar (`how`) e o que vale saber (`expect`). Em itens ainda não lançados a caixinha diz para que serve e como vai funcionar.
 */
import type { FlightId } from "@/lib/noveltyLook";

export type RoadmapStatus = "done" | "building" | "soon";

export type RoadmapPreview = {
  /** Para que serve. */
  purpose: string;
  /** Como vai funcionar, em passos curtos. */
  how: string[];
  /** O que esperar (e o que não esperar). */
  expect: string[];
};

export type RoadmapItem = {
  id: string;
  title: string;
  summary: string;
  icon: string;
  /** Matiz (0 a 359) da cor do quadro. Cada novidade tem o seu, diferente de todos os outros (mínimo de 7° de distância; um teste confere). */
  hue: number;
  /** A animação de passagem PRÓPRIA do quadro (`FLIGHTS` em `lib/noveltyLook.ts`). Cada novidade tem uma diferente das outras (um teste confere). */
  flight: FlightId;
  status: RoadmapStatus;
  /** Dia em que chegou (AAAA-MM-DD). Só para "done". */
  since?: string;
  preview?: RoadmapPreview;
};

export const ROADMAP: readonly RoadmapItem[] = [
  {
    id: "investments",
    hue: 0,
    flight: "coins-rise",
    title: "Rendimentos: CDI, CDB e o seu porquinho",
    summary: "Veja quanto o seu dinheiro rende por dia e traga os seus investimentos para o Finança.",
    icon: "piggy-bank",
    status: "building",
    preview: {
      purpose: "Saber, sem planilha, quanto o seu porquinho e os seus investimentos de renda fixa estão rendendo hoje, neste mês e desde que você começou.",
      how: [
        "Você cadastra o porquinho, o CDB ou outra aplicação com o valor e a regra de rendimento (por exemplo, 100% do CDI).",
        "O app acompanha a taxa do CDI divulgada oficialmente e calcula o rendimento de cada dia útil.",
        "Você lança aportes e resgates, e o painel mostra o saldo atualizado, o rendimento do dia e o do mês.",
      ],
      expect: [
        "Valores estimados com base nas taxas oficiais: podem diferir um pouco do extrato do banco (arredondamentos, impostos e a data em que o banco credita).",
        "Vem como um plano a mais, opcional, e fica liberado durante os 30 dias de teste grátis.",
      ],
    },
  },
  {
    id: "social-login",
    hue: 101,
    flight: "key-spin",
    title: "Entrar com Google, Facebook e outras contas",
    summary: "Criar a conta e entrar com um toque, sem decorar mais uma senha.",
    icon: "key-round",
    status: "building",
  },
  {
    id: "bank-connection",
    hue: 202,
    flight: "bank-diag",
    title: "Conexão automática com bancos",
    summary: "Traga saldos e movimentações do seu banco para o Finança, sem digitar.",
    icon: "link",
    status: "soon",
    preview: {
      purpose: "Poupar a digitação: saldos e movimentações do seu banco aparecem no app para você só conferir e categorizar.",
      how: [
        "Você escolhe o seu banco e autoriza dentro do aplicativo ou site do próprio banco. O Finança nunca vê nem guarda a sua senha.",
        "Você decide o que compartilhar (contas, cartões, investimentos) e por quanto tempo.",
        "As movimentações chegam para você revisar antes de entrarem nas suas contas, e o app se atualiza sozinho.",
        "A qualquer momento você encerra a conexão e os dados trazidos do banco são apagados.",
      ],
      expect: [
        "É somente leitura: o app não movimenta o seu dinheiro.",
        "Vem em uma atualização futura, ainda sem data. Quando estiver pronto, você será avisado(a) aqui no mural.",
      ],
    },
  },
  {
    id: "plans",
    hue: 302,
    flight: "crown-fall",
    title: "Assinatura: plano anual ou mensal",
    summary: "Quando a cobrança começar, você escolhe pagar por ano (com desconto) ou por mês, que renova sozinho ou é pago uma vez só, com Pix, e pode incluir o Rendimentos.",
    icon: "crown",
    status: "soon",
    preview: {
      purpose: "Dar a escolha entre pagar por ano, saindo mais barato, ou todo mês, com mais flexibilidade, e entre renovar sozinho ou pagar só um período fechado. Você sempre vê o valor antes de pagar.",
      how: [
        "Em Mais → Assinatura você vê os dois planos lado a lado, com o valor de cada um. O anual aparece primeiro, já com a economia calculada.",
        "Você escolhe: “Renova sozinha” (cartão, cobrado a cada ciclo) ou “Pagar uma vez” (30 dias ou 1 ano, com Pix ou cartão, sem renovação automática).",
        "O pagamento acontece numa página segura, aberta em outra aba: o Finança nunca vê nem guarda os dados do seu cartão, e a tela confirma sozinha quando o pagamento cair.",
        "Quem pagou uma vez renova quando quiser, e o prazo novo soma ao que ainda restava. Quem assina troca o cartão, vê as faturas e cancela quando quiser.",
      ],
      expect: [
        "Você tem 30 dias de teste grátis, com tudo liberado, antes de qualquer cobrança.",
        "Quando o teste acabar sem assinatura, o app fica somente leitura: você continua vendo e exportando tudo, e nada é apagado.",
      ],
    },
  },
  {
    id: "suggestions-board",
    hue: 43,
    flight: "bulb-rise",
    title: "Envie sugestões para o Finança",
    summary: "Teve uma ideia? Mande a sua sugestão pelo app e acompanhe o que a equipe decidiu: aprovada para virar novidade, em análise ou não aplicável.",
    icon: "lightbulb",
    status: "done",
    since: "2026-10-07",
    preview: {
      purpose: "Deixar você ajudar a decidir o que o Finança vai ganhar a seguir: as melhores ideias dos usuários viram novidades.",
      how: [
        "Abra Mais → Enviar sugestão, escreva a sua ideia (de 10 a 1.000 caracteres) e envie.",
        "A equipe lê cada sugestão e marca como aprovada (vai para validação), em análise ou não aplicável.",
        "Na mesma tela você vê as suas sugestões e a situação de cada uma.",
      ],
      expect: [
        "Aprovada não é promessa de data: significa que a ideia vai ser validada para entrar no app.",
        "Há um limite de envios por dia para evitar excesso. Não escreva senhas nem dados pessoais sensíveis na sugestão.",
      ],
    },
  },
  {
    id: "novelty-animations",
    hue: 144,
    flight: "film-rtl",
    title: "Cada novidade com a sua animação e a sua cor",
    summary: "No mural, cada quadro tem uma cor própria e uma animação própria que cruza o fundo bem rápido: moedas, chaves, escudos, relógios e mais.",
    icon: "film",
    status: "done",
    since: "2026-10-07",
    preview: {
      purpose: "Deixar o mural de Novidades mais bonito e fácil de percorrer: cada novidade se reconhece de longe pela cor e pelo que passa por ela.",
      how: [
        "Cada quadro tem uma cor diferente das outras e uma cena própria: por exemplo, moedas que sobem no quadro de Investimentos e chaves que atravessam o de Entrar com outras contas.",
        "A cena toca quando a tela abre e de novo de tempos em tempos, para quem estiver mais abaixo na lista também ver. O desenho passa por trás do texto e some na borda.",
        "O quadro do topo (“Estamos sempre construindo”) segue com os foguetes cruzando. Os foguetinhos de canto foram retirados.",
      ],
      expect: [
        "Com “reduzir movimento” ligado no aparelho, nada se move.",
        "Toda novidade nova que chegar terá a sua própria cor e animação, diferentes das que já existem.",
      ],
    },
  },
  {
    id: "fixes-subscription-investments",
    hue: 245,
    flight: "wrench-wave",
    title: "Assinatura sem erro e Investir mais rápido",
    summary: "A tela de Assinatura voltou a abrir sem o aviso de erro, a aba Investir aparece na hora e o aviso de erro ganhou um botão para voltar ao Início.",
    icon: "wrench",
    status: "done",
    since: "2026-10-07",
    preview: {
      purpose: "Corrigir três coisas que atrapalhavam o uso: a Assinatura mostrava “Algo deu errado”, a aba Investir demorava para aparecer e, depois de um erro, era fácil ficar preso entre telas.",
      how: [
        "A Assinatura quebrava quando o aparelho ainda tinha guardada uma versão antiga dos dados. Agora o app entende dados antigos e novos, e descarta o que ficou guardado de versões anteriores.",
        "Em Investir, quando a conexão automática com bancos ainda não está liberada, o app mostra direto a tela “em breve”, sem esperar respostas que não viriam. Foi isso que deixava a aba lenta.",
        "Na tela “Algo deu errado” há agora o botão Ir para o início, além de Tentar de novo.",
      ],
      expect: [
        "Seus dados não foram afetados: era só a forma de mostrar a tela.",
        "Se aparecer o aviso de erro, use Ir para o início; se continuar acontecendo, fale com a gente em Mais → Ajuda e suporte.",
      ],
    },
  },
  {
    id: "badge-discount",
    hue: 346,
    flight: "percent-rtl",
    title: "Desconto na assinatura com insígnias",
    summary: "A cada 5 insígnias no nível Ouro ou acima você ganha 5% de desconto na assinatura, mensal ou anual, até 15%.",
    icon: "percent",
    status: "done",
    since: "2026-10-07",
    preview: {
      purpose: "Premiar quem usa o Finança de verdade: quanto mais conquistas, mais barata fica a sua assinatura.",
      how: [
        "Cada 5 insígnias que estiverem no nível Ouro, Platina, Diamante ou Mestre valem 5% de desconto. Com 10 insígnias o desconto é de 10%, e com 15 chega a 15%, que é o máximo.",
        "Bronze e Prata não contam para o desconto, mas continuam valendo pontos na sua coleção.",
        "Em Mais → Minhas insígnias você vê quantas já contam e quantas faltam para o próximo degrau. Na tela de Assinatura, os preços aparecem com o desconto aplicado.",
      ],
      expect: [
        "Os níveis que você ganhou nunca saem, então o desconto não diminui.",
        "Vale no mensal e no anual. Quem já assina recebe o desconto novo nas próximas cobranças.",
        "O desconto aparece quando a cobrança começar; durante o teste grátis nada é cobrado.",
      ],
    },
  },
  {
    id: "novelty-rockets",
    hue: 86,
    flight: "rocket-up",
    title: "Foguetes passando pelas Novidades",
    summary: "Toda vez que você abre o mural, de 3 a 5 foguetes cruzam o quadro de cima bem rápido e somem.",
    icon: "rocket",
    status: "done",
    since: "2026-10-07",
    preview: {
      purpose: "Deixar o mural de Novidades mais vivo, sem atrapalhar a leitura.",
      how: [
        "Ao abrir Novidades, de 3 a 5 foguetes atravessam o fundo do quadro do topo, em alturas diferentes, e desaparecem na borda.",
        "Eles passam por trás do texto, então nada fica coberto, e a cena acontece uma vez por abertura.",
      ],
      expect: ["Se o seu aparelho estiver com “reduzir movimento” ligado, os foguetes não aparecem."],
    },
  },
  {
    id: "trial-strip",
    hue: 187,
    flight: "clock-spin",
    title: "Quanto falta do teste grátis, sempre à vista",
    summary: "Uma faixa fixa nas telas principais mostra quantos dias restam do teste e até quando, com o botão para assinar já. Uma barra vai do verde ao vermelho escuro e, perto do fim, treme e começa a suar.",
    icon: "clock",
    status: "done",
    since: "2026-10-07",
    preview: {
      purpose: "Você sempre sabe em que ponto do teste grátis está e pode assinar na hora, sem precisar procurar.",
      how: [
        "Em Transações, Gráficos, Carteira, Investir e Mais aparece uma faixa fina sob o título; no Início, um cartão maior, com o título, a data do fim e o botão Assinar agora.",
        "Uma barra enche conforme os dias passam e muda do verde ao vermelho, cada vez mais escuro. Na segunda metade do teste ela começa a tremer de leve e, nos últimos dias, solta gotinhas de suor.",
        "O botão leva à escolha do plano (mensal ou anual) e da forma de pagar (renova sozinha ou paga uma vez, com Pix).",
      ],
      expect: [
        "Só aparece durante o teste, no modo somente leitura e, para quem pagou uma vez, perto do fim do plano (com o botão Renovar).",
        "Com “reduzir movimento” ligado no aparelho, a barra só muda de cor.",
      ],
    },
  },
  {
    id: "recurring-plus",
    hue: 288,
    flight: "repeat-wave",
    title: "Recorrências completas e parcelas na conta",
    summary: "Repita despesa, receita ou transferência, a cada N semanas, meses ou anos, e escolha quando termina (nunca, depois de N vezes ou numa data). Parcelar também vale na conta e nas receitas.",
    icon: "calendar-clock",
    status: "done",
    since: "2026-10-07",
    preview: {
      purpose: "Automatizar o que se repete (aluguel, salário, reserva mensal) e dividir valores em parcelas, sem lançar tudo na mão.",
      how: [
        "Toque no + e escolha Recorrência. Escolha Despesa, Receita ou Transferência entre contas (por exemplo, guardar R$ 200 por mês na reserva).",
        "Defina se repete por semana, mês ou ano, de quanto em quanto tempo (a cada 2 meses, por exemplo) e quando termina: nunca, depois de N vezes (o app mostra a data da última) ou em uma data.",
        "Ao criar uma despesa ou receita, o campo Parcelas divide o total em um lançamento por mês, também na conta. Os meses seguintes ficam agendados até chegar o dia.",
      ],
      expect: [
        "Os lançamentos são criados sozinhos nas datas certas. Dá para pausar, mudar ou tirar a data do fim e excluir; o que já foi criado continua no histórico.",
        "Cada data de uma transferência recorrente vira uma transferência de verdade, com saída e entrada.",
      ],
    },
  },
  {
    id: "quick-add-menu",
    hue: 29,
    flight: "plus-rise",
    title: "Botão + com todas as opções",
    summary: "O + gira e mostra, com nome, Despesa, Receita, Transferência e Recorrência. Cada uma abre a tela de cadastro.",
    icon: "plus",
    status: "done",
    since: "2026-10-07",
    preview: {
      purpose: "Ter, num único botão, todas as formas de adicionar algo ao app.",
      how: [
        "Toque no + no Início ou em Transações: ele gira até virar um × e os ícones sobem, cada um com o seu nome.",
        "Escolha Despesa, Receita, Transferência ou Recorrência para abrir a tela de cadastro correspondente.",
      ],
      expect: ["Para fechar sem escolher, toque no ×, fora do menu ou aperte Esc no computador."],
    },
  },
  {
    id: "badges",
    hue: 130,
    flight: "gem-diag",
    title: "Insígnias: 53 conquistas, de Bronze a Mestre",
    summary: "Ganhe insígnias por registrar, economizar, planejar e cuidar da conta. Cada uma tem 6 níveis, e o topo é o Mestre, em roxo profundo. Criar a conta já dá a primeira.",
    icon: "gem",
    status: "done",
    since: "2026-10-07",
    preview: {
      purpose: "Tornar o hábito de cuidar do dinheiro mais divertido, com conquistas que mostram o seu progresso.",
      how: [
        "São 53 insígnias em 8 assuntos (constância, lançamentos, economia, planejamento, metas, cartões, organização e segurança). Cada uma tem 6 níveis: Bronze, Prata, Ouro, Platina, Diamante e Mestre.",
        "Quando você conquista um nível, ele aparece na tela na hora, com uma comemoração. Criar a conta já dá a insígnia de Boas-vindas.",
        "Veja a coleção em Mais → Minhas insígnias, com o que conta e como evoluir, e os próximos passos no cartão “Próximas conquistas” do Início.",
      ],
      expect: [
        "Níveis ganhos nunca saem, nem se você apagar lançamentos.",
        "Lançamentos automáticos não inflam as insígnias de anotar.",
      ],
    },
  },
  {
    id: "themes-families",
    hue: 230,
    flight: "palette-ltr",
    title: "Temas opacos, foscos e pastéis",
    summary: "Quinze temas novos em três famílias: cores cheias e chapadas, tons acinzentados e cores claras e delicadas. Em Configurações → Aparência.",
    icon: "palette",
    status: "done",
    since: "2026-10-07",
    preview: {
      purpose: "Dar mais jeitos de deixar o app com a sua cara, para todos os gostos.",
      how: [
        "Abra Configurações → Aparência e escolha entre as três novas famílias: opacos (cores cheias e chapadas), foscos (tons acinzentados) e pastéis (claros e delicados).",
        "Cada família tem cinco temas. A troca vale para o app inteiro na hora.",
      ],
      expect: ["Os temas antigos (claro, escuro e as cores) continuam lá, e dá criar as suas próprias cores."],
    },
  },
  {
    id: "living-background",
    hue: 331,
    flight: "layers-fall",
    title: "Fundo com a logo em cubos",
    summary: "A logo do Finança aparece inteira ao fundo, feita de muitos cubos. No computador eles reagem quando o mouse passa; no celular, sobem e descem sozinhos.",
    icon: "layers",
    status: "done",
    since: "2026-10-07",
    preview: {
      purpose: "Dar identidade ao app com um fundo discreto e vivo, sem tirar o foco do que importa.",
      how: [
        "A logo completa aparece, bem apagada, ao fundo das telas, desenhada com muitos cubos.",
        "No computador, os cubos reagem quando o mouse passa por perto (num círculo pequeno). No celular, eles se alternam, subindo e descendo sozinhos.",
      ],
      expect: ["É só decoração: não atrapalha o uso e fica bem apagada para não competir com os seus dados."],
    },
  },
  {
    id: "two-factor",
    hue: 72,
    flight: "shield-up",
    title: "Verificação em duas etapas",
    summary: "Proteja a conta com um código do celular. Ele é pedido a cada entrada e a cada abertura do app; depois de 3 códigos errados, você é desconectado por segurança.",
    icon: "shield-check",
    status: "done",
    since: "2026-10-06",
    preview: {
      purpose: "Mesmo que alguém descubra a sua senha, sem o seu celular a conta não abre.",
      how: [
        "Ative em Configurações → Segurança: leia o QR code no Google Authenticator, no Authy ou em um app parecido e digite o código de 6 números.",
        "Depois disso, o código é pedido a cada entrada e a cada abertura do app.",
      ],
      expect: [
        "Depois de 3 códigos errados você é desconectado por segurança.",
        "Dá para desligar quando quiser, no mesmo lugar.",
      ],
    },
  },
  {
    id: "my-account",
    hue: 173,
    flight: "user-rtl",
    title: "Minha conta",
    summary: "Veja os dados do seu cadastro e troque nome, e-mail e senha, com limites por mês e por ano para proteger a conta.",
    icon: "user",
    status: "done",
    since: "2026-10-06",
    preview: {
      purpose: "Ter num só lugar os dados do seu cadastro e poder corrigi-los quando precisar.",
      how: [
        "Abra Minha conta para ver o que está cadastrado.",
        "Troque o nome, o e-mail ou a senha.",
      ],
      expect: ["Há limites de trocas por mês e por ano, para que ninguém consiga mexer na sua conta repetidamente."],
    },
  },
  {
    id: "celebrations",
    hue: 274,
    flight: "party-rise",
    title: "Comemorações animadas",
    summary: "Meta batida, dinheiro guardado, insígnia nova: tela cheia com brilhos, confete e foguete para comemorar com você.",
    icon: "party-popper",
    status: "done",
    since: "2026-10-06",
    preview: {
      purpose: "Reconhecer as suas vitórias com uma comemoração, em vez de só mudar um número na tela.",
      how: [
        "Ao bater uma meta, guardar dinheiro ou ganhar uma insígnia, aparece uma tela cheia com brilhos, confete e um foguete.",
        "Quando há mais de uma comemoração, elas entram uma de cada vez.",
      ],
      expect: ["Dá para fechar na hora, e com “reduzir movimento” ligado as animações ficam bem mais calmas."],
    },
  },
  {
    id: "trial-notice",
    hue: 14,
    flight: "gift-spin",
    title: "30 dias de teste grátis, bem explicados",
    summary: "No primeiro acesso você vê que está no teste grátis, até quando vale e como assinar antes, se quiser acesso completo já.",
    icon: "gift",
    status: "done",
    since: "2026-10-06",
    preview: {
      purpose: "Deixar claro, desde o começo, como funciona o período de teste e o que acontece depois.",
      how: [
        "No primeiro acesso aparece uma tela dizendo que você ganhou 30 dias grátis, com tudo liberado, e até que dia ele vale.",
        "Ali mesmo há o caminho para ver os planos e assinar antes do fim, se quiser.",
      ],
      expect: [
        "Sem cartão e sem compromisso: durante o teste nada é cobrado.",
        "Quando o teste acaba sem assinatura, o app fica somente leitura: você continua vendo e exportando tudo, e nada é apagado.",
      ],
    },
  },
  {
    id: "support",
    hue: 115,
    flight: "buoy-wave",
    title: "Ajuda e suporte",
    summary: "Fale com a gente pelo WhatsApp ou pelo e-mail direto do app, em Mais → Ajuda e suporte.",
    icon: "life-buoy",
    status: "done",
    since: "2026-10-06",
    preview: {
      purpose: "Ter ajuda a um toque quando algo não ficar claro ou der problema.",
      how: [
        "Abra Mais → Ajuda e suporte.",
        "Escolha falar pelo WhatsApp ou pelo e-mail: o app já abre a conversa para você.",
      ],
      expect: ["Nunca peça ou envie a sua senha por ali: a equipe não precisa dela."],
    },
  },
  {
    id: "legal",
    hue: 216,
    flight: "file-ltr",
    title: "Termos de Uso e Política de Privacidade renovados",
    summary: "Textos mais claros e detalhados, com seus direitos e as leis que protegem os seus dados. Em Mais → Privacidade e dados.",
    icon: "file-text",
    status: "done",
    since: "2026-10-06",
    preview: {
      purpose: "Explicar, sem juridiquês, o que é feito com os seus dados e quais são os seus direitos.",
      how: [
        "Abra Mais → Privacidade e dados para ler os Termos de Uso e a Política de Privacidade.",
        "Os textos trazem os seus direitos, as leis que protegem os seus dados e o que acontece ao exportar ou excluir a conta.",
      ],
      expect: ["Ficou com alguma dúvida sobre os seus dados? Fale com a gente em Mais → Ajuda e suporte."],
    },
  },
  {
    id: "appearance",
    hue: 317,
    flight: "sun-fall",
    title: "Temas e personalização",
    summary: "Claro, escuro, azul, roxo, verde, vermelho ou as suas próprias cores, em todo o app.",
    icon: "palette",
    status: "done",
    since: "2026-10-05",
    preview: {
      purpose: "Deixar o app confortável para os seus olhos e com a sua personalidade.",
      how: [
        "Abra Configurações → Aparência.",
        "Escolha entre claro, escuro, azul, roxo, verde, vermelho ou monte as suas próprias cores. A mudança vale para todo o app.",
      ],
      expect: ["A escolha fica salva na sua conta, então vale também em outros aparelhos."],
    },
  },
  {
    id: "tour",
    hue: 58,
    flight: "cap-diag",
    title: "Tutorial de primeiro uso",
    summary: "Um passo a passo curto que mostra cada parte do app e para que ela serve. Dá para rever em Mais.",
    icon: "graduation-cap",
    status: "done",
    since: "2026-10-05",
    preview: {
      purpose: "Conhecer o app em poucos minutos, sem precisar descobrir tudo sozinho.",
      how: [
        "No primeiro acesso, um passo a passo destaca cada parte do app e explica para que ela serve.",
        "Dá para pular a qualquer momento e rever depois em Mais → Tutorial.",
      ],
      expect: ["É curto e não muda nada nos seus dados."],
    },
  },
  {
    id: "motion",
    hue: 158,
    flight: "sparkles-wave",
    title: "Animações e acabamento",
    summary: "Telas, listas, gráficos e botões mais fluidos, com respeito à opção de reduzir movimento do seu aparelho.",
    icon: "sparkles",
    status: "done",
    since: "2026-10-04",
    preview: {
      purpose: "Fazer o app parecer mais leve e agradável de usar.",
      how: [
        "As telas entram com uma transição curta, as listas aparecem em cascata e botões, gráficos e abas respondem ao toque com movimentos suaves.",
        "Se o seu aparelho estiver com “reduzir movimento”, o app diminui ou tira as animações.",
      ],
      expect: ["É só acabamento: nada muda no que o app faz com os seus dados."],
    },
  },
] as const;

export const ROADMAP_SECTIONS: { status: RoadmapStatus; title: string; hint: string }[] = [
  { status: "building", title: "Em desenvolvimento", hint: "Estamos construindo agora" },
  { status: "soon", title: "Em breve", hint: "Já está nos planos, ainda sem data" },
  { status: "done", title: "Já chegou", hint: "Tudo o que é novo, do mais recente para o mais antigo" },
];

/** Itens de um status. Os que já chegaram saem do mais recente para o mais antigo (empate: a ordem da lista). */
export const itemsByStatus = (status: RoadmapStatus): RoadmapItem[] => {
  const items = ROADMAP.filter((i) => i.status === status);
  return status === "done" ? items.map((item, order) => ({ item, order })).sort((a, b) => (b.item.since ?? "").localeCompare(a.item.since ?? "") || a.order - b.order).map((x) => x.item) : items;
};

/** Chegou há pouco (até `days` dias antes de `today`, AAAA-MM-DD)? Vira o selo "Novo". */
export function isRecent(since: string | undefined, today: string, days = 7): boolean {
  if (!since) return false;
  const diff = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000;
  return diff >= 0 && diff <= days;
}
export const roadmapItem = (id: string | undefined): RoadmapItem | undefined => ROADMAP.find((i) => i.id === id);
