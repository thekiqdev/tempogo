# Primeira entrega mobile — execução e evidências

Data: 23/09/2026. Status: implementada e validada tecnicamente em homologação local; piloto em aparelhos físicos pendente.

Referências: [UX mobile](33-ux-mobile-experiencia-app.md) e [etapas de implantação](34-etapas-implantacao-mobile.md).

## Entrega implementada

- Capturar, Registros e Aparelho com navegação inferior por fragmentos sob `/checkpoint`, preservando o fallback offline existente.
- Captura dedicada com visor, teclado numérico próprio, alternativa de teclado do aparelho e suporte a teclado físico.
- Registrar indisponível com visor vazio; entrada numérica até 8 dígitos; zeros à esquerda preservados.
- Mensagem por número distinguindo persistência local de confirmação do servidor; proteção de gravação e UUID mantidos.
- Registros com filtros Todos/Pendentes/Atenção, detalhe e pedido de revisão; combinação de itens locais/remotos por identidade da intenção.
- Aparelho com contexto completo, acesso, preparação offline, relógio, sincronização, exportação e saída.
- Confirmação explícita de que o pacote foi guardado antes de trocar acesso; nova captura invalida a confirmação de exportação anterior.
- Mostrar/ocultar senha no acesso de campo e orientação explícita sobre pedidos de revisão sem conexão.
- Mesma instância de captura/sincronização durante a troca de destinos; conteúdo das telas permanece montado. Não houve alteração do schema do IndexedDB ou das APIs.

## Relação com as etapas

**Etapa 1:** o protótipo foi concretizado como interface funcional em homologação, com inspeção de screenshots e testes de navegação. Não foi realizado estudo com usuários; cadastro guiado e protótipo administrativo continuam para a próxima entrega.

**Etapa 2:** estrutura visual e navegação do operador implementadas, incluindo retorno pelo histórico do navegador e posição por destino. Não foi criado mecanismo de ativação por grupo; a separação desta entrega ocorre pelo escopo de campo, mantendo a administração existente. Uma liberação gradual em produção ainda precisa definir seu mecanismo operacional.

**Etapa 3:** captura dedicada implementada e verificada tecnicamente.

**Etapa 4:** fluxo de campo, preparação, registros, revisão e recuperação implementados; testes integrados concluídos. O critério de piloto com pessoas/aparelhos físicos permanece aberto. Não considerar estas etapas integralmente aceitas apenas pela aprovação dos testes automatizados.

## Verificações executadas

- `npm run check`: lint, tipos, 9 testes unitários e build aprovados durante a implementação.
- Builds posteriores do frontend: aprovados após ajustes de layout.
- `tests/e2e/sprint-02.mjs`, com base HTTPS local: captura real, zeros, double click, falha de armazenamento, resposta perdida após commit, reload/retry e revogação. Última execução: feedback local observado em 33 ms; medição de uma execução, não garantia de desempenho.
- A mesma suíte verifica 320, 360, 390 e 430 CSS px por 640 px: sem overflow horizontal, botão e área de confirmação acima da navegação; valor digitado preservado ao trocar destinos e usar Voltar.
- `tests/e2e/sprint-03.mjs`: 100 registros offline, reload, retomada, envio e recuperação administrativa após revogação. 100 IDs remotos únicos, payloads preservados, nenhuma tentativa de upload após detecção da revogação, nenhum erro JavaScript. Ensaio offline de aproximadamente 4 segundos; não foi um novo ensaio de 30 minutos.
- `tests/e2e/sprint-04.mjs`: pedido de revisão pela nova tela integrado a revisão administrativa, exportação e conciliação; aprovado, sem erros JavaScript reportados.
- Navegador automatizado: Microsoft Edge/Chromium no Windows. Emulação de viewport não comprova teclado/instalação de Safari ou Android real.

A repetição dos testes atingiu o limite temporário da recuperação de senha da conta sintética A. A validação posterior utilizou a conta sintética B documentada para homologação. Limites de autenticação não foram alterados. Um teste offline também teve uma falha de localização do acesso administrativo; nova execução com verificação explícita do código concluiu a jornada. As falhas de geometria encontradas no layout foram corrigidas e a suíte passou novamente.

## Arquivos de implementação

- [field.tsx](../apps/web/src/field.tsx): navegação, captura e áreas de campo; sincronização permanece independente da seleção de tela.
- [style.css](../apps/web/src/style.css): estrutura visual do operador e regras compactas.
- [review-request.tsx](../apps/web/src/review-request.tsx): formulário controlado e indicação de conexão.
- Testes atualizados: [captura](../tests/e2e/sprint-02.mjs), [offline](../tests/e2e/sprint-03.mjs) e [gestão](../tests/e2e/sprint-04.mjs).

## Evidências locais

Arquivos gerados em `tmp`, não destinados a versionamento:

- [Captura em 360 px](../tmp/sprint-02/homolog/keypad-360.png).
- [Aparelho](../tmp/sprint-02/homolog/device-mobile.png).
- [Resultado de captura](../tmp/sprint-02/homolog/result.json).
- [Resultado offline](../tmp/sprint-03/homolog/result.json).
- [Resultado de gestão](../tmp/sprint-04/homolog/result.json).

Os testes criam eventos e registros sintéticos e redefinem a senha das contas de teste. Não executá-los contra produção.

## Ambiente e próximos critérios

Frontend compilado disponível na [homologação local](https://localhost:5443/checkpoint). A API e o banco de homologação existentes foram usados; não houve publicação em servidor externo. A última versão foi copiada para o container web local; uma recriação desse container deve usar build atualizado para manter os ajustes finais.

Antes de liberar em uma prova real:

- [ ] Validar Safari/iPhone e Chrome/Android físicos, teclado, retomada, download do pacote e instalação.
- [ ] Executar o piloto com operadores e organizadores definido no documento 33.
- [ ] Verificar leitor de tela, zoom de texto, contraste medido e uso sob condições reais de campo.
- [ ] Confirmar estratégia de ativação gradual e retorno de versão, preservando filas.
- [ ] Realizar ensaio prolongado offline e atualização de versão com pendências nos aparelhos-alvo.

A implantação administrativa (cadastro de evento, checkpoints e gestão redesenhados) pertence às etapas seguintes. A entrega atual preserva o painel administrativo existente.
