# UX-SA-06 — Homologação da interface CRM

Data: 24/09/2026. Implementação e homologação técnica local concluídas. Aceite humano e publicação na VPS pendentes.

## Escopo entregue

Navegação lateral e páginas próprias, fichas de organizações, pessoas e super admins, central de convites, visão geral e auditoria. Registros das etapas: [01](ux-sa-01-execucao.md), [02](ux-sa-02-execucao.md), [03](ux-sa-03-execucao.md), [04](ux-sa-04-execucao.md), [05](ux-sa-05-execucao.md).

## Verificação técnica

- npm run check: lint, tipos, 13 testes unitários e build.
- npm run test:integration: 71 testes aprovados. Inclui isolamento/RLS, CSRF, idempotência, versões, último admin, recuperação, auditoria e CSV. Novas asserções cobrem filtros da central de convites, expiração, paginação, consulta anônima negada, pessoas por organização, super admins no servidor e 31 vínculos em páginas de 25 e 6.
- npm run test:e2e:platform-ux: bootstrap, recuperação inicial, login, matrícula MFA, logout/relogin, histórico de navegação e estados de falha de consulta (401/403/409/429 e rede simulados).
- npm run test:e2e:platform-release: PostgreSQL e Edge reais, SMTP Mailpit local, duas organizações e dois super admins; convites/aceites, confirmação de identidade, suspensão/reativação, troca de email, auditoria, recarga de ficha, rascunho preservado ao cancelar descarte e central de convites.
- Teclado do menu móvel: foco inicial, Tab contido, Escape e retorno ao acionador. Layout verificado em 360, 390, 768, 1280 e 1440 px sem rolagem horizontal. Ampliação CSS 200% ensaiada; não equivale a ensaio manual do zoom nativo de todos os navegadores.
- Regressão do organizador/operador: 100 registros offline sincronizados com conteúdo preservado e IDs remotos únicos; suspensão impede upload, exportação de recuperação preserva a fila e reimportação após reativação recebe o registro uma única vez para revisão.

Correções identificadas pela homologação: foco solicitado enquanto o conteúdo ainda estava inert; posicionamento do menu da conta no celular; filtro de busca marcado indevidamente como rascunho; parâmetro ausente na consulta de pessoas por organização. Todas corrigidas antes do aceite. O ensaio completo respeita uma pausa de 61 segundos antes da regressão offline porque os usuários sintéticos compartilham o mesmo IP e limite HTTP; a proteção de produção foi mantida.

## Evidências e reprodução

Resultados consolidados em doc/releases/super-admin-ux-evidence.json; manifesto separado em doc/releases/super-admin-ux-candidate.json. Executar npm run release:platform-ux após mudanças no código para recalcular a identidade da candidata. O manifesto anterior SA permanece histórico.

Capturas em doc/assets/ux-super-admin; resultados brutos locais em tmp/ux-sa-02 e tmp/ux-sa-06. Os cenários usam bancos únicos terminados em _test, que são removidos ao fim; nenhum cadastro real foi alterado. Tokens, senhas, cookies e chaves MFA não são publicados nas evidências.

## Limites e aceite humano

A conclusão técnica local não significa homologação em Android/iPhone físicos, Safari, leitor de tela, zoom nativo ou corrida real. Contraste e legibilidade foram inspecionados visualmente, sem certificação formal WCAG. Ensaios de falha de consulta usam respostas controladas; proteções reais são cobertas pela integração.

Roteiro humano: localizar uma organização pelo nome; abrir sua ficha; conferir responsável e situação; editar contato; convidar um organizador; distinguir bloqueio global de bloqueio de vínculo; consultar a última alteração; repetir com teclado e celular. Registrar tempo, dúvidas e erros. Conferir textos longos, navegação por leitor de tela, ampliação e teclado virtual nos aparelhos disponíveis.

O deploy continua a cargo do usuário. Recriar as imagens Docker a partir desta candidata: imagens anteriores não contêm a reorganização. Esta rodada não repete restauração de backup/manutenção da SA-06, pois não modifica esquema, migrations ou política de autorização. Domínio, SMTP real, backup externo e validação operacional seguem o guia 43.

Candidata validada: **super-admin-ux-fab426c05d49**. Resultado final: 13 testes unitários, 71 de integração e os dois roteiros de navegador aprovados; nenhum erro JavaScript nos cenários.
