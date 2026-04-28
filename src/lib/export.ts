import { Transaction, Account } from '../types';
import { CATEGORIES } from '../constants';

export function exportTransactionsToCSV(transactions: Transaction[], accounts: Account[]) {
  const headers = ['Data', 'Descricao', 'Tipo', 'Categoria', 'Conta', 'Valor'];
  
  const rows = transactions.map(t => [
    new Date(t.date).toLocaleDateString('pt-BR'),
    `"${t.description.replace(/"/g, '""')}"`,
    t.type === 'income' ? 'Entrada' : t.type === 'expense' ? 'Saída' : 'Transferência',
    CATEGORIES.find(c => c.value === t.category)?.label || t.category,
    accounts.find(acc => acc.id === t.accountId)?.name || t.accountId,
    (t.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, useGrouping: false }).replace('.', ',')
  ]);

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.join(';'))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `relatorio_financeiro_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
