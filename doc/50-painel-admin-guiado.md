# Painel administrativo guiado

## Plano de implantação

1. Cadastro de organização em duas etapas: salvar dados e abrir imediatamente o formulário do primeiro usuário. Cadastro incompleto pode ser retomado. Concluir o primeiro acesso ativa a organização na mesma transação, sem ação manual.
2. Cadastro direto de superadmin com email e senha, sem convite nem SMTP. Contas existentes não são sobrescritas. MFA no primeiro acesso e confirmação de identidade para concessão global permanecem; confirmação dentro do formulário, sem perder os dados.
3. Diálogos de edição com foco, Escape, retorno ao botão de origem, rolagem interna e adaptação ao celular. Senha/email junto da ação escolhida. Situação da organização fica em Configurações, separada dos usuários. Ações secundárias organizadas em detalhes.
4. Testes de integração e navegador: ativação atômica, retomada, duplicidade, permissões, cadastro direto e MFA, diálogos e larguras de 360/390/1280 px. Atualizar documentação de entrega.

## Critérios

Organizações suspensas ou encerradas não são ativadas ao adicionar membros. Senhas não aparecem em respostas, auditoria ou fingerprints públicos. Convites antigos continuam válidos e disponíveis em área secundária. Tudo local, sem commit ou envio ao GitHub.

## Entrega local — 26/09/2026

Etapas 1 a 3 implementadas. O formulário do responsável abre automaticamente após salvar os dados; reabrir uma organização sem responsável retoma essa etapa. O botão Concluir e ativar organização cria/vincula a conta, define o responsável e ativa na mesma transação. Se houver erro, a organização continua incompleta e os campos ficam disponíveis para correção.

Novo superadmin abre cadastro direto com email, senha e confirmação. Nenhum email é enviado; MFA é configurado pelo titular no primeiro login. Se a confirmação de identidade do operador tiver expirado, senha e código MFA são pedidos dentro do mesmo formulário, preservando o cadastro. Email já cadastrado é recusado sem sobrescrever a identidade.

Adicionar acesso, redefinir senha e alterar email usam diálogo nativo com foco inicial, Escape, confirmação de descarte e retorno ao botão de origem. No celular, ocupam a tela, com cabeçalho e rolagem interna. Configurações de suspensão/encerramento ficam separadas dos usuários; ações secundárias e convites antigos ficam em seções recolhidas.

Etapa 4 validada: npm run check (lint, tipos, 13 unitários e build); 74 testes de integração; test:e2e:organizations; test:e2e:platform-release com SMTP local, convites legados, dois superadmins, suspensão/reativação, 100 registros offline preservados, 360–1440 px e zoom de 200%. Jornada nova também valida retomada, foco, ativação automática, cadastro sem email e confirmação dentro do formulário.

Nenhuma nova migration nesta etapa. Mantém a migration 011 da entrega anterior. Ambiente de desenvolvimento em http://127.0.0.1:5173/; sem commit ou push. Capturas em tmp/organization-admin.

## Ajuste de 28/09/2026 — etapa 2 na página

O cadastro do responsável passa a ser uma etapa inline na ficha, sem popup nem bloqueio do fundo. A etapa 2 permite voltar aos dados da organização e retomá-la após recarregar. Busca/lista de usuários ficam ocultas durante o cadastro e as opções de gestão ficam recolhidas. A conclusão continua ativando automaticamente a organização. Redefinir senha e demais ações posteriores mantêm seus diálogos.

Validação: lint, tipos, testes unitários e build; jornada de navegador com retorno à etapa 1, retomada, ausência de diálogo, ativação automática e larguras 360/390/1280 px.
