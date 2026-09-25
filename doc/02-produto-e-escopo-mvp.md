# Produto e escopo do MVP

## Objetivo

Permitir que um organizador configure uma prova e acompanhe passagens digitadas em vários checkpoints, com acesso restrito, rastreabilidade e recuperação de falhas de rede. Validar a operação antes de investir em automação por câmera.

## Usuários

- Admin da organização: configura eventos e checkpoints, emite credenciais, acompanha passagens, revisa erros e exporta dados.
- Operador de checkpoint: entra com código e senha, digita o número de peito e confirma o registro.
- Operador da plataforma: provisiona organizações e admins por processo restrito; não precisa de painel comercial no MVP.
- Atleta e público: consumidores futuros, sem login ou portal nesta fase.

## Confirmado pelo solicitante

Estrutura do sistema, acesso admin, cadastro de eventos, checkpoints, registros manuais e acesso por código/senha em cada checkpoint, liberando teclado numérico. Primeira fase sem IA. Planejamento da evolução completa.

## Escopo proposto para entregar uma operação utilizável

- Isolamento por organização, ainda que o piloto tenha apenas uma.
- Eventos com nome, data, fuso, local, estado e horário real de largada.
- Uma modalidade por evento e percurso sem voltas no MVP. Eventos com múltiplas distâncias ficam para F2.
- Checkpoints ordenados, tipo largada/intermediário/chegada, distância acumulada opcional e credenciais revogáveis.
- Registro manual de número, instante de confirmação, origem, dispositivo, sessão e horário de recebimento.
- Teclado de toque e teclado físico, feedback de persistência e consulta das passagens recentes da própria sessão.
- Fila local persistente para interrupções de conexão após login online. Reconciliação explícita dos casos problemáticos.
- Admin consulta, filtra, corrige e invalida registros com justificativa e histórico preservado.
- Exportação CSV de passagens com horários e situação de revisão; painel com contagens e pendências.
- Cadastro mínimo de participantes opcional: número e nome de exibição. Número não cadastrado continua sendo capturável, marcado para revisão. Importação em lote fica em F2.
- Preparação do núcleo para fontes futuras, sem implementar IA ou sua infraestrutura.

## Fora do MVP

Vídeo, OCR, reconhecimento facial, tracking, GPU, fotos, replay, cobrança, aplicativo nativo, portal do atleta, APIs públicas, WhatsApp, ranking oficial, múltiplas voltas, múltiplas modalidades e regras de federação. Não prometer cronometragem homologada ou precisão de chegada esportiva a partir de digitação.

## Meta do piloto — hipótese de dimensionamento

Uma prova de até 1.000 participantes, até 10 checkpoints e até 20 dispositivos simultâneos. Isso dimensiona os testes iniciais e não constitui limite comercial validado. Dados de uma corrida real devem revisar esses números.

Critérios de sucesso: concluir configuração sem intervenção técnica; registrar e reconciliar todas as entradas do roteiro de ensaio; não perder entradas confirmadas localmente no teste de reconexão; não criar duplicatas por retry; impedir acesso cruzado; exportar e auditar correções. Medir tempo de digitação e omissões em campo antes de fixar meta de produtividade.

## Definition of Done do MVP

Todos os requisitos P0 aceitos, cenários críticos executados, restauração demonstrada, manual operacional ensaiado, pendências de segurança críticas resolvidas e piloto aprovado pelo responsável operacional. A implementação do login e do teclado isoladamente não caracteriza MVP concluído.
