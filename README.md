# adicional-projects — Controlo de Projectos de Distribuição

App da Adicional Logistics para controlar projectos de distribuição (STE, PROCAVA 106, BCP…): camiões subcontratados, destinos, kits e artigos, custos, notas de débito, orçamento e margem, cronograma e exportações Excel/PDF.

```
npm install
npm start          # http://localhost:3060
```

- Base de dados SQLite em `data/distribuicao.db` (criada e preenchida com o cronograma na 1.ª execução). Para recomeçar do zero, apague esse ficheiro.
- **Exportar Excel** (botão no topo): folhas Resumo, Destinos, Camiões, Custos e Cronograma (grelha igual ao mapa original, com previsto vs entregue).
- Custo da viagem: valor global (repartido pelos destinos proporcionalmente aos beneficiários) ou preço por destino.
- Situação de cada destino calculada contra a data prevista: atrasado, sem camião, saída do camião depois da data prevista, entregue no prazo / com atraso.

## Receita e custos
- Receita do projecto (Definições da missão): valor global ou por beneficiário.
- Mostra só factos: gasto registado (camiões + estivas e outros), saldo = receita − gasto, pago e por pagar. Orçamento por rubrica é opcional.
- A interface actualiza-se sozinha quando outra pessoa altera dados.

## Kits e guia de carga
- Composição dos kits (Composicao_Kits_Insumos.pdf) em `kit_itens`: 1 kit por beneficiário — benef. baixa → Kit Baixa, sequeiro → Kit Sequeiro. Quantidades e pesos editáveis na página **Kits de insumos**.
- Cada camião mostra kits e peso estimado (alerta se ultrapassar a capacidade); **Guia de carga** imprimível em `/guia/<id do camião>`.

## Arranque automático (Windows)
- `servico/instalar.ps1` cria a tarefa agendada **"Distribuicao Insumos - Servidor"** (ao iniciar sessão), que corre `servico/executar.cmd` escondido e reinicia o servidor se parar. Cria também o atalho **Distribuição** no Ambiente de Trabalho.
- Remover: `powershell -ExecutionPolicy Bypass -File servico\instalar.ps1 -Remover`
- Registo: `logs/servidor.log`. Depois de alterar o código, reinicie com: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? CommandLine -match 'ExperimentalWarning server.js' | % { Stop-Process -Id $_.ProcessId }` (o ciclo volta a arrancá-lo em 5 s).
