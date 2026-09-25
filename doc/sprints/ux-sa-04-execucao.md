# UX-SA-04 — Pessoas, super admins e convites

Data: 24/09/2026. Implementação concluída; evidências consolidadas na [UX-SA-06](ux-sa-06-execucao.md).

Implementadas listas e fichas separadas para Pessoas e Super admins, com busca por email, filtro de situação e organização. A seleção de super admins é aplicada no servidor. Vínculos de uma conta são paginados, com limite inicial de 25 e continuação por cursor.

A central de Convites reúne convites organizacionais e globais, filtrando destinatário, tipo, situação e organização. Situação efetiva considera expiração; entrega do email é apresentada separadamente. Reenvio/cancelamento usam os endpoints existentes, versão, idempotência, motivo e confirmação.

Diálogos identificam o alcance de bloqueio global ou de vínculo, novo email, recuperação, revogação e privilégio. Troca de email exige prova do endereço/senha; convite global exige aceite/MFA. Último admin permanece protegido pelo backend.

Consultas adicionadas: GET /api/v1/platform/directory/invitations; GET /api/v1/platform/users/:id/memberships. Filtros adicionados em users: platform e organization_id. Todas exigem sessão autorizada; nenhum privilégio sobre passagens foi acrescentado.

Validação técnica e limites de aceite: consultar UX-SA-06. A entrega local não representa publicação na VPS ou aprovação humana de usabilidade.
