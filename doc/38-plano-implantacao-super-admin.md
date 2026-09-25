# TempoGo — plano de atualização: painel do super admin

Data: 23/09/2026. Status: SA-01 especificada; SA-02 a SA-06 concluídas tecnicamente e validadas localmente; implantação/aceite externo pendentes. Ver [execução SA-01](sprints/sa-01-execucao.md).

## Objetivo e posição no projeto

Entregar um segundo painel, exclusivo da administração da plataforma, para cadastrar organizações e administrar seus usuários e os super admins. O painel dos organizadores e a captura manual por checkpoint continuam como partes do mesmo sistema web, sem IA e sem aplicativo nativo.

A atualização será realizada em **seis etapas sequenciais**, identificadas como SA-01 a SA-06. É uma ampliação solicitada após a homologação local da Sprint 05 e anterior ao primeiro deploy e à Sprint 06 de piloto. Não renumera as sprints existentes. O cadastro e a gestão básica de organizações, antes previstos na fase F2, são antecipados; as demais funcionalidades de F2 permanecem futuras.

O usuário executará o deploy na Contabo/Easypanel. Este plano inclui preparar código, migrations, documentação, testes e procedimentos necessários para essa implantação. Aprovação deste plano não significa que os recursos já existem ou que a operação real está liberada.

## Escopo e regras propostas

- Organização é a proprietária dos eventos; usuário é uma identidade pessoal vinculada por permissão. Transferir o responsável não transfere eventos para outra organização.
- Papéis desta entrega: super admin da plataforma, admin da organização e operador de checkpoint. Não criar um sistema genérico de papéis personalizados nesta fase.
- Super admin gerencia contas e consulta indicadores operacionais; não edita diretamente passagens. Revisões continuam pelo fluxo auditado da organização.
- Login separado, sugerido em /plataforma, com APIs sugeridas em /api/v1/platform. Os nomes definitivos serão registrados na etapa SA-01.
- MFA obrigatório para super admins. Proposta: TOTP com códigos de recuperação de uso único; não depender somente de email para remover o segundo fator.
- Novas contas ativadas por convite com token de uso único e prazo proposto de 24 horas. Reenvio invalida o convite anterior; nenhuma senha é enviada por email ou exibida ao super admin.
- Organização com estados pendente, ativa, suspensa e encerrada. Usuários, vínculos, convites e organizações têm ciclos de vida distintos.
- Suspensão bloqueia novas operações online no servidor e invalida acessos aplicáveis. Não apaga a fila offline nem promete revogação instantânea sem rede. Exportação local permanece disponível; recuperação administrativa exige organização reativada e revisão.
- Reativação não ressuscita sessões e credenciais revogadas: novos acessos são emitidos conforme as regras definidas na SA-01.
- Encerramento é desativação lógica nesta entrega. Exclusão definitiva de dados e política de retenção exigem procedimento separado.
- Impedir, inclusive em ações concorrentes, a remoção do último super admin ativo e do último admin ativo de uma organização ativa. Transferências exigem sucessor elegível.
- Motivo obrigatório para suspender, encerrar, remover privilégios e recuperar MFA. Mostrar provas em andamento antes de suspender uma organização.
- Sem impersonação, cobrança, assinaturas, planos comerciais, IA ou alteração das regras de cronometragem nesta atualização.

## SA-01 — Regras, permissões e arquitetura

**Entrega:** especificação para implementação que evita misturar administração global com acesso aos eventos. Entregue em [regras e arquitetura](39-super-admin-regras-e-arquitetura.md) e [contratos](40-super-admin-contratos.md); não é código executável.

Tarefas:
- [x] Mapear os fluxos de criação, convite, ativação, bloqueio, suspensão, reativação, transferência e encerramento.
- [x] Fechar duração das sessões, inatividade, validade dos convites, recuperação de MFA e efeitos de cada bloqueio.
- [x] Definir se um usuário pode pertencer a várias organizações e como selecionar o contexto; o modelo atual já separa users e memberships, mas a interface e as consultas precisam ser conferidas antes de assumir suporte completo.
- [x] Definir matriz de permissões e quais dados operacionais globais podem ser consultados.
- [x] Projetar migrations aditivas para privilégios da plataforma, sessões, MFA, convites, estados e auditoria; não alterar migrations já aplicadas.
- [x] Projetar autorização no backend, cookies/sessões separados e proteção CSRF. Uma sessão de organizador nunca deve conceder acesso global.
- [x] Definir acesso ao banco com privilégio mínimo: não liberar SUPERUSER/BYPASSRLS para o runtime nem remover isolamento dos tenants para facilitar o painel.
- [x] Registrar contratos de API, erros, paginação, filtros e tratamento de concorrência.

