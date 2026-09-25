# Sincronização, offline e relógios

## Contrato de confiabilidade

O MVP opera online e tolera interrupções após preparação online. Não oferece primeiro login offline, sincronização garantida com app fechado, proteção contra exclusão do armazenamento ou revogação instantânea desconectada. O pacote da aplicação precisa estar carregado/cacheado antes da prova.

Fila local em IndexedDB, que fornece armazenamento estruturado no navegador. A aplicação deve tratar erros e quota; disponibilidade de armazenamento não equivale a backup. [Referência MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

## Máquina de estados local

`pending → sending → synced` ou `sending → pending` em falha transitória; erros permanentes → `blocked`. `synced` quer dizer persistido no servidor, mesmo que `status=needs_review`. Gravar resposta e ID remoto antes de remover item da fila ativa.

1. Ao confirmar, gerar UUID e congelar todos os campos da intenção.
2. Transação IndexedDB persiste intenção e estado `pending`.
3. Somente após sucesso local, mostrar confirmação local e limpar visor.
4. Enviar itens na ordem local; envio concorrente limitado a dois itens. Ordenação de chegada no servidor não define cronologia da prova.
5. Confirmar por item. Timeout mantém UUID original.
6. Backoff com jitter, aproximadamente 1, 2, 4, 8 e até 30 segundos; pausar em falta de rede detectada e reavaliar ao focar a tela.
7. Ao reiniciar, itens `sending` sem resposta voltam a `pending`.

Service worker serve cache versionado do shell; sincronização principal ocorre com tela aberta. Não atualizar versão nem migrar estrutura local no meio da operação. Migrations locais precisam ser testadas sem apagar itens pendentes. Reconectar após período offline atualiza contexto antes de subir fila, sem alterar escopo original.

## Relógios

Registrar `captured_at_raw` do dispositivo, `captured_at_estimated`, `received_at` do servidor, offset, RTT e momento da medição. Antes da prova, realizar várias consultas de tempo; para uma amostra com envio t0, resposta t1 e tempo de servidor s, offset aproximado = s − (t0+t1)/2. Preferir amostra de menor RTT e conservar incerteza. Não é sincronização de precisão esportiva.

Medir ao entrar e aproximadamente a cada 60 segundos online. Usar relógio monotônico durante sessão para detectar saltos no relógio de parede. Propostas para revisão: referência com mais de 5 minutos, RTT > 1 segundo, salto de relógio > 1 segundo ou tempo implausível. Servidor valida limites e nunca confia cegamente no cliente.

Offline: manter referência anterior e indicar degradação; não recalcular retrospectivamente as intenções com um offset novo. Reinício offline perde a referência monotônica: marcar qualidade temporal incerta. A reação do operador continua sendo fonte de erro mesmo com relógio alinhado.

## Encerramento e revogação

Em `closed`, uploads capturados na janela ativa são persistidos em revisão se credencial ainda for válida. Relógio do cliente não prova que a captura ocorreu antes do fechamento; exige conciliação humana. `finalized` exige reabertura auditada para recuperar dados.

Credencial revogada: uploads recusados, fila preservada. Pacote de recuperação contém versão do formato, UUIDs, escopo, horários, origem declarada e hashes, sem senhas/tokens. Admin importa mediante autorização própria; tudo entra em revisão e passa pela mesma idempotência. Hash detecta divergência, não autentica a veracidade do pacote.

## Reconciliação de campo

Admin compara contagem local, confirmada no servidor, bloqueada e revisada para cada dispositivo. Heartbeat antigo significa estado desconhecido, não fila vazia. Antes de finalizar, obter confirmação de todos os postos ou registrar exceção explícita. Conservar itens sincronizados por 24 horas no dispositivo como proposta operacional; limpar após conciliação, sem expor histórico a outra credencial.
