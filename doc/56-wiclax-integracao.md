# TempoGo — integração com Wiclax (aquisição de passagens)

Data: 06/11/2026 (atualizado 10/11/2026). Status: **Sprint 1 multi-porta** — 1 porta por checkpoint com pool no Super Admin; Source mantido; homologação pendente.

## Objetivo

Enviar passagens capturadas nos checkpoints do TempoGo para o Wiclax em tempo quase real, usando a aquisição **Generic / My system**. O Wiclax continua responsável por classificação e resultados; o TempoGo permanece a fonte de captura manual/offline.

## Como o Wiclax se conecta

O campo **IP do leitor** no Wiclax é o endereço do **servidor TCP do TempoGo** (bridge). O Wiclax age como **cliente TCP**:

1. O bridge escuta em `IP:porta` (ex.: `192.168.1.50:3097`).
2. No Wiclax, aquisição Generic/My system → informar esse IP/porta → **Ligar**.
3. O bridge envia linhas de passagem no protocolo genérico documentado pela Wiclax.

Referência: [Generic Acquisition Protocol for Wiclax](https://wiclax.com/documents/Generic-acquisition-protocol-for-Wiclax.pdf) (versão ≥ 8.2).

Formato de cada passagem:

```text
identificador;dd-mm-yyyy hh:mm:ss.ccc;origem;volta;bateria;rewindFlag\r
```

- **identificador:** chip do peito quando existir; senão o número de peito.
- **origem:** nome do checkpoint (deve coincidir com a coluna Source no Wiclax, se usada).
- **rewindFlag:** `0` ao vivo; `1` em resposta a `REWIND`.

Comandos que o Wiclax pode enviar: `CLOCK`, `CLOCK <datahora>`, `STARTREAD`, `STOPREAD`, `REWIND <de> <até>`.

## Escopo e fora de escopo

**Inclui (etapas WX):**

- Bridge TCP local/rede, protocolo genérico, envio ao vivo e rewind básico.
- Seleção de um evento por execução do bridge.
- Mapeamento peito/chip e nome do checkpoint → origem.
- Documentação operacional e testes do formatador/protocolo.

**Não inclui nesta entrega:**

- UI no painel para configurar o bridge.
- Empurrar resultados/classificação do Wiclax de volta ao TempoGo.
- Cloud Passages da Wiclax, exportadores XML customizados oficiais, multi-evento simultâneo no mesmo processo.
- Exposição pública na internet sem túnel/VPN (o bridge é para LAN do dia da prova).

## Etapas

### WX-01 — MVP: bridge TCP e envio ao vivo

**Entrega:** processo `npm run wiclax:bridge` que abre o servidor TCP, responde aos comandos básicos e envia passagens novas do evento configurado.

Tarefas:

- [x] Documentar plano e protocolo neste arquivo.
- [x] Formatador da linha genérica (timezone do evento, chip ou peito, origem = checkpoint).
- [x] Servidor TCP com CLOCK / STARTREAD / STOPREAD / REWIND.
- [x] Polling das observações não invalidadas do evento; envio aos clientes conectados após STARTREAD.
- [x] CLI com variáveis de ambiente e script npm.
- [x] Testes unitários do protocolo/formatador.
- [ ] Homologação manual: Wiclax na mesma rede, Ligar → Começar a leitura → registrar peito no TempoGo → ver passagem no Wiclax.

**Aceite:** com bridge no ar e Wiclax conectado, uma passagem aceita no evento aparece no destino configurado sem importação de arquivo.

**Uso rápido:**

```env
DATABASE_URL=postgresql://...
WICLAX_EVENT_ID=<uuid-do-evento>
WICLAX_BRIDGE_HOST=0.0.0.0
WICLAX_BRIDGE_PORT=3097
```

```bash
npm run wiclax:bridge
```

No Wiclax: IP da máquina do bridge, porta `3097`, Ligar, Começar a leitura. Destinos com Source igual ao nome do checkpoint (ou um único destino sem Source).

### WX-02 — Operação de prova

**Entrega:** runbook do dia (rede, firewall, reinício, falha de link) e opção de reenvio desde um horário (já coberto em parte pelo REWIND).

Tarefas:

- [ ] Checklist de rede (mesma subnet, porta liberada, IP fixo do notebook do bridge).
- [ ] Comportamento claro se o Wiclax desconectar/reconectar (retomar sem duplicar no bridge; Wiclax trata destino).
- [ ] Log operacional sem peitos em massa desnecessários; contadores de enviados/erros.
- [ ] Ensaio com volume típico de um evento curto.

**Aceite:** operador consegue subir o bridge e conectar o Wiclax em &lt; 10 minutos com o checklist.

### WX-03 / WX-04 — (superseded) painel por checkpoint

Substituído pelo modelo P1 abaixo (1 porta + Source).

### Sprint 1 — Pool de portas + 1 porta por checkpoint

**Entrega:** bridge TCP por **checkpoint**; porta escolhida automaticamente no pool do Super Admin; Source continua na linha.

Tarefas:

- [x] API `GET/POST .../checkpoints/:id/wiclax`.
- [x] Bridge filtra por `checkpoint_id`; Source = nome do checkpoint.
- [x] Pool em Super Admin → Configurações → Portas Wiclax (padrão `3097-3116`).
- [x] Seleção automática da próxima porta livre; libera ao desconectar.
- [x] UI Integrações na tela de Acessos do checkpoint.
- [ ] Publicar as portas do pool no Easypanel (manual).
- [ ] Sprint 2: persistir ocupação após restart + homologação.

**Aceite:** conectar 2+ checkpoints; cada um recebe porta distinta; Wiclax com uma aquisição My system por porta.

**Uso:** Checkpoint → Acessos → Integrações → Conectar → copiar IP/porta → no Wiclax Ligar + Começar a leitura.

**Checklist Easypanel (manual):**

1. No serviço da **API**, criar portas TCP `3097`…`3116` (Publicado = Alvo).
2. Definir `WICLAX_ADVERTISE_IP=13.140.182.124` (IP público da VPS).
3. No Super Admin → Configurações, confirmar pool `3097-3116` e salvar.
4. Redeploy da API após a migration `019_wiclax_port_pool`.

CLI: `WICLAX_CHECKPOINT_ID` + `npm run wiclax:bridge`.

## Decisões

| Tema | Decisão atual |
| --- | --- |
| Papel de rede | TempoGo = servidor TCP; Wiclax = cliente |
| Escopo | Um bridge por checkpoint |
| Porta | Automática a partir do pool do Super Admin |
| Source | Mantido (nome do checkpoint) |
| Identificador | Chip se cadastrado; senão peito |
| Gatilho de envio | Após `STARTREAD` |
| IP em destaque | `WICLAX_ADVERTISE_IP` (IP da VPS em produção) |
| Abrir portas no Easypanel | Manual (app só faz `listen`) |

## Riscos

- Nome do checkpoint diferente da Source no Wiclax → passagem cai no destino errado ou fica sem destino.
- Relógio/timezone divergente → tempos deslocados; usar timezone do evento.
- Bridge reiniciado sem REWIND → Wiclax pode perder janela; usar Retroceder no Wiclax.
- Expor a porta na internet → risco; manter na rede da prova.

## Dependências

- Evento existente com checkpoints nomeados de forma estável.
- PostgreSQL acessível pelo bridge (`DATABASE_URL` ou `MIGRATION_DATABASE_URL`).
- Wiclax Pro com aquisição Generic/My system na mesma rede.