**Aceite:** todas as operações têm ator, permissão, transição e efeito documentados; estratégia de migração preserva usuários, organizações, eventos e passagens existentes. Nenhuma decisão crítica fica implícita no frontend.

**Dependência:** nenhuma etapa SA anterior. Consultar perfis, arquitetura e modelo de dados existentes.

## SA-02 — Acesso seguro e primeiro super admin

**Entrega:** entrada funcional no painel da plataforma com autenticação e MFA. Ver [execução SA-02](sprints/sa-02-execucao.md) e [guia de operação](41-super-admin-acesso-e-operacao.md).

Tarefas:
- [x] Criar comando de provisionamento inicial, sem senha fixa ou conta padrão; impedir bootstrap público e criação acidental repetida.
- [x] Implementar login, logout, expiração, revogação de sessões e recuperação de senha.
- [x] Exigir conclusão do cadastro e validação de MFA antes de liberar qualquer operação administrativa global.
- [x] Implementar TOTP, proteção contra reutilização de código e códigos de recuperação armazenados como hashes; proteger a chave TOTP com segredo de implantação separado.
- [x] Implementar confirmação recente de senha/MFA para ações sensíveis, limites de tentativas e mensagens que não revelem contas.
- [x] Documentar recuperação de acesso quando não houver outro super admin disponível, por procedimento restrito e auditado; sem atalho público de desativação de MFA.
- [x] Criar estrutura visual do painel e estados de acesso negado, sessão expirada e erro.

**Aceite:** login sem MFA não libera o painel; logout, expiração e revogação bloqueiam o servidor; sessão de organizador é recusada nas APIs globais; segredos e códigos não aparecem em logs.

**Dependência:** SA-01. A auditoria mínima já deve existir nesta etapa, embora sua interface completa seja entregue na SA-05.

## SA-03 — Cadastro e ciclo de vida das organizações

**Entrega:** super admin cadastra uma organização e convida seu primeiro responsável.

Tarefas:
- [x] Criar listagem paginada, pesquisa, filtros por situação e detalhe da organização.
- [x] Cadastrar nome da organização, responsável, email e telefone de contato; campos adicionais apenas com finalidade definida.
- [x] Criar organização e convite inicial com integridade transacional; falha de email não pode produzir contas duplicadas ou deixar o estado impossível de recuperar.
- [x] Implementar aceite do convite, definição de senha para nova identidade e associação segura quando o email já possuir conta. O convite não redefine a senha de uma conta existente.
- [x] Implementar reenvio, expiração e cancelamento de convites.
- [x] Implementar suspensão, reativação e encerramento com motivo, confirmação e indicação de eventos em andamento.
- [x] Aplicar estado da organização em login, APIs, credenciais de campo e sincronização; preservar os registros locais e documentar recuperação.

**Aceite:** organização recém-ativada acessa apenas seus dados; uma segunda organização não consegue consultar ou alterar a primeira, mesmo usando IDs conhecidos. Convite expirado/cancelado/reutilizado é recusado. Suspensão bloqueia a próxima operação online sem apagar passagens ou filas offline.

**Dependência:** SA-02 e serviço SMTP de homologação. Publicação exige SMTP real configurado pelo usuário.

## SA-04 — Administração de usuários e super admins

**Entrega:** administração completa do ciclo de vida das contas dentro do escopo definido.

Tarefas:
- [x] Convidar novos admins para organizações existentes e novos super admins para a plataforma.
- [x] Listar usuários, vínculos, estado de ativação e convites pendentes; não mostrar segredos.
- [x] Alterar dados cadastrais e verificar novo email antes de substituir o identificador de acesso.
- [x] Diferenciar bloqueio global da identidade e remoção de vínculo com uma organização; mostrar o alcance da ação.
- [x] Transferir responsabilidade e impedir organização ativa sem administrador elegível.
- [x] Revogar sessões, solicitar redefinição de senha e executar recuperação de MFA conforme o procedimento aprovado.
- [x] Implementar proteção transacional do último super admin e impedir autoelevação de privilégio por organizadores.
- [x] Tratar ações simultâneas com versão/conflito e registrar alterações de privilégios na mesma transação.

**Aceite:** convite não concede privilégio antes do aceite e do MFA exigido; bloqueio revoga o acesso correto; remoções concorrentes não deixam a plataforma sem super admin; usuário de uma organização não ganha acesso a outra por edição de payload.

**Dependência:** SA-03; reutilizar o mecanismo de convites da etapa anterior.

## SA-05 — Visão geral, auditoria e operação

**Entrega:** painel utilizável para acompanhar organizações e investigar ações administrativas.

