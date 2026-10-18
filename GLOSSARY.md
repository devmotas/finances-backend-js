# Minhas Finanças

Controle financeiro pessoal organizado por mês, usado numa revisão semanal para saber onde o dinheiro está e prever o mês seguinte.

## Mês e lançamentos

**Mês selecionado**:
O mês que o usuário está olhando; todas as telas mostram os números desse mês.
_Avoid_: mês atual (quando não for o mês do calendário), período

**Lançamento**:
Um movimento de dinheiro com data, valor, categoria e descrição opcional.
_Avoid_: transação, registro

**Entrada**:
Lançamento de dinheiro que chega (salário, férias, vendas).
_Avoid_: receita, crédito

**Saída**:
Lançamento de dinheiro que sai para pagar algo; é sempre essencial ou não essencial.
_Avoid_: despesa (como nome de lançamento), gasto, débito

**Essencial**:
Saída necessária para viver (moradia, água, luz, transporte do dia a dia).
_Avoid_: obrigatória, fixa

**Não essencial**:
Saída por escolha (desejos, extras, lazer).
_Avoid_: supérflua, variável

**Categoria**:
Agrupamento de lançamentos de entrada ou de saída; categorias de saída dizem se são essenciais ou não essenciais.
_Avoid_: tipo, conta

**Avulso**:
Lançamento que vale só para o seu mês, sem repetição. Na tela aparece como "Este mês" ou "Só neste mês".
_Avoid_: variável, eventual

## Séries

**Série**:
Conjunto de lançamentos que se repetem todo mês com a mesma categoria e o mesmo valor de partida; é fixa ou parcelada.
_Avoid_: recorrência, repetição

**Fixo**:
Lançamento de uma série fixa: repete todo mês, sem data para acabar, até o usuário encerrar a série.
_Avoid_: recorrente, mensal

**Compra parcelada**:
Série com número de parcelas conhecido desde o início; termina sozinha na última parcela.
_Avoid_: parcelamento fixo, carnê

**Parcela**:
Cada lançamento de uma compra parcelada, identificado como "Parcela X de Y".
_Avoid_: prestação

**Encerrar série**:
Definir o último mês de uma série fixa; os meses seguintes deixam de ter lançamentos dela.
_Avoid_: cancelar série, apagar série

**Entrada com destino**:
Entrada fixa que, todo mês, já vira aporte numa conta de investimento; o dinheiro não passa pelo caixa.
_Avoid_: transferência automática

**Série acabando**:
Série cujo último lançamento está a até dois meses do mês selecionado; recebe aviso.
_Avoid_: série vencendo

## Investimentos e patrimônio

**Conta de investimento**:
Lugar onde o usuário guarda dinheiro investido (Poupança, Dólar, Reserva de Emergência), com saldo inicial próprio.
_Avoid_: categoria de investimento, carteira

**Aporte**:
Dinheiro que sai do caixa e entra numa conta de investimento.
_Avoid_: depósito, investimento (como nome de lançamento)

**Resgate**:
Dinheiro que sai de uma conta de investimento e volta para o caixa.
_Avoid_: saque, aporte negativo

**Atualização de saldo**:
Registro do saldo real de uma conta de investimento numa data, informado pelo usuário.
_Avoid_: ajuste, correção

**Rendimento**:
Quanto uma conta de investimento cresceu ou caiu sem aporte nem resgate, medido pela atualização de saldo.
_Avoid_: lucro, juros, valorização

**Patrimônio**:
Soma do valor das contas de investimento numa data: saldo inicial, aportes, resgates e rendimentos.
_Avoid_: investido, carteira total

## Carteira

**Carteira**:
Conta com o dinheiro do dia a dia, abastecida pela conta corrente; entra no saldo em caixa e fica fora do patrimônio, dos investimentos e da reserva. As compras feitas com ela não são lançadas uma a uma.
_Avoid_: conta de investimento, mesada, caixinha

**Transferência para a carteira**:
Dinheiro que sai da conta corrente e entra na carteira (ou volta dela para a conta corrente); não é saída nem entrada e não muda o saldo em caixa. "Meu pagamento" é uma transferência fixa todo mês.
_Avoid_: pagamento (como saída), aporte, gasto

**Gastos da carteira**:
Saída não essencial calculada pela atualização de saldo da carteira: a diferença entre o saldo esperado e o saldo real informado. Se o saldo real for maior, a diferença vira a entrada "Entrada na carteira".
_Avoid_: ajuste, despesa da carteira, sobra

**Gastos previstos da carteira**:
Média dos gastos da carteira dos últimos três meses fechados, descontada da previsão do próximo mês (menos o que já foi registrado nele).
_Avoid_: orçamento da carteira, limite

## Saldo e reserva

**Saldo do mês**:
Entradas menos saídas menos aportes mais resgates do mês selecionado.
_Avoid_: resultado, sobra do mês

**Saldo em caixa**:
Dinheiro disponível fora dos investimentos no fim do mês selecionado: conta corrente + carteira. Acumula o saldo de todos os meses até ele, então a sobra de um mês já passa para o seguinte.
_Avoid_: saldo acumulado, sobrou, saldo da conta

**Conta corrente**:
Conta onde o salário entra e as contas são pagas; é a parte do saldo em caixa formada pelas entradas, saídas, aportes, resgates e transferências registrados.
_Avoid_: caixa (sozinho), conta principal

**Conta de reserva**:
Conta de investimento marcada pelo usuário como parte da reserva de emergência; quase nunca é mexida.
_Avoid_: conta segura

**Reserva de curto prazo**:
Conta pequena e de acesso rápido de onde o usuário pega dinheiro emprestado num mês apertado e depois devolve; tem um valor-alvo.
_Avoid_: reserva da reserva, colchão, caixinha

**Pegar emprestado**:
Tirar dinheiro da reserva de curto prazo para o caixa; não é entrada.
_Avoid_: resgate (para esta conta), entrada

**Devolver**:
Colocar de volta na reserva de curto prazo o dinheiro pego emprestado; não é saída.
_Avoid_: aporte (para esta conta), pagamento

**Valor-alvo**:
Quanto a reserva de curto prazo deve ter quando está completa; a diferença para o saldo é o quanto falta devolver.
_Avoid_: limite, teto

**Reserva de emergência**:
Soma da reserva de curto prazo com o patrimônio das contas de reserva; o saldo em caixa não entra.
_Avoid_: reserva total, patrimônio

**Despesa de referência**:
Média das saídas essenciais dos últimos seis meses fechados; é quanto o usuário precisaria por mês numa emergência.
_Avoid_: despesa do mês, custo de vida

**Cobertura**:
Quantos meses de despesa de referência a reserva de emergência paga.
_Avoid_: múltiplo, percentual da reserva

**Meta da reserva**:
Cobertura que o usuário quer alcançar, em meses.
_Avoid_: objetivo, alvo
