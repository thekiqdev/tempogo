# Voltas, agrupamento e chips

## Etapas
1. Adicionar total de voltas (padrão 1) e cadastro de chips por evento, com isolamento organizacional.
2. Ampliar agrupamento para 10 segundos inclusivos desde a primeira captura; numerar os grupos válidos por peito/checkpoint, em ordem do horário efetivo. Avanço de volta respeita um intervalo mínimo configurável, obrigatório na interface quando houver múltiplas voltas. Capturas entre 10 segundos e esse intervalo permanecem na mesma volta, sinalizadas como antecipadas. Capturas invalidadas não consomem volta. Revisões e envios atrasados recalculam a sequência.
3. Importar CSV, XML ou XLSX com peito e chip, prévia e validação. Preservar zeros à esquerda e chip alfanumérico. Limites: 2 MB e 10.000 linhas. Rejeitar duplicidade de peito ou chip e conflitos com outro peito no evento. Importar de forma atômica; nenhum resultado parcial.
4. Cadastro em quatro etapas: identificação (inclui voltas), data/local, importar chips (opcional), conferência. Salvar evento e chips na mesma transação.
5. Importação posterior em configurações, permitida até a finalização. Atualizar os peitos enviados sem excluir outros vínculos. Exibir chip e volta nas passagens. CSV detalhado inclui ambos; TXT usa chip quando vinculado e mantém número de peito como alternativa.
6. Testar migração, API, importação, limites de agrupamento, reordenação, revisão e fluxo mobile.

## Regras operacionais
- Total de voltas entre 1 e 999. Eventos existentes permanecem com uma volta.
- Volta é a sequência de passagens válidas no mesmo checkpoint, não a sequência global entre diferentes checkpoints.
- Grupo com horários de 0, 8 e 16 segundos produz duas passagens: a janela começa em 0 e não se estende a cada observação.
- Nenhuma captura é apagada por ultrapassar o total de voltas. Exibir aviso de excedente, sem invalidar automaticamente.
- Revisões do peito também atualizam o chip apresentado. Importar depois associa os registros anteriores por peito; os originais permanecem imutáveis.
- CSV/XLSX padrão: NUMERO (peito) e CHIP (identificador). Sem inversão automática. A seleção de colunas permite corrigir arquivos com cabeçalhos trocados. XML: <participantes><participante><numero_peito>001</numero_peito><chip>ABC123</chip></participante></participantes>.
- XML com DTD/entidades é rejeitado. Não executar conteúdo de arquivos.
- Agrupamento de 10 segundos se aplica também aos registros existentes; não altera horários originais, mas pode reduzir a quantidade consolidada.

## Implantação
- Aplicar a migration 017_event_laps_chips.sql antes de iniciar a nova API (`npm run migrate`).
- Publicar backend e frontend da mesma versão.
- No cadastro, o intervalo é informado em segundos (mínimo 11, máximo 86.400). Eventos anteriores recebem 1 volta e intervalo técnico de 60 segundos.
- XLSX: ler a primeira planilha, com identificadores armazenados como texto.
