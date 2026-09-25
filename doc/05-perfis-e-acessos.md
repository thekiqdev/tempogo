# Perfis, credenciais e permissões

## Admin da organização

Pode administrar seus eventos, checkpoints, credenciais, participantes, passagens, revisões e exportações. Não pode acessar outra organização, mudar registros de auditoria ou transformar a própria sessão em acesso global.

Conta pessoal com email e senha; credenciais não compartilhadas. Provisionamento inicial por procedimento de infraestrutura com segredo temporário e troca obrigatória. Recuperação por token único com validade curta e sem revelar existência do email. MFA deve estar disponível e ser exigido para operadores da plataforma antes de exposição de produção.

## Operador de checkpoint

Código identifica uma credencial vinculada a exatamente um checkpoint; senha autentica. Proposta: código aleatório de 8 caracteres alfanuméricos não sequenciais, único globalmente enquanto existir; senha aleatória de pelo menos 12 caracteres, mostrada uma vez ao admin. A senha não precisa ser numérica: o teclado numérico destina-se ao registro dos números de peito.

Pode consultar contexto mínimo e passagens da própria sessão, registrar e solicitar revisão. Não pode listar participantes completos, editar evento, exportar, corrigir horário, mudar checkpoint ou consultar outros dispositivos. Cada dispositivo pode receber uma credencial própria dentro do mesmo checkpoint; isso melhora atribuição. Credencial compartilhada identifica o acesso, não comprova quem operou fisicamente.

## Sessões propostas

Admin: expiração por inatividade de 30 minutos e duração máxima de 12 horas. Campo: duração máxima de 12 horas, limitada pela validade da credencial e pelo evento. Mostrar aviso de expiração antes do início; eventos mais longos precisam de configuração revisada.

Sessão via cookie Secure/HttpOnly/SameSite, identificador opaco e validação de estado no servidor. Revogar credencial invalida todas as suas sessões na próxima interação online. Troca de senha revoga sessões anteriores. Código e senha nunca aparecem em URL, logs ou CSV.

## Offline e revogação

Somente sessão previamente validada online habilita captura offline. Guardar concessão local com escopo e prazo, sem a senha. O cliente bloqueia captura quando esse prazo expira, mas não pode garantir revogação instantânea sem rede.

Ao reconectar, servidor verifica novamente credencial, evento e sessão. Sessão expirada permite reautenticar e reenviar os mesmos UUIDs preservando proveniência; credencial revogada não permite upload automático. Recuperação por admin importa um pacote local como dados não confiáveis, auditados e sujeitos a revisão; nunca contorna autorização com o token antigo.

## Matriz textual de negação

- Admin A × evento B: negar leitura, criação, revisão e exportação.
- Credencial CP1 × CP2: negar mesmo que pertençam ao mesmo evento.
- Operador × alteração de origem para IA: negar.
- Usuário anônimo × qualquer dado de prova: negar, exceto tela de login.
- Operador da plataforma: acesso técnico excepcional com identidade própria, motivo e auditoria; sem impersonação invisível.

Limitação inicial de login: atraso progressivo após 5 falhas em 15 minutos por credencial/origem, resposta genérica e recuperação administrativa. Ajustar proteção considerando vários dispositivos no mesmo IP, para não bloquear a equipe inteira durante a prova.


## SA-01 — especificação concluída em 23/09/2026

Consultar [regras e arquitetura do super admin](39-super-admin-regras-e-arquitetura.md). Define a atualização antes do deploy; não representa recursos já implementados. Preserva os fluxos existentes e acrescenta isolamento de sessão, MFA e gestão de contas nas etapas SA-02 a SA-06.
