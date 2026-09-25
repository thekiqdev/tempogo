# Jornadas e interface

## Admin: preparar e operar

1. Entrar → lista de eventos da organização → criar evento.
2. Informar nome, data/fuso, local e modalidade única.
3. Criar checkpoints ordenados; definir largada/intermediários/chegada e distância quando conhecida.
4. Emitir credencial de cada posto/dispositivo e entregar código e senha por canal operacional combinado.
5. Realizar ensaio em ambiente ou evento de teste claramente identificado.
6. Passar a pronto; conferir dispositivos; iniciar com horário real.
7. Acompanhar passagens, dispositivos vistos recentemente e pendências.
8. Encerrar captura → reconciliar filas → revisar → exportar → finalizar.

Telas: login/recuperação; lista de eventos; edição e estados; checkpoints; emissão/revogação de acessos; painel; lista e detalhe de passagens; revisão com antes/depois/motivo; exportação; auditoria. Admin deve sempre visualizar organização e evento ativos.

## Operador: registro rápido

1. Abrir `/checkpoint`; inserir código e senha com teclado normal.
2. Ver evento, checkpoint, dispositivo, validade, estado de rede e relógio.
3. Com evento em execução, abrir teclado numérico.
4. Digitar número → conferir visor → tocar **Registrar** ou Enter.
5. Persistir localmente UUID, número e tempo; só então limpar visor.
6. Mostrar **Salvo neste aparelho — aguardando envio** ou **Confirmado no servidor**; som/vibração opcionais e nunca únicos sinais.
7. Manter foco para próximo número. Histórico recente informa número, horário e situação.

```text
Prova Parque • CP 2 — km 5
Conectado | 0 pendentes | relógio verificado

                 00152
             [1] [2] [3]
             [4] [5] [6]
             [7] [8] [9]
           [Limpar] [0] [Apagar]
                [Registrar]

00151 • 08:14:42 • Confirmado no servidor
00150 • 08:14:40 • Precisa de revisão
```

## Estados obrigatórios da tela

- Sem rede: faixa persistente, contagem da fila, captura habilitada apenas com concessão válida.
- Sincronizando: progresso por item; não travar digitação por uma requisição em andamento.
- Sessão expirada: preservar fila, solicitar entrada novamente, impedir novas capturas fora da concessão.
- Acesso revogado: bloquear envio, preservar pendentes e orientar conciliação com admin.
- Evento encerrado: bloquear novas intenções; informar situação dos itens antigos.
- Armazenamento indisponível/cheio: erro explícito, não limpar número, orientar contingência.
- Duplicata suspeita: aviso no histórico sem apagar registro ou interromper próximo atleta.
- Número incorreto: solicitar revisão; sem botão que apague silenciosamente uma passagem já salva.

## Cuidados de campo

Alto contraste, botões grandes, operação com uma mão, sem zoom obrigatório e sem modais a cada registro. Rótulos acessíveis e foco previsível. Prevenir double tap criando intenção única até concluir a persistência local; não bloquear digitação enquanto espera rede. Não depender de sincronização em segundo plano ou de tela bloqueada.

No logout com itens pendentes, alertar, oferecer sincronização ou pacote de recuperação. Se usuário encerrar sessão, manter fila isolada da próxima credencial; não enviar nem revelar dados ao operador seguinte. Limpeza do navegador pode perder fila: incluir essa limitação no treinamento.
