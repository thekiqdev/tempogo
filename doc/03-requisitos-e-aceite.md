# Requisitos e critérios de aceite

P0 = necessário para o MVP. P1 = conveniência opcional, sem impedir piloto. Todos os critérios são propostas de especificação.

## Funcionais

**RF-01 — Admin e sessão (P0).** Admin provisionado acessa por email/senha, encerra sessão e recupera acesso por token de uso único. Aceite: credencial inválida retorna mensagem genérica; logout e revogação impedem novas escritas; recuperação expirada falha.

**RF-02 — Organizações (P0).** Toda operação respeita a organização autenticada. Aceite: admin A não consulta nem altera evento B usando ID conhecido, filtros, exportação ou atualização direta.

**RF-03 — Eventos (P0).** Criar e editar rascunho; preparar, iniciar, encerrar, finalizar e arquivar com regras de estado. Aceite: não iniciar sem checkpoint ativo; finalizar bloqueia passagens novas e exige conciliação ou justificativa de exceção.

**RF-04 — Checkpoints (P0).** Cadastrar nome, ordem, tipo, distância e estado. Aceite: ordem única por evento; distância não negativa e coerente com ordenação quando informada; ponto com registros não é excluído fisicamente.

**RF-05 — Acesso de campo (P0).** Emitir código e senha por checkpoint, com identificação operacional e validade. Aceite: operador só recebe contexto do ponto vinculado; revogação bloqueia próxima requisição e sessão antiga; login exige conexão.

**RF-06 — Teclado (P0).** Entrada apenas de dígitos, apagar, limpar e confirmar. Aceite: `00152` mantém zeros; vazio, letras e número acima de 8 dígitos são rejeitados; Enter/toque duplo não gera duas intenções para a mesma confirmação.

**RF-07 — Captura (P0).** Registrar intenção com UUID e instante congelado ao confirmar. Aceite: servidor retorna ID persistido; falha de gravação local não limpa o campo nem mostra sucesso; origem manual não possui confiança de IA.

**RF-08 — Rede instável (P0).** Persistir fila após sessão online habilitada. Aceite: perder conexão, registrar 100 itens, recarregar e reconectar sincroniza todos uma vez; itens rejeitados ficam visíveis e recuperáveis.

**RF-09 — Idempotência (P0).** UUID repetido com mesmo conteúdo devolve o registro original. Aceite: 20 retries e duas requisições concorrentes resultam em uma passagem; mesmo UUID e conteúdo divergente retorna conflito.

**RF-10 — Painel (P0).** Listar passagens paginadas com filtro por número, checkpoint, período e situação. Aceite: mostrar captura e recebimento separados, atraso de atualização e pendências; consultas não revelam dados de outra organização.

**RF-11 — Revisão (P0).** Admin corrige número/horário ou invalida com motivo obrigatório. Aceite: valor original, autor e data permanecem auditáveis; duas correções concorrentes não sobrescrevem silenciosamente uma à outra.

**RF-12 — Exportação (P0).** Gerar CSV com filtros, fuso indicado, origem e situação. Aceite: reproduzir a consulta autorizada; textos potencialmente interpretados como fórmulas de planilha são neutralizados.

**RF-13 — Auditoria (P0).** Registrar mudança de estado, credenciais emitidas/revogadas, captura e revisão. Aceite: não armazenar senha/token no log; auditoria de escrita confirma na mesma transação da alteração.

**RF-14 — Participantes mínimos (P1).** Cadastrar número único por evento e nome opcional. Aceite: ausência de cadastro não bloqueia captura; número desconhecido sinaliza pendência, sem ser declarado participante irregular automaticamente.

## Não funcionais e metas de ensaio

**RNF-01 — Integridade:** zero perda de registros confirmados pelo servidor no roteiro funcional; retries sem duplicação técnica. Garantia de recuperação do banco depende do plano de backup, não apenas da API.

**RNF-02 — Latência:** feedback local p95 ≤ 200 ms; confirmação da API p95 ≤ 1 s em rede controlada, payload válido, até 20 dispositivos e 20 capturas/s agregadas por 15 minutos. Medir separadamente banco, API e rede; não extrapolar para rede móvel real.

**RNF-03 — Compatibilidade:** testar Chrome Android, Safari iOS e navegador desktop em versões registradas no relatório. Interface utilizável a partir de 360 px; botões de pelo menos 48 px, foco visível, textos de status e contraste legível.

**RNF-04 — Segurança:** autorização em todas as rotas, TLS, senhas com hash apropriado, proteção contra tentativas repetidas e isolamento testado.

**RNF-05 — Operação:** métricas, logs correlacionados, backup e restauração antes do piloto. Metas internas propostas: RPO ≤ 5 minutos e RTO ≤ 60 minutos, condicionadas à infraestrutura e ensaio.

**RNF-06 — Capacidade offline:** ensaio com 1.000 itens por dispositivo e queda de 30 minutos; login inicial e cache da aplicação precisam ocorrer online. Armazenamento local não é backup e pode ser apagado pelo navegador/usuário.

## Atualização de escopo — 22/09/2026

Sprint 04 implementada conforme [registro de execução](sprints/sprint-04-execucao.md). RF-14/B8, cadastro mínimo de participantes (P1), foi adiado para F2 e não está concluído. O MVP manual continua aceitando números sem cadastro. A liberação operacional depende das Sprints 05 e 06.


## Requisitos adicionais planejados — painel da plataforma

O [plano do super admin](38-plano-implantacao-super-admin.md) acrescenta gestão global de organizações e contas, MFA, convites, suspensão e auditoria antes do deploy. Os critérios por etapa SA-01 a SA-06 são a referência de aceite dessa atualização; não representam funcionalidades já implementadas. O isolamento dos organizadores e a integridade dos registros manuais continuam obrigatórios.
