# Operação offline e recuperação — Sprint 03

Implementação para interrupções de rede após preparação online. Continua sem IA e sem resultado oficial de cronometragem.

## Preparar o aparelho

1. Use a versão compilada em https://localhost:5443/checkpoint no ambiente local de homologação. Em um ambiente publicado, use seu endereço HTTPS.
2. Entre com código e senha do aparelho. O checkpoint precisa estar ativo e a corrida em andamento.
3. Clique em **Preparar aparelho** e aguarde a confirmação. A preparação guarda a aplicação, mede o relógio e recebe uma concessão vinculada à sessão, ao checkpoint e à janela de captura.
4. Confira a validade exibida. A concessão dura no máximo duas horas e nunca ultrapassa a validade da sessão/credencial. Enquanto conectado, a referência é renovada aproximadamente a cada minuto.
5. Antes da operação real, faça um registro de demonstração, interrompa a rede, recarregue e confira o retorno da tela e da fila.

O servidor de desenvolvimento com Vite/HMR, em http://127.0.0.1:5173, continua disponível para desenvolvimento online. Ele não é um pacote estável para cache offline; a preparação orienta usar a versão compilada.

O HTTPS local usa certificado autoassinado. O Windows não foi configurado para confiar nele. Dependendo do navegador, aceitar o aviso da página não basta para registrar o service worker. Os testes usam um perfil descartável de navegador com exceção para o ambiente local. Para aparelhos de campo, é necessário publicar em HTTPS com certificado confiável; isso permanece parte da preparação operacional das próximas sprints.

## Durante uma interrupção

A captura continua dentro da concessão local válida. Cada intenção recebe UUID e horário congelados, e só limpa o visor após concluir a gravação IndexedDB. O app separa **salvo no aparelho**, **enviando**, **confirmado no servidor** e **requer atenção**.

Ao recarregar, a aplicação preparada abre pelo cache e restaura o contexto local sem senha, cookie ou token CSRF armazenado nesse contexto. Primeiro login offline não é permitido.

Na reconexão, o aplicativo consulta a sessão antes de enviar qualquer registro. O reenvio automático mantém o payload original e utiliza backoff com jitter, limitado a 30 segundos. Os intervalos usam relógio monotônico. Cada resposta confirma somente o item correspondente; a falha de um registro não apaga os demais.

Uma intenção em envio no momento da interrupção volta a pendente. O UUID garante que uma resposta perdida depois do commit não crie outra passagem no retry. As abas do mesmo acesso coordenam o envio usando Web Locks quando disponível; a idempotência no servidor permanece obrigatória.

A lista mostra até 100 pendentes recentes e 100 recebimentos. A contagem e a exportação abrangem todos os itens da fila atual. Os confirmados continuam no aparelho; não há limpeza automática destrutiva nesta sprint.

## Validade, sessão e encerramento

- Concessão expirada: bloqueia captura nova; conserva a fila. Reconecte para renovar o mesmo acesso ou preparar novamente.
- Sessão expirada com credencial válida: **Renovar acesso**, usando o mesmo código/senha, permite enviar intenções das sessões anteriores da mesma credencial. UUID e sessão original da captura são preservados.
- Credencial revogada: o envio normal é recusado. O aplicativo preserva a fila e oferece exportação. Um bloqueio já comunicado pelo servidor também fica registrado no contexto local.
- Outra credencial não assume a fila anterior. Ao tentar trocar com pendências conhecidas, o app mantém o contexto anterior para exportação. Depois de guardar o pacote, a ação explícita de trocar acesso limpa apenas a preparação ativa, sem apagar as intenções.
- Evento fechado: o servidor pode receber itens, obrigatoriamente em revisão. Horário do cliente não comprova que a captura ocorreu antes do encerramento.
- Janela anterior após reabertura: seus uploads permanecem sinalizados para revisão.
- Finalizado/arquivado: recusados no envio e na recuperação. A futura reabertura auditada será integrada à gestão da Sprint 04; não há edição direta de banco como procedimento de operação.

Revogação instantânea sem comunicação não é possível: um aparelho desconectado pode continuar salvando dentro da concessão ainda conhecida. Ao reconectar, não envia automaticamente com acesso revogado.

## Relógio e qualidade temporal

São conservados o horário bruto, offset, RTT, momento da medição, indicação de incerteza, horário estimado e recebimento no servidor. Três consultas de tempo são feitas na preparação; usa-se a amostra de menor RTT.

Referência com mais de cinco minutos, RTT acima de um segundo, salto superior a um segundo, reinício offline ou instante implausível produzem horário incerto. O servidor também impõe critérios próprios de revisão. Não se recalcula uma intenção antiga usando uma referência nova.

No navegador, a concessão usa tempo monotônico quando a referência pertence à página atual. Após reinício, usa a estimativa disponível e rejeita regressão anterior à preparação. Isso não transforma o relógio local em prova de autorização nem promete precisão esportiva. Suspensão do aparelho e comportamento dos navegadores precisam de validação nos dispositivos reais.

## Recuperação administrativa

1. No aparelho, clique em **Exportar recuperação**. O JSON contém versão, escopo, intenções e SHA-256 de cada payload, sem senha, token ou cookie. A fila permanece armazenada.
2. Entregue o arquivo ao responsável autorizado pelo evento. Não publique esse pacote em canais abertos.
3. No admin, abra **Recuperação**, selecione o arquivo e informe uma justificativa de pelo menos dez caracteres.
4. Clique em **Importar para revisão**. A importação usa a autorização do admin e não reativa a credencial original.
5. Acompanhe a quantidade recebida. A interface envia lotes de até 100 itens, cada lote atômico. Se um lote posterior falhar, os anteriores permanecem confirmados e o mesmo pacote pode ser repetido com segurança.
6. A aba **Passagens** indica os itens em revisão. A análise, correção e conciliação consolidadas serão entregues na Sprint 04.

O hash detecta alterações, mas não autentica a verdade do pacote. Sessão, evento, checkpoint e organização precisam existir e corresponder ao escopo autorizado. Nenhuma importação recebe status de resultado oficial.

## Comunicação e contingência

A aba **Recuperação** também mostra a última comunicação e as contagens informadas por cada acesso: pendentes, em envio, confirmados e bloqueados. Após dois minutos sem heartbeat, a situação é **desconhecida**. Ausência de comunicação não significa fila vazia.

Se o armazenamento falhar, o número permanece no visor e não deve ser considerado registrado. Não apague os dados do navegador para “corrigir” a fila. Use a contingência operacional definida pela organização e preserve o aparelho para recuperação.

A PWA não promete sincronização com tela fechada, recuperação de armazenamento apagado, login inicial offline ou proteção contra remoção de dados pelo sistema. Mantenha a tela aberta ao reconectar. A validação em telefone físico e o procedimento de contingência da corrida fazem parte das Sprints 05/06.

## Referências técnicas

- [MDN — Service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers): cache do shell e ciclo de atualização. A implementação não usa skipWaiting para forçar uma nova versão sobre clientes abertos.
- [MDN — performance.now](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now): relógio monotônico e limitações durante suspensão.
- [Playwright — Clock](https://playwright.dev/docs/clock): testes controlados de mudança de relógio; o ensaio prolongado usa tempo real, não avanço artificial.
