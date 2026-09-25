# UX-SA-03 — Organizações como centro da administração

Data: 24/09/2026. Implementação concluída; evidências consolidadas na [UX-SA-06](ux-sa-06-execucao.md).

Implementadas lista pesquisável, filtro por situação e paginação. Cada item mostra contato, responsável e situação; a consulta retorna o email do responsável sem chamada de detalhe para cada linha. Cartões compactos foram escolhidos para adaptar a mesma informação ao celular.

Ficha dividida em Resumo, Cadastro, Pessoas e acessos, Convites e Histórico. Cadastro é editado explicitamente; criação apresenta revisão antes do envio. Suspensão/reativação/encerramento ficam em área de alteração de situação, com motivo, provas em andamento e confirmação. Convites, transferência e versões mantêm os controles anteriores.

A consulta de histórico recebe o ID da organização da ficha. Não foram alteradas migrations ou regras de passagens. Organização encerrada continua terminal, com restrições garantidas no servidor.

Validação técnica e limites de aceite: consultar UX-SA-06. A entrega local não representa publicação na VPS ou aprovação humana de usabilidade.
