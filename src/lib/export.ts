import { Transaction, Account } from '../types';
import { CATEGORIES, APP_LOGO, PLATFORM_NAME, SCHOOL_NAME } from '../constants';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Helper to load image and return base64
const loadImage = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = url;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Failed to get canvas context'));
      }
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
  });
};

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

export async function exportTransactionsToPDF(transactions: Transaction[], accounts: Account[]) {
  const doc = new jsPDF() as any;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // Load logo
  let logoBase64 = '';
  try {
    logoBase64 = await loadImage(APP_LOGO);
  } catch (e) {
    console.error('Error loading logo for PDF:', e);
  }

  // Add Watermark
  const addWatermark = () => {
    doc.saveGraphicsState();
    doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
    doc.setFontSize(60);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'bold');
    
    // Diagonal Watermark
    doc.text(PLATFORM_NAME, pageWidth / 2, pageHeight / 2, {
      align: 'center',
      angle: 45
    });
    doc.restoreGraphicsState();
  };

  const headers = [['Data', 'Descrição', 'Tipo', 'Categoria', 'Conta', 'Valor']];
  const data = transactions.map(t => [
    new Date(t.date).toLocaleDateString('pt-BR'),
    t.description,
    t.type === 'income' ? 'Entrada' : t.type === 'expense' ? 'Saída' : 'Transf.',
    CATEGORIES.find(c => c.value === t.category)?.label || t.category,
    accounts.find(acc => acc.id === t.accountId)?.name || 'N/A',
    `R$ ${t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  ]);

  // Styling and content
  doc.autoTable({
    head: headers,
    body: data,
    startY: 40,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { top: 40 },
    didDrawPage: (data: any) => {
      // Header
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 15, 10, 20, 20);
      }
      
      doc.setFontSize(18);
      doc.setTextColor(40);
      doc.setFont('helvetica', 'bold');
      doc.text(SCHOOL_NAME, 40, 18);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'normal');
      doc.text(`Relatório Financeiro - Gerado em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 40, 25);
      
      doc.setFontSize(8);
      doc.text(`Plataforma: ${PLATFORM_NAME}`, 40, 30);

      // Add watermark to every page
      addWatermark();

      // Footer
      const str = "Página " + doc.internal.getNumberOfPages();
      doc.setFontSize(10);
      doc.text(str, pageWidth - 30, pageHeight - 10);
      doc.text(`${PLATFORM_NAME} - Gestão Financeira Inteligente`, 15, pageHeight - 10);
    }
  });

  doc.save(`relatorio_${new Date().toISOString().split('T')[0]}.pdf`);
}
