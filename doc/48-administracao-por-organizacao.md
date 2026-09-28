# Administração centrada na organização — investigação e plano

Data: 25/09/2026. Status: proposta para implementação local. Nenhuma funcionalidade alterada ou publicada nesta investigação.

## Objetivo definido pelo usuário

Ao abrir uma organização, o superadmin deve conseguir administrar seus usuários, criar acessos, ativar a organização e redefinir senhas. Remover Pessoas da navegação principal. A operação inicial deve funcionar sem SMTP. Super admins continuam em área própria, separada dos acessos de organizações.

## Diagnóstico confirmado no código

1. A navegação principal separa Organizações e Pessoas em `apps/web/src/platform-workspace.tsx`. A visão geral também leva a /plataforma/pessoas. Apenas remover o item lateral deixaria atalhos e rotas inconsistentes.
2. A ficha da organização já possui Pessoas e acessos, mas `platform-organizations.tsx` exibe essencialmente email, situação e seleção do responsável. Bloqueio, sessões e recuperação ficam no componente global `platform-accounts.tsx`.
3. O POST /organizations cria a organização como pending e um convite de responsável. Em `platform-management.ts`, a transição manual de pending permite somente closed. A ativação inicial ocorre no aceite do convite. Portanto, adicionar um botão Ativar exige mudança no backend, não apenas na interface.
4. O POST /users/:id/password-reset em `platform-accounts.ts` cria token e enfileira email. Não permite definir diretamente uma senha. Sem SMTP, essa ação não resolve o acesso.
5. Uma identidade em app.users pode ter vários vínculos em app.memberships. Senha e bloqueio global pertencem à identidade; bloqueio de vínculo pertence à organização. Alterar a senha afeta todos os acessos daquela conta, inclusive plataforma se houver privilégio de superadmin.
6. O login organizacional exige usuário ativo, vínculo ativo e organização ativa. Ativar só a organização não resolve falta de usuário, senha ou vínculo.
7. Existem mecanismos reutilizáveis: sessão/MFA do superadmin, CSRF, auditoria, idempotência, versão dos registros, bloqueio de vínculo, troca de responsável e revogação de sessões. A confirmação adicional de cinco minutos permanece na maior parte das escritas; hoje apenas organization.create tem exceção.

## Experiência proposta

Menu principal: Visão geral, Organizações, Super admins e Auditoria. Convites de organizações ficam dentro da ficha; convites de superadmins ficam na área Super admins. A remoção do menu global Convites é recomendação adicional, não requisito obrigatório desta entrega.

Ao clicar em uma organização, abrir sua ficha com nome, situação e ação principal visíveis. Usar três áreas: Usuários e acessos (abertura padrão), Dados da organização e Histórico. No celular, botões visíveis e lista de usuários em cartões; evitar uma longa sequência de abas horizontais.

Usuários e acessos apresenta email, responsável, acesso ativo/bloqueado e indicação de convite pendente. Mostrar a causa do impedimento: conta bloqueada, vínculo bloqueado, organização suspensa ou senha ainda não definida. Cada usuário tem ações no próprio contexto: redefinir senha, bloquear/liberar acesso nesta organização, definir como responsável e encerrar sessões nesta organização.

Não misturar superadmins na lista comum sem indicação. Para uma conta que também seja superadmin, direcionar operações de senha global e privilégios para a área Super admins; a ficha da organização continua administrando seu vínculo local.

Ações da organização usam nomes diretos: Ativar organização, Suspender, Reativar e Encerrar. Mostrar a condição que falta junto ao botão e oferecer o caminho para resolvê-la. Não deixar o usuário descobrir a regra apenas após um erro.

## Cadastro e ativação sem email

Fluxo principal recomendado: cadastrar os dados da organização, cadastrar o primeiro responsável com email e senha inicial, e escolher Ativar agora ou Salvar pendente. O superadmin pode concluir tudo sem convite por email.

Para organizações já pendentes: permitir criar/vincular um administrador, defini-lo como responsável e ativar diretamente. A ativação deve aceitar pending → active e registrar quem a executou. Preservar a exigência de responsável com conta e vínculo ativos; permitir ao superadmin resolver todos esses requisitos na própria ficha.

Conta nova: salvar hash com o mecanismo atual, criar vínculo e responsável em uma transação. Conta existente: vincular explicitamente, sem redefinir silenciosamente sua senha. Exibir que se trata de uma conta compartilhada. Não permitir promoção indireta a superadmin por esse fluxo.

Convites permanecem um caminho opcional. Ao ativar por intervenção do superadmin, invalidar o convite inicial substituído e sua mensagem pendente, para que um aceite posterior não troque o responsável ou repita ações. Outros convites válidos continuam independentes.

Organização encerrada permanece terminal nesta proposta. Reabrir encerradas seria uma mudança de regra adicional; poder de administração não deve reativar automaticamente sessões ou credenciais antigas.

## Redefinição de senha dentro da organização

Oferecer Definir nova senha sem SMTP, com senha e confirmação, validação de 12–128 caracteres e opção de mostrar/ocultar. O superadmin informa/entrega a nova senha ao titular por canal próprio. Não exibir a senha atual, não armazenar senha em texto puro e não retornar senha em respostas, auditoria ou histórico de idempotência.

Recomendação: senha temporária com troca obrigatória no próximo login. Isso exige uma migration para marcar troca obrigatória e um fluxo restrito de troca antes de acessar os eventos. Não é um simples campo visual: o backend deve impedir acesso às demais rotas enquanto a troca não for concluída.