Tarefas:
- [x] Exibir organizações por situação, usuários, convites pendentes e eventos em andamento.
- [x] Exibir contagens de eventos, checkpoints e registros por organização, com paginação e consultas limitadas.
- [x] Criar consulta de auditoria por ator, organização, ação e período, incluindo falhas administrativas relevantes.
- [x] Registrar quem fez, quando, entidade, mudanças permitidas, motivo e request ID; não copiar senhas, tokens, chaves MFA ou dados desnecessários.
- [x] Garantir que o painel não permita editar/apagar auditoria e que alterações relevantes tenham registro transacional.
- [x] Tratar erros e limites de requisições com mensagens claras, sem perder dados do formulário.
- [x] Completar navegação responsiva, estados vazios, validação, acessibilidade por teclado e mensagens de confirmação.
- [x] Escrever guias de onboarding, suspensão, transferência e recuperação.
- [ ] Designar nominalmente responsáveis operacionais antes da publicação (pendência externa).

**Aceite:** totais conferem com dados de teste; ações críticas são rastreáveis; pesquisas têm paginação; nenhum super admin consegue adulterar auditoria pelo painel; interface funciona em desktop e viewport móvel.

**Dependência:** SA-04. Registrar auditoria é obrigatório desde as etapas anteriores; esta etapa consolida a consulta e a experiência operacional.

## SA-06 — Homologação, atualização e entrega para deploy

**Entrega:** candidata validada, com procedimentos de implantação e recuperação atualizados.

Tarefas:
- [x] Testar migrations sobre cópia do estado anterior e instalação vazia; comparar vínculos, eventos e passagens antes/depois.
- [x] Testar MFA, recuperação, convites, expiração, sessão revogada, CSRF, limites, isolamento e tentativas de elevação de privilégio.
- [x] Testar concorrência na proteção do último administrador e nas transições de organização.
- [x] Testar suspensão durante captura offline, reconexão, exportação e recuperação após reativação.
- [x] Repetir regressão das jornadas existentes: organizador, evento, checkpoint, captura, sincronização, revisão e CSV.
- [x] Testar duas organizações independentes e dois super admins com SMTP local, sem usar contas reais.
- [x] Verificar restauração do banco e disponibilidade da chave de MFA na recuperação; backup do banco sozinho não recupera segredos externos.
- [x] Atualizar imagens, variáveis de ambiente, bootstrap, documentação de deploy e manifesto da candidata.
- [x] Ensaiar manutenção e correção progressiva como retorno seguro. Código antigo que não aplique as novas regras de acesso não pode ser usado como retorno automático; definir correção progressiva ou manutenção quando necessário.
- [x] Entregar roteiro para o usuário executar deploy e verificações pós-publicação.

**Aceite técnico:** testes relevantes aprovados, sem falhas críticas de autorização/integridade, candidata identificada, backup/recuperação ensaiados e documentação consistente. Não usar apenas sucesso do build como aceite.

**Aceite de implantação:** no ambiente do usuário, HTTPS, SMTP, segredos, bootstrap/MFA, alertas, backup externo e jornada de criação de organização conferidos. Piloto da Sprint 06 continua exigindo validação em aparelhos reais e aceite da operação.

**Dependência:** SA-01 a SA-05 concluídas. Deploy é executado pelo usuário.

## Marcos e estimativa

- Após SA-02: acesso seguro à plataforma demonstrável, ainda sem gestão completa.
- Após SA-04: fluxo funcional de criar organização e administrar contas.
- Após SA-06: atualização tecnicamente pronta para implantação; liberação real depende das verificações no ambiente publicado.

Referência inicial: SA-01, 1–2 dias úteis; SA-02, 3–5; SA-03, 3–4; SA-04, 3–4; SA-05, 2–3; SA-06, 3–5. Total de **15–23 dias úteis de trabalho técnico**, aproximadamente 3–5 semanas para uma pessoa dedicada com apoio de validação. Estimativa sugerida, não prazo contratado; reestimar após SA-01. Não inclui espera por SMTP, domínio, decisões ou disponibilidade da equipe da corrida.

Cada etapa terá um registro de execução e evidências ao ser implementada. Só marcar tarefas concluídas após verificar seus critérios. Não iniciar SA-06 com itens críticos das etapas anteriores abertos.

## Documentação a atualizar durante a execução

- SA-01: requisitos, perfis, arquitetura, modelo de dados, contratos e decisões técnicas.
- SA-02: autenticação da plataforma, configuração e recuperação de MFA, bootstrap e gestão de segredos.
- SA-03/04: contratos de organizações, convites, usuários, privilégios e transições.
- SA-05: catálogo de auditoria e manual do super admin.
- SA-06: evidências de testes, migrations, manifesto, guia Contabo/Easypanel, backup e runbook.

Referências: [perfis](05-perfis-e-acessos.md), [arquitetura](07-arquitetura.md), [modelo de dados](08-modelo-de-dados.md), [backlog](14-backlog-mvp.md), [roadmap](15-roadmap.md), [deploy](30-deploy-contabo-easypanel.md) e [sprints](sprints/README.md).
