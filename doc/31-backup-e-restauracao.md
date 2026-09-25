# Backup, PITR e restauração

## Ensaio executado

Em 22/09/2026, o script tests/operations/pitr-drill.mjs criou dois PostgreSQL isolados, sem portas publicadas e sem rede externa. Aplicou o esquema real do projeto, gerou dados sintéticos e executou pg_basebackup com WAL.

O backup físico foi empacotado e cifrado com AES-256-GCM. A restauração leu e decifrou esse arquivo; adulteração foi rejeitada. O WAL recuperou uma transação posterior ao backup e excluiu outra posterior ao instante alvo.

Resultado: 1.000 passagens, 1.000 entradas de auditoria, uma revisão e 12 tabelas com FORCE RLS preservadas. Hashes dos dados conferidos antes/depois. Consulta sem contexto de organização retornou zero passagens. Backup em 1,13 s; restauração e verificação em 5,80 s; diferença entre marcadores de falha/recuperação controlados de 1,566 s.

Esses números valem apenas para esse ensaio local pequeno. Não demonstram RPO/RTO da VPS nem cobertura contra perda do host. Artefatos em tmp/sprint-05/pitr-ea4a5fc7/result.json. Containers ficaram parados e volumes isolados preservados para inspeção.

## Executar novamente

```powershell
node tests/operations/pitr-drill.mjs
```

O script usa a imagem postgres:18.6-bookworm, cria nomes únicos cc-pitr-*, aplica migrations e gera somente dados sintéticos. Não para, apaga ou restaura por cima dos bancos da aplicação. A chave de demonstração fica junto do backup apenas para reprodução local; essa disposição não é aprovada para produção. A pasta tmp é ignorada pelo Git.

## Requisitos na Contabo

Meta ainda proposta: RPO ≤ 5 min e RTO ≤ 60 min. A comprovação depende do volume e da VPS efetivos.

- Backup base periódico consistente e cadeia WAL contínua.
- Destino externo à VPS, com transporte protegido, criptografia e credenciais restritas.
- Chave de decifragem sob custódia separada do backup; testar obtenção da chave no incidente.
- archive_command deve retornar sucesso somente depois de armazenamento confirmado. Não aceitar scripts que retornem sucesso apesar de falha.
- Monitorar atraso/erro de arquivamento, idade do último backup, disco/WAL, espaço no destino e falha do agendamento.
- Agendar archive_timeout compatível com a meta, considerando tempo de envio e detecção. O ensaio usa 60 s com arquivo local; o destino remoto exige medição.
- Definir retenção do backup base e de todos os WAL necessários antes de qualquer expurgo.
- Testar perda da VPS e restauração em outra máquina, com schema, passagens, auditoria, revisões e isolamento conferidos.

PITR exige backup base e sequência de WAL suficiente; pg_dump sozinho não fornece essa cadeia. [PostgreSQL 18 — Continuous Archiving and PITR](https://www.postgresql.org/docs/18/continuous-archiving.html).

Nenhum bucket, backup externo, cron de produção ou política definitiva de retenção foi configurado nesta execução. Faltam o destino, credenciais pelo canal seguro, responsável e aprovação dos prazos de dados.

## Procedimento de incidente

1. Registrar hora e última captura confirmada; suspender finalização e preservar filas dos aparelhos.
2. Criar ambiente isolado de recuperação, sem conectar usuários.
3. Selecionar backup e instante alvo; conferir continuidade do WAL e disponibilidade da chave.
4. Restaurar com a mesma versão major do PostgreSQL. Não iniciar duas instâncias escrevendo no mesmo diretório.
5. Conferir integridade, contagens, hashes, constraints, RLS e permissões. Comparar UUIDs de capturas recuperadas com exportações dos aparelhos.
6. Registrar dados possivelmente perdidos e RPO/RTO medidos. Reaplicar decisões de retenção/remoção necessárias após restore.
7. Somente depois da conferência, trocar a conexão da API, verificar autenticação e sincronizar filas com os mesmos UUIDs.
8. Coordenador resolve revisões e concilia aparelhos antes de finalizar.

Responsável técnico, destino externo, periodicidade, retenção e autorização de retorno ainda precisam ser preenchidos para a prova.
