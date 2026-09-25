# Infraestrutura e operação

## Ambientes

Desenvolvimento local, homologação e produção com bancos/segredos distintos. Usar dados sintéticos fora de produção. Hospedagem proposta: frontend estático/PWA, API em container e PostgreSQL gerenciado com backups e recuperação pontual. O usuário escolheu Contabo VPS com Easypanel e fará o deploy. Configuração preparada em [guia de deploy](30-deploy-contabo-easypanel.md); região, capacidade, domínio e operação de backup ainda não foram informados, sem orçamento presumido.

## Pipeline de entrega

Pull request → lint/tipos → testes relevantes → build → revisão → homologação → smoke test → produção. Migrations versionadas, primeiro compatíveis com aplicação atual, depois uso pela nova versão. Backup antes de migração de risco; rollback de aplicação não pressupõe rollback destrutivo do banco.

Configuração esperada: URL do banco, origem pública autorizada, segredo de sessão, configuração de email de recuperação, ambiente, timezone padrão e limites. Manter `.env.example` sem valores reais quando houver código. Segredos em gerenciador apropriado; nenhuma credencial no histórico do repositório.

## Observabilidade

Logs estruturados com `request_id`, organização, evento, ação e código de erro, sem senha/token ou payload pessoal completo. Métricas: latência/erro de ingestão, escritas por ponto, conflitos idempotentes, fila reportada, último heartbeat, falhas de login, conexões e disco do banco.

Alertas propostos: erros 5xx > 1% por 5 minutos com tráfego significativo; indisponibilidade de ingestão; banco sem margem; backup falho; dispositivo sem heartbeat por 2 minutos durante operação. Ausência de heartbeat indica desconhecido/desconectado, sem afirmar perda de capturas.

## Backup e continuidade

Objetivos iniciais RPO ≤ 5 min e RTO ≤ 60 min requerem backup contínuo/PITR e ensaio. Backup diário isolado não satisfaz RPO de 5 min. Manter backup criptografado, acesso restrito e restauração periódica, incluindo integridade de tenant e auditoria. Se o provedor escolhido não atingir metas, revisar o plano antes do piloto.

## Runbook da prova

**Antes:** validar configuração, hora de largada, janelas, credenciais e validade; ensaiar cada aparelho online; carregar cache; verificar relógio, bateria, rede alternativa e armazenamento; testar uma captura de ensaio separada dos dados reais; distribuir responsáveis e contatos.

**Durante:** iniciar evento com horário real; manter app aberto; monitorar contagens e postos; diante de falha, preservar tela/fila e avisar coordenação. Falha local de armazenamento exige contingência em papel/arquivo operacional com número e horário observado; importação posterior é retrospectiva e auditada.

**Após:** encerrar captura; recolher contagens e estado de todos os aparelhos; sincronizar antes de logout; resolver bloqueios/duplicatas; exportar com status; finalizar; recolher/revogar credenciais; limpar dados locais após conciliação.

## Resposta a falhas

- API indisponível: captura local dentro da concessão; responsável técnico investiga; não limpar cache.
- Banco indisponível: API falha claramente, sem sucesso antecipado; após recuperação, reenviar com mesmos UUIDs.
- Aparelho perdido: revogar credencial, registrar lacuna potencial de itens ainda locais, usar reserva.
- Relógio suspeito: marcar itens, trocar dispositivo se necessário, revisar com referência; não aplicar deslocamento em massa sem evidência.
- Atualização defeituosa: reverter aplicação compatível, preservar banco/fila, evitar atualizações de PWA durante prova.

## Responsabilidades e custos

Produto aprova escopo; liderança técnica responde por deploy/backup; coordenação de prova responde pela reconciliação; responsável por dados define acesso/retenção. No piloto, uma pessoa pode acumular funções explicitamente.

Planilhar custo fixo de API/banco/monitoramento e variável de tráfego, armazenamento e suporte por evento. Nas fases de IA, acrescentar GPU/edge, câmeras, upload, mídia, rotulagem e revisão humana. Cotações e preços precisam ser obtidos na escolha de fornecedores.

## Entrega técnica da Sprint 05

Carga, logs/métricas, falha de conexão, rollback e PITR foram ensaiados localmente. Isso não configura backup/PITR externo nem alertas na VPS. Consultar [execução e condições de liberação](sprints/sprint-05-execucao.md).
