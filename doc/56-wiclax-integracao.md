# TempoGo — integração com Wiclax (aquisição de passagens)

Data: 06/11/2026 (atualizado 09/11/2026). Status: **P1 produção** entregue — 1 porta por evento + Source por checkpoint; WX-02/P3 homologação pendente.

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

### P1 — Produção: 1 porta por evento + Source

**Entrega:** um bridge TCP por **evento**; todas as passagens dos checkpoints usam Source = nome do ponto. UI em Configuração → **Integrações**.

Tarefas:

- [x] API `GET/POST .../events/:id/wiclax`.
- [x] Bridge filtra por `event_id`; Source = nome do checkpoint.
- [x] Sanfona Integrações no evento com lista de Sources.
- [x] `WICLAX_ADVERTISE_IP` para destacar o IP público da VPS.
- [ ] P2: publicar TCP na VPS + checklist firewall.
- [ ] P3: homologação com Wiclax e celular 4G.

**Aceite:** uma aquisição no Wiclax; destinos mapeados por Source; N checkpoints sem N portas.

**Uso:** Evento → Configuração → Integrações → Conectar → copiar IP/porta → no Wiclax Ligar + Começar a leitura → mapear Source.

**Produção (P2):**

```env
WICLAX_ADVERTISE_IP=13.140.182.124
# Publicar a porta TCP do bridge (ex. 3097) no Docker/Easypanel + firewall
```

CLI: `WICLAX_EVENT_ID` + `npm run wiclax:bridge`.

## Decisões

| Tema | Decisão atual |
| --- | --- |
| Papel de rede | TempoGo = servidor TCP; Wiclax = cliente |
| Escopo | Um bridge por evento; Source diferencia checkpoint |
| Porta | Uma por evento (padrão 3097) |
| Identificador | Chip se cadastrado; senão peito |
| Origem (Source) | Nome do checkpoint |
| Gatilho de envio | Após `STARTREAD` |
| IP em destaque | `WICLAX_ADVERTISE_IP` (IP da VPS em produção) |

## Riscos

- Nome do checkpoint diferente da Source no Wiclax → passagem cai no destino errado ou fica sem destino.
- Relógio/timezone divergente → tempos deslocados; usar timezone do evento.
- Bridge reiniciado sem REWIND → Wiclax pode perder janela; usar Retroceder no Wiclax.
- Expor a porta na internet → risco; manter na rede da prova.

## Dependências

- Evento existente com checkpoints nomeados de forma estável.
- PostgreSQL acessível pelo bridge (`DATABASE_URL` ou `MIGRATION_DATABASE_URL`).
- Wiclax Pro com aquisição Generic/My system na mesma rede.
