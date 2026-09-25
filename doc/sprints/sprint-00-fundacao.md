# Sprint 00 — Fundação e decisões

Status: em andamento — fundação técnica implementada; aceite G0 pendente. Ver [registro de execução](sprint-00-execucao.md). Duração proposta: 1 semana. Fase F0; backlog B0. Responsáveis: produto, liderança técnica e coordenação de prova.

## Objetivo e incremento

Fechar as decisões que mudam o desenho do MVP e deixar uma aplicação mínima executável, com banco e verificações automatizadas. Ao final, a equipe consegue iniciar o desenvolvimento com ambiente reproduzível e escopo definido.

## Entrada

- Documentação de produto disponível e responsável pelo piloto identificado.
- Acesso ao repositório e capacidade de desenvolvimento a confirmar no planejamento.
- Ler [escopo](../02-produto-e-escopo-mvp.md), [arquitetura](../07-arquitetura.md), [ADRs](../17-decisoes-arquiteturais.md) e [decisões pendentes](../18-riscos-e-decisoes.md).

## Tarefas

- [ ] S00-01 — Produto/operação: resolver D01–D03: modalidade e voltas, política de números, escala, aparelhos e conectividade. Registrar decisões; se divergirem das propostas, atualizar escopo e sprints.
- [ ] S00-02 — Liderança: resolver D04, nomear responsáveis e fixar stack, versões suportadas, organização do código e abordagem de hospedagem.
- [ ] S00-03 — Produto: confirmar P0, manter participantes como P1 e definir o evento/ensaio pretendido, sem assumir data de entrega contratada.
- [x] S00-04 — Desenvolvimento: criar estrutura web/API/contratos, dependências fixadas, comandos de build e convenções de erros/configuração.
- [x] S00-05 — Backend: preparar PostgreSQL local, migrations versionadas, conexão e verificação de saúde; separar configuração de teste e desenvolvimento.
- [ ] S00-06 — Liderança: configurar CI com build, tipos/lint e execução dos testes existentes; preparar estratégia de homologação e segredos fora do código.
- [x] S00-07 — Desenvolvimento: produzir guia de execução local e `.env.example` sem segredos; documentar comandos realmente executados.
- [x] S00-08 — Produto/QA: transformar a primeira jornada em roteiro: admin → evento → checkpoint → acesso de campo → registro → consulta. Reestimar Sprints 01/02.

## Critérios de aceite

1. D01–D04 têm decisão, responsável e impacto registrado; não existem decisões arquiteturais apresentadas como aprovadas sem confirmação.
2. Em ambiente limpo, seguir o guia instala dependências, inicia web/API/banco e executa build sem conhecimento informal.
3. Migrations iniciais executam em banco vazio; verificação de saúde distingue aplicação ativa de banco inacessível.
4. CI executa no repositório e falha quando uma verificação obrigatória falha.
5. Gate G0 registrado, com responsáveis e limites do primeiro piloto.

## Verificação e demonstração

Reproduzir instalação usando o guia, validar conexão/migration e mostrar a aplicação mínima. Revisar configuração para evitar segredos. Registrar versão, comandos e resultado; não criar testes artificiais apenas para aumentar contagem.

## Entregáveis e saída

Repositório estruturado, guia local, CI inicial, configuração segura e decisões atualizadas. Não inclui login pronto ou funcionalidades esportivas. Se G0 não for atendido, permitir somente protótipos reversíveis independentes da decisão pendente.

Próxima: [Sprint 01](sprint-01-admin-e-configuracao.md). Aplicar a definição comum de pronto do [índice](README.md).
