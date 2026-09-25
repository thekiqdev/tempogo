# Painel, revisão e conciliação

Implementado na Sprint 04 em 22/09/2026. Fluxo disponível em desenvolvimento e homologação local HTTPS. A liberação para corrida real depende das Sprints 05 e 06.

## Conferir passagens

No evento, abra **Passagens**. Filtre pelo número vigente (texto com zeros à esquerda), checkpoint, período da captura vigente e situação. Os limites de período são inclusivos. Datas na interface usam o fuso do aparelho; a exportação usa ISO 8601 UTC e inclui o fuso configurado do evento.

O painel mostra até 50 passagens por página, contagem total do filtro, pendentes, invalidadas e última atualização. Atualiza a cada 15 segundos. A ordenação usa recebimento decrescente e ID como desempate; novas chegadas podem deslocar páginas durante a prova.

Situações: aceita, requer revisão e invalidada. Uma captura sem sinalizações começa aceita administrativamente; isso não representa classificação ou tempo oficial. Se surgir nova solicitação ou sinalização ainda não analisada, volta a requerer revisão.

## Corrigir com histórico

Abra **Revisar**. Confira original, valor vigente, evidências e solicitações do operador. Informe número e horário corretos, aceite ou invalide a passagem e descreva o motivo. A decisão registra autor, data, antes/depois e versão, sem alterar a observação original ou remover suas sinalizações.

Duas revisões sobre a mesma versão não sobrescrevem uma à outra. Novas evidências entre abrir e salvar também causam conflito: feche a revisão, abra novamente e confira os dados. Se a resposta se perder, repetir o mesmo formulário reutiliza o identificador da tentativa. A API devolve a revisão já gravada; mudar o conteúdo da tentativa exige novo identificador.

Duplicatas humanas continuam como observações separadas. O administrador pode invalidar uma delas após conferir; não há exclusão automática. Recuperações e horários incertos exigem decisão humana. Uma revisão confirma a análise das evidências existentes naquele momento.

## Solicitar revisão no checkpoint

O operador abre **Solicitar revisão** em uma passagem confirmada da sua sessão e informa o motivo. A solicitação exige conexão e acesso válido. Ela não altera o número ou horário e permanece na auditoria. A sessão de outro operador, mesmo usando a mesma credencial em outro login, não pode solicitar revisão daquela passagem. Casos de sessão antiga ou acesso revogado são tratados pelo administrador.

## Exportar CSV

**Exportar CSV filtrado** usa os filtros aplicados, incluindo todas as páginas. O arquivo inclui ID, número vigente e original, checkpoint, horários vigente/bruto/estimado/recebido, fuso do evento, origem manual, situação e versão.

O arquivo usa UTF-8 com BOM, vírgula, aspas e CRLF. Textos que começam com prefixos de fórmula, inclusive após espaços/controles, recebem apóstrofo. Importe as colunas effective_bib e bib como **texto** na planilha para preservar zeros. Não use fórmulas para representar números de peito.

O limite é 50.000 passagens por exportação; acima dele, refine o filtro. Não há truncamento silencioso. A exportação é auditada e mantém bloqueio breve do evento para obter uma visão consistente enquanto gera o arquivo.

## Fechar, conciliar e finalizar

1. Em **Configuração**, feche a coleta com motivo. Registros offline já existentes ainda podem chegar, sempre sujeitos às regras de revisão.
2. Confira **Conciliação dos aparelhos**. Cada credencial representa um aparelho; verifique com o operador que a fila local está vazia e que a operação terminou.
3. Para confirmar conciliação, o evento precisa estar fechado, a última comunicação ter menos de dois minutos e as contagens de pendentes, enviando e bloqueados serem zero.
4. Resolva todas as passagens pendentes de revisão.
5. Finalize com motivo. Se houver aparelho não conciliado, registre uma exceção específica de pelo menos dez caracteres. A exceção fica auditada com aparelhos e evidências; ela não permite ignorar passagens que aguardam revisão.

Aparelhos sem comunicação têm contagens desconhecidas, nunca zero presumido. Uma nova passagem daquele aparelho, alteração das contagens ou mudança da versão do evento invalida a conciliação anterior. A comunicação, sozinha, nunca concilia automaticamente.

Finalizado bloqueia novas capturas, recuperação e revisões. Reabrir retorna para **coleta fechada**, com motivo e nova versão; é necessário conferir novamente. Para voltar à captura, faça depois a transição para em andamento. A largada original é preservada. Arquivamento permanece fora da operação desta sprint.

## Auditoria e escopo

A aba **Histórico** é paginada e apresenta ação, responsável, horário e dados da alteração. Não mostra senhas, hashes de autenticação ou cookies. Revisões, solicitações e conciliações são append-only para o usuário de banco da aplicação.

RF-14/B8 (participantes mínimos) foi adiado para F2, como permitido pelo planejamento P1. Número sem participante cadastrado continua permitido. IA, rankings e cálculo oficial continuam fora deste MVP.
