# Segurança e governança de dados

Plano técnico inicial. Obrigações contratuais e de privacidade serão definidas com os responsáveis antes do piloto; este documento não afirma conformidade jurídica.

## Ameaças prioritárias

- Tentativa de adivinhar código/senha: credenciais aleatórias, hash de senha, limitação de tentativas, validade e revogação.
- Troca de ID para consultar outra prova/organização: autorização por recurso, FKs coerentes, RLS e testes negativos.
- Dispositivo perdido: sessão limitada, revogação, dados mínimos no navegador e procedimento de conciliação.
- Retry, replay e escrita concorrente: idempotência, transações e controle de versão.
- Horário falsificado ou digitação errada: origem explícita, verificação de plausibilidade e revisão.
- XSS/CSRF: escapar conteúdo, política de conteúdo, evitar HTML arbitrário, cookies protegidos e defesa CSRF.
- Exportação maliciosa: sanitização de fórmulas em CSV e autorização dos filtros.
- Logs ou backups expostos: acesso restrito, criptografia fornecida pela infraestrutura e remoção de segredos dos logs.

## Controles do MVP

TLS em todo tráfego; senhas com Argon2id ou equivalente validado pela implementação; nunca hash rápido simples. Biblioteca de autenticação mantida, comparação segura, sessões opacas revogáveis e segredo fora do repositório. Não desenvolver criptografia própria. Mensagens de login/recuperação devem evitar enumeração. A orientação de autenticação considera [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

Admin e operador usam permissões distintas. Limitar credenciais às janelas necessárias e não guardar senha para permitir consulta posterior. Rotação em caso de vazamento. Acesso a produção e backup separado do acesso de uso diário; MFA para operação da plataforma.

## Inventário e minimização

MVP: email do admin, nome operacional, número de peito, nome opcional do participante, passagens, horários, identificadores de sessão/dispositivo e logs técnicos. Evitar CPF, endereço, biometria e dados de saúde, pois não são necessários ao fluxo definido.

Antes do piloto, nomear responsável por dados, definir quem decide finalidade e quem executa tratamento, aviso aos participantes, canal de solicitações, acesso de equipe, regras para menores, fornecedores e eventual publicação. Essas definições são pendências de operação, não conclusões legais prontas.

## Retenção proposta para validação

- Fila pendente: até conciliação explícita; não apagar automaticamente por idade.
- Cópia sincronizada local: 24 horas após confirmação, observada conciliação.
- Passagens e auditoria: proposta de 12 meses após evento, sujeita a contrato e finalidade.
- Logs técnicos sem conteúdo pessoal desnecessário: proposta de 30 dias.
- Backups: proposta de 30 dias com expiração controlada; pedidos de remoção precisam considerar ciclo de backup e reaplicação após restauração.
- Vídeos/evidências: não coletados no MVP. Política própria e acesso privado devem existir antes de F3.

Implementar rotina de retenção somente depois de definir esses prazos. Arquivar não é apagar. Solicitações de correção/remoção exigem identificação, análise e registro; nunca remover auditoria arbitrariamente por uma rota administrativa genérica.

## Incidente

Revogar acesso comprometido, preservar evidência técnica com acesso restrito, dimensionar organizações/eventos afetados, restaurar operação e registrar ações. Responsável operacional e responsável por dados decidem comunicação aplicável. Ensaiar perda de aparelho e vazamento de credencial antes da primeira prova.

Antes da IA: revisar finalidade de gravação, captura de terceiros, acesso a imagens, retenção, treinamento de modelos e licenças. OCR de número de peito não requer reconhecimento facial; reconhecimento facial não faz parte deste plano.
