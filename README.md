# adicional-projects — Controlo de Projectos de Distribuição

App da Adicional Logistics para controlar projectos de distribuição (STE, PROCAVA 106, BCP…): camiões subcontratados, destinos, kits e artigos, custos, notas de débito, orçamento e margem, cronograma e exportações Excel/PDF.

```
npm install
npm start          # http://localhost:3060
```

## Configuração
- Base de dados **MySQL/MariaDB** (Hostinger), configurada no `.env` (ver `.env.example`). As tabelas são criadas no arranque.
- **Login obrigatório** (cookie de sessão de 12 h). Perfis:
  - **Superadmin** — tudo, incluindo a gestão de utilizadores;
  - **Utilizador** — trabalho do dia-a-dia (projectos, camiões, custos, exportações).
- No primeiro arranque com a BD vazia é criado o superadmin `admin` (palavra-passe de `ADMIN_PASSWORD` ou temporária, escrita no log). A palavra-passe tem de ser mudada no 1.º acesso.
- **Temas** claro, escuro ou "seguir o sistema" — no menu da conta, no fundo da barra lateral.
- Migração dos dados antigos (SQLite `data/distribuicao.db`): `npm run migrar-sqlite`. Para apagar e copiar de novo: `npm run migrar-sqlite -- --substituir` (não mexe nos utilizadores).

## Funcionalidades
- Projectos com destinos de **kits** (1 kit por beneficiário, Baixa/Sequeiro) ou de **artigos** (volumes e peso), importação de projectos completos.
- Camiões subcontratados com vários destinos, preço global ou por destino, carga e peso vs capacidade, **guia de carga** imprimível.
- Custos (estivas, combustível…), **notas de débito** a transportadoras (descontadas no saldo), pagamentos.
- **Orçamento, gasto e margem** por projecto e no mapa de todos os projectos (Excel/PDF).
- **Mapa de viagens e custos por transportadora** (Excel/PDF).
- Cronograma, planeamento por dia (arrastar destinos para camiões), repartir entregas.
- Todas as tabelas com pesquisa; observações em todos os registos.

## Arranque automático (Windows)
- `servico/instalar.ps1` cria a tarefa agendada **"Distribuicao Insumos - Servidor"** (ao iniciar sessão), que corre `servico/executar.cmd` escondido e reinicia o servidor se parar. Cria também o atalho **Distribuição** no Ambiente de Trabalho.
- Remover: `powershell -ExecutionPolicy Bypass -File servico\instalar.ps1 -Remover`
- Registo: `logs/servidor.log`.

## Deploy no Render
1. No Render: **New → Blueprint** e escolher o repositório `Ismael-Valentao/adicional-projects` (usa o `render.yaml`).
2. Preencher `DB_HOST`, `DB_NAME`, `DB_USER` e `DB_PASS` (o `JWT_SECRET` é gerado pelo Render).
3. Na Hostinger (hPanel → Bases de dados → **MySQL remoto**) permitir ligações de qualquer IP (`%`), porque o Render não tem IP fixo no plano grátis.
4. Verificação de saúde: `/saude`.
