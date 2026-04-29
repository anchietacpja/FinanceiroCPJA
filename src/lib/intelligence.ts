import { Transaction, Category } from '../types';

/**
 * Lógica de "Aprendizado" para categorização automática.
 * Analisa as transações existentes para sugerir categorias para novos gastos.
 */
export function learnCategories(transactions: Transaction[]): Record<string, Category> {
  const knowledge: Record<string, { counts: Record<Category, number> }> = {};

  transactions.forEach(t => {
    // Normaliza a descrição para criar chaves consistentes (ex: "SUPERMERCADO DIA" -> "supermercado")
    const words = t.description.toLowerCase().split(' ').filter(w => w.length > 3);
    
    words.forEach(word => {
      if (!knowledge[word]) {
        knowledge[word] = { counts: {} as Record<Category, number> };
      }
      knowledge[word].counts[t.category] = (knowledge[word].counts[t.category] || 0) + 1;
    });
  });

  // Retorna a categoria mais provável para cada palavra-chave
  const result: Record<string, Category> = {};
  Object.keys(knowledge).forEach(word => {
    const counts = knowledge[word].counts;
    let bestCat: Category = 'outros';
    let max = 0;
    
    (Object.keys(counts) as Category[]).forEach(cat => {
      if (counts[cat] > max) {
        max = counts[cat];
        bestCat = cat;
      }
    });
    
    result[word] = bestCat;
  });

  return result;
}

/**
 * Converte data de DD/MM/AAAA para AAAA-MM-DD (ISO)
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  let year = parts[2];
  
  if (year.length === 2) {
    year = '20' + year;
  }
  
  return `${year}-${month}-${day}`;
}

/**
 * Tenta extrair Data, Descrição e Valor de uma linha de extrato de forma inteligente.
 * Suporta formatos de Nubank, Mercado Pago, BB e Caixa.
 */
export function parseStatementLine(line: string): { date: string, description: string, amount: number, type: 'income' | 'expense' } | null {
  if (!line || line.trim().length < 5) return null;

  // Tenta detectar o separador: Tab, Ponto e Vírgula ou Vírgula
  let separator = '';
  if (line.includes('\t')) separator = '\t';
  else if (line.includes(';')) separator = ';';
  else if (line.includes(',')) separator = ',';
  else separator = '  '; // Tenta espaços duplos como separador

  let parts = line.split(separator).map(p => p.trim().replace(/"/g, ''));

  // Se a linha for cabeçalho ou muito curta, ignora
  const lowerLine = line.toLowerCase();
  if (lowerLine.includes('data') || lowerLine.includes('histórico') || lowerLine.includes('descrição')) {
    return null;
  }

  let date = '';
  let description = '';
  let amount = 0;
  let type: 'income' | 'expense' = 'expense';

  // 1. Localiza a Data
  const dateRegex = /(\d{1,2}\/\d{1,2}\/\d{2,4})/;
  const dateIndex = parts.findIndex(p => dateRegex.test(p));
  if (dateIndex !== -1) {
    const rawDate = parts[dateIndex].match(dateRegex)?.[0] || '';
    if (rawDate) {
      date = normalizeDate(rawDate);
    }
  }

  // 2. Localiza o Valor
  // Procura em todas as partes por algo que pareça um número monetário
  const amountIndex = parts.findIndex(p => {
    const clean = p.replace('R$', '').replace(/\s/g, '').trim();
    // Verifica se tem dígitos e talvez um sinal de - ou +
    return /^-?(\d+([.,]\d+)*)$/.test(clean) && /\d/.test(clean);
  });

  if (amountIndex !== -1) {
    let rawAmount = parts[amountIndex]
      .replace('R$', '')
      .replace(/\s/g, '')
      .replace(/\./g, '') // Remove separador de milhar brasileiro
      .replace(',', '.') // Troca decimal brasileiro por padrão JS
      .trim();
    
    // Tratamento para bancos que colocam (D) ou (C) no final
    if (rawAmount.includes('D')) {
      rawAmount = '-' + rawAmount.replace('D', '');
    } else if (rawAmount.includes('C')) {
      rawAmount = rawAmount.replace('C', '');
    }

    const value = parseFloat(rawAmount);
    if (!isNaN(value)) {
      amount = Math.abs(value);
      type = value < 0 ? 'expense' : 'income';
    }
  }

  // 3. Localiza a Descrição
  // É a maior parte que sobrou e não é vazia
  const remainingParts = parts.filter((_, i) => i !== dateIndex && i !== amountIndex && parts[i].length >= 2);
  
  if (remainingParts.length > 0) {
    // Escolhe a parte mais longa como provável descrição
    description = [...remainingParts].sort((a, b) => b.length - a.length)[0];
  }

  if (date && amount > 0) {
    return { 
      date, 
      description: description || 'Transação Importada', 
      amount, 
      type 
    };
  }

  return null;
}
export function suggestCategory(description: string, knowledge: Record<string, Category>): Category {
  const words = description.toLowerCase().split(' ');
  
  // Prioridade para nomes de lojas ou serviços específicos conhecidos
  for (const word of words) {
    if (knowledge[word]) return knowledge[word];
  }

  // Fallbacks comuns baseados em palavras-chave genéricas se não houver aprendizado
  const desc = description.toLowerCase();
  
  // Escola
  if (desc.includes('escol') || desc.includes('aluno') || desc.includes('mensalidad') || desc.includes('anuidade') || desc.includes('fardamento')) return 'escola';
  
  // Cantina
  if (desc.includes('cantin') || desc.includes('lanch') || desc.includes('comida') || desc.includes('bebida') || desc.includes('ifood') || desc.includes('restaurante')) return 'cantina';
  
  // Pessoal
  if (desc.includes('pessoal') || desc.includes('casa') || desc.includes('supermercado') || desc.includes('farmacia') || desc.includes('saude') || desc.includes('lazer')) return 'pessoal';
  
  // Manutenção
  if (desc.includes('repar') || desc.includes('obras') || desc.includes('pintura') || desc.includes('reforma') || desc.includes('eletrica') || desc.includes('hidraulica')) return 'manutencao';
  
  // Materiais
  if (desc.includes('papel') || desc.includes('limpeza') || desc.includes('escritorio') || desc.includes('xerox') || desc.includes('impressao')) return 'materiais';

  // Folha de Pagamento
  if (desc.includes('salario') || desc.includes('pagamento') || desc.includes('ferias') || desc.includes('13o') || desc.includes('professor')) return 'folha';
  
  return 'outros';
}
