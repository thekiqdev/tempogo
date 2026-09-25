# UX-SA-02 — Estrutura visual e navegação

Data: 24/09/2026. Implementação concluída; evidências consolidadas na [UX-SA-06](ux-sa-06-execucao.md).

Implementada a área de trabalho autenticada com lateral TempoGo, seis destinos, cabeçalho, menu da conta, breadcrumb e estados independentes da autenticação. Só a página selecionada é montada. A identidade visual usa a paleta do organizador, com estilos restritos à plataforma.

Rotas diretas e recarga mantêm a ficha selecionada. Busca e filtros ficam na URL nas listagens. Rascunhos são preservados durante confirmação de identidade; navegação avisa antes do descarte. Menu móvel possui foco inicial, contenção de Tab, Escape e retorno de foco após remover inert do conteúdo. Confirmações usam dialog nativo.

Decisão: navegação dentro da aplicação utiliza History API, mantendo fragmentos reservados aos links públicos. O aviso de saída pelo histórico/fechamento do navegador usa a confirmação nativa; a lateral usa diálogo do painel.

Validação técnica e limites de aceite: consultar UX-SA-06. A entrega local não representa publicação na VPS ou aprovação humana de usabilidade.