Caso o usuário tenha vários vínculos, informar antes da confirmação que a nova senha vale para todas as organizações. O endpoint deve conferir que o usuário realmente pertence à organização aberta; uma URL organizacional não pode operar uma conta arbitrária.

Na alteração: invalidar tokens anteriores de recuperação e revogar as sessões de login da conta nas organizações e, quando aplicável, na plataforma. As credenciais de aparelhos/checkpoints são outra categoria e não devem ser apagadas como consequência implícita do reset de senha do organizador. Bloqueio de acesso local continua afetando apenas a organização selecionada.

## Permissões e confirmação

O superadmin autenticado deve conseguir criar usuários, definir responsável e ativar organizações sem depender do aceite de terceiros. Manter autorização no servidor, MFA no login, sessão válida, CSRF e auditoria.

Proposta de usabilidade: ações rotineiras usam a sessão autenticada; ações com impacto global têm confirmação contextual informando exatamente o alcance. Revisar por operação a exigência atual de reconfirmação a cada cinco minutos, em vez de remover a validação de todas as escritas. Não confundir a confirmação de intenção com novo login.

Preservar consistência: não remover o último responsável ativo sem substituição, não afetar outra organização por bloqueio local, não remover o último superadmin ativo e não ressuscitar credenciais revogadas ao reativar uma organização.

## Implementação necessária

Frontend:

- Reorganizar `platform-organizations.tsx` e extrair uma lista/detalhe de usuários contextual, evitando duplicar a tela global inteira.
- Retirar Pessoas de `platform-workspace.tsx`; corrigir atalhos em `platform-overview.tsx`, filtros, links de auditoria e rotas antigas. /plataforma/pessoas deve orientar a selecionar organização; links antigos para conta com vários vínculos não podem escolher uma organização arbitrariamente.
- Reaproveitar operações de `platform-accounts.tsx`, com organizationId explícito, mensagens de alcance e formulários locais.
- Separar confirmação, carregamento e erro por ação; preservar os dados digitados após falha; atualizar a lista sem sair da ficha.

Backend — contratos propostos, ainda não implementados:

- Ampliar GET /organizations/:id/members com estados necessários à ficha, paginação e busca. Não carregar dados de todas as organizações no navegador para filtrar localmente.
- POST /organizations/:id/members: criar conta nova ou vincular identidade existente; distinguir os modos e validar versões/duplicidade.
- POST /organizations/:id/members/:userId/password: definição de senha pelo superadmin, conferência do vínculo e política para identidades compartilhadas. Reutilizar o serviço de senha/revogação, sem copiar regras em endpoints divergentes.
- Ampliar /organizations/:id/transitions para ativação inicial direta, incluindo estado pending, responsável e cancelamento do convite substituído.
- Reutilizar /members/:id/status e /responsible existentes com mensagens/contexto adequados.
- Garantir que os comandos com senha não persistam a senha no armazenamento de idempotência. O digest de payload que contém senha também precisa de tratamento específico para não introduzir um verificador rápido de senha fora do scrypt.

Banco:

- app.users, memberships, organizations, audit e convites já suportam a maior parte da mudança. Não renomear banco ou roles, nem recriar dados.
- Se adotada a troca obrigatória, adicionar migration incremental e contrato de autenticação restrito. Não editar migrations aplicadas.
- Não marcar todos os usuários existentes como troca obrigatória; aplicar somente em criação/reset administrativo conforme a nova política.

## Etapas propostas

1. Ficha centralizada: remover Pessoas do menu, trazer lista, bloqueio local, responsável e sessões para a organização; corrigir atalhos e navegação mobile. As APIs existentes cobrem grande parte desta etapa.
2. Onboarding independente de SMTP: criar/vincular usuário diretamente e ativar organização pendente pelo superadmin; tratar convites antigos e concorrência em transações.
3. Senha administrativa: reset contextual, impacto compartilhado explícito, invalidação das sessões e troca obrigatória no primeiro acesso com migration e testes.
4. Validação local: jornada completa com banco sintético, revisão desktop/mobile e atualização da documentação. Publicação fica fora desta investigação e não será executada automaticamente.

As etapas 2 e 3 são necessárias para atingir o objetivo completo sem SMTP; entregar apenas a nova navegação não resolve o problema atual.

## Critérios de aceite

- Sem sair da organização, superadmin cria acesso, escolhe responsável, ativa a organização e redefine senha.
- Nova organização e responsável conseguem operar com SMTP desligado.
- Pessoas não aparece no menu nem em atalhos obsoletos; Super admins permanece acessível.
- Organização pendente existente pode ser ativada sem aceite de email, desde que tenha responsável ativo.
- Reset funciona sem email, encerra sessões da conta e não altera dados de provas.
- Conta de múltiplas organizações mantém vínculos; reset informa alcance global; bloqueio local não bloqueia outras organizações.
- Convite antigo não desfaz ativação/responsável definidos pelo superadmin.
- Sem sessão, com sessão expirada ou perfil organizador, endpoints administrativos recusam a ação.
- Repetição de requisição e edição concorrente não criam contas duplicadas nem sobrescrevem alterações silenciosamente.
- Cobrir 360/390 px e desktop; confirmar fluxo de teclado, erros recuperáveis e ausência de rolagem horizontal.

## Limites da investigação

Conclusões baseadas em leitura do código, contratos e migrations locais; não foi realizado teste de usabilidade com pessoas nem inspeção da VPS. Este documento é plano de trabalho, não comprovação de que os novos fluxos já existem. Nenhum arquivo de aplicação foi modificado nesta rodada.
