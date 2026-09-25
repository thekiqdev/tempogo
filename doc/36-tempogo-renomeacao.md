# TempoGo — renomeação e compatibilidade

Data: 23/09/2026. A marca vigente do produto é **TempoGo**.

## Locais atualizados

- Marca no login e painel administrativo, rodapé e mensagem de inicialização.
- Entrada de campo e cabeçalho da captura mobile.
- Título HTML e nomes completo/curto do manifest PWA.
- Remetente padrão, assunto de recuperação de senha e exemplos de configuração de email.
- Título da documentação OpenAPI de captura.
- Pacote raiz `tempogo`, workspaces `@tempogo/api`, `@tempogo/web`, `@tempogo/contracts`, imports, scripts e lockfile.
- Métricas `tempogo_http_*` e `tempogo_process_*`, job Prometheus e alertas TempoGo correspondentes.
- Títulos dos READMEs e instruções de execução dos pacotes internos.
- Comentário do schema PostgreSQL atualizado por `006_tempogo_brand.sql`, sem modificar migrações já aplicadas.

## Identificadores preservados deliberadamente

A investigação incluiu fonte, configurações, scripts, testes, documentação e referências em arquivos de ambiente, sem expor segredos. As ocorrências restantes do nome anterior são identificadores de compatibilidade ou registros históricos:

- IndexedDB `cronocheckpoint-manual` e os testes que o consultam: contém a fila offline. Trocar o nome sem migração abriria outro banco e ocultaria pendências existentes.
- Bancos `cronocheckpoint`, `cronocheckpoint_test`, `cronocheckpoint_homolog`; usuários/papéis `cronocheckpoint`, `cronocheckpoint_app`, `cronocheckpoint_runtime`: compõem conexões, concessões e isolamento existentes. São mantidos em Compose, CI, exemplos, provisionamento, testes e instruções técnicas.
- Projetos Compose `cronocheckpoint` e `cronocheckpoint-homolog`: mantêm os volumes, redes e containers atuais. Scripts operacionais que localizam essas redes/containers continuam compatíveis.
- Tags de imagens das candidatas/rollback das Sprints 04–05 e seus relatórios: identificam imagens históricas, não a marca exibida pela aplicação atual.
- Migrações 001–005: o executor verifica checksum; alterar o texto histórico impediria novas migrações. A migração 006 substitui o comentário de marca no schema existente.
- Pasta local do projeto e PDF da proposta original: são localização de trabalho e fonte histórica, não textos da interface. Arquivos de evidência em `tmp` não são reescritos retroativamente.

O termo genérico **checkpoint**, a rota `/checkpoint` e o ícone de cronômetro permanecem: descrevem a função do produto e não contêm a marca antiga. Cookies e caminhos de API também permanecem estáveis para preservar sessões e integrações.

## Atualização dos ambientes

O comando continua sendo `npm run homolog:up`. O build usa os novos workspaces; os dados e a identidade de instalação da PWA são preservados. A migração 006 é aplicada pelo fluxo de migração existente.

Instalações PWA abertas podem continuar mostrando a versão em cache até a atualização normal. Não limpar os dados do navegador nem forçar atualização enquanto houver capturas pendentes. O nome apresentado pelo sistema operacional depende da atualização do manifest pelo navegador.

Métricas foram renomeadas juntamente com a configuração de monitoramento deste repositório. Em ambientes que usam dashboards/alertas externos, atualizar consultas antigas para `tempogo_*` e job `tempogo` junto com o deploy. Séries históricas não são renomeadas retroativamente.

Um `MAIL_FROM` personalizado tem precedência sobre o padrão da aplicação. Os arquivos locais foram verificados para a marca antiga; remetentes e domínios personalizados sem a marca anterior foram preservados.

## Validação

- `npm install --offline --ignore-scripts`: links locais dos três workspaces atualizados, sem troca de versões das dependências.
- `npm run check`: lint, tipos, nove testes unitários e build aprovados.
- `npm run test:integration`: 44 testes aprovados com PostgreSQL real, incluindo execução repetível/checksums/rollback de migrações, autenticação, isolamento, captura, recuperação e revisão.
- A busca residual confirma que a marca anterior não permanece nos textos atuais de interface, manifest, emails padrão, nomes npm ou definições de monitoramento; as exceções técnicas acima continuam intencionais.
