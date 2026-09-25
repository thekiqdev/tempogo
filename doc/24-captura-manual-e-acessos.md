# Captura manual e acessos — Sprint 02

> Registro da entrega da Sprint 02. A evolução offline já implementada está no [guia da Sprint 03](26-offline-e-recuperacao.md) e nos [contratos atualizados](27-contratos-sprint-03.md).


Implementação validada em desenvolvimento e homologação local HTTPS em 16/09/2026. Não há IA nem cadastro obrigatório de corredores.

## Como demonstrar

1. Abra o admin em http://127.0.0.1:5173 e entre na organização. O acesso administrativo e a recuperação de senha estão descritos no [guia](22-admin-e-homologacao.md).
2. Cadastre a corrida, modalidade e checkpoints. Em Configuração, passe de Rascunho para Pronto e depois Em andamento, informando o horário real da largada.
3. No evento, abra **Acessos**, selecione um checkpoint ativo, identifique o aparelho e informe a validade, limitada a 30 dias.
4. Clique em **Gerar código e senha**. A senha só aparece nesta resposta/tela. Entregue-a ao operador e clique em **Já guardei a senha**. Para recuperar uma senha perdida, revogue o acesso e emita outro.
5. Abra http://127.0.0.1:5173/checkpoint em outra janela/perfil e informe código e senha. A entrada exige rede.
6. Digite `00152` com os botões ou teclado físico e confirme com Enter. O visor é limpo somente depois da conclusão da transação local.
7. Observe **Salvo no aparelho** e, após resposta de commit, **Confirmado no servidor**. No admin, a aba **Passagens** mostra os últimos 100 recebimentos.
8. Revogue o acesso no admin: a próxima chamada do operador é bloqueada. Uma chamada que já conquistou os bloqueios de leitura pode concluir antes da revogação; revogação e gravação são ordenadas transacionalmente.

A homologação usa https://localhost:5443 e o mesmo caminho /checkpoint. O certificado continua local e não instalado como confiável no Windows. Os testes automatizados aceitam a exceção exclusivamente nessa URL.

## O que está entregue

- Credencial por checkpoint/aparelho: código aleatório de 8 caracteres hexadecimais, senha aleatória de 24 caracteres, hash scrypt, validade e revogação. A senha não aparece em listagens, auditoria ou armazenamento do navegador.
- Sessão fixa no evento/checkpoint/dispositivo, cookie HttpOnly/SameSite Strict/Secure em HTTPS, CSRF e validação de Origin; duração máxima de 12 horas, limitada pela validade da credencial.
- Números textuais de 1 a 8 dígitos; zeros significativos. Vazio, letras e nove dígitos são rejeitados.
- Intenção local em IndexedDB com UUID, número e horário congelados antes de limpar o visor. Falha de armazenamento mantém o número digitado.
- Envio online com estado local pendente/confirmado/requer atenção. Falha de rede preserva o UUID para reenvio manual; reload da mesma sessão mantém os pendentes.
- Histórico do operador restrito à sessão atual. O admin só consulta passagens da sua organização.
- Observações imutáveis para o papel de runtime e auditoria na mesma transação.
- Reenvio idêntico retorna a observação existente. Mesmo UUID com outro payload, dispositivo ou sessão retorna conflito.
- Intenções distintas do mesmo número/ponto com horários de captura a até 5 segundos são mantidas e sinalizadas, inclusive sob concorrência. O sinal é de conferência, não exclusão automática.

## Limites para a próxima etapa

Esta entrega é uma fatia online, ainda não liberada para prova com rede instável. Não há service worker, concessão offline, calibração de relógio, sincronização com backoff, recuperação entre sessões, exportação ou resultados oficiais.

O horário do aparelho é armazenado como evidência bruta; o servidor acrescenta o recebimento. Não existe horário estimado corrigido nesta sprint. A calibração será implementada na Sprint 03.

Registros pendentes ficam associados à sessão original. Não limpar dados do navegador nem trocar de perfil/aparelho. Ao expirar ou revogar uma sessão com pendentes, os dados continuam no IndexedDB, mas a recuperação autorizada por nova sessão ainda depende da Sprint 03. Não se deve reenviar esses dados com outro UUID. O logout é bloqueado enquanto houver pendentes visíveis na sessão. Ao recarregar após expiração, o login reaparece; o pendente antigo permanece armazenado, sem migração automática para a nova sessão.

A janela de captura precisa estar aberta e o evento em andamento para uma nova observação. Replays já confirmados continuam aceitos depois do encerramento enquanto o acesso permanece válido. Um envio novo recebido após fechamento fica bloqueado localmente para atenção; reconciliação tardia será parte das próximas sprints.

O processamento usa bloqueio transacional por evento para decidir idempotência e duplicidade humana. Há limite de 600 POSTs/minuto por IP para captura. Escala, celulares reais, navegadores móveis e tempo prolongado serão avaliados nas Sprints 03/05; o teste em viewport móvel não substitui um telefone real.

## Referências de implementação

A confirmação local aguarda o evento `complete` da transação IndexedDB, não apenas sucesso da requisição de gravação. Referência: [MDN — complete](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event).

A validação da captura rejeita campos extras e coerção automática de números, preservando o contrato textual do número de peito. Referência: [Fastify — Validation and Serialization](https://fastify.dev/docs/v5.8.x/Reference/Validation-and-Serialization/).
