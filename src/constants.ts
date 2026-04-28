/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Category, FundSource } from './types';

// Logos are now in public folder
const logo = '/dono.png?v=3';
const logoAnchieta = '/logo_anchieta.png?v=3';
const logoCPJA = '/logo_cpja.jpg?v=3';

export const CATEGORIES: { value: Category; label: string; color: string }[] = [
  { value: 'escola', label: 'Escola (Geral)', color: 'bg-orange-500' },
  { value: 'mensalidade', label: 'Mensalidades', color: 'bg-orange-600' },
  { value: 'evento', label: 'Eventos/Festas', color: 'bg-blue-600' },
  { value: 'materiais', label: 'Mat./Limpeza', color: 'bg-emerald-600' },
  { value: 'folha', label: 'Folha Pagto', color: 'bg-slate-900' },
  { value: 'manutencao', label: 'Estrutura/Reparo', color: 'bg-slate-600' },
  { value: 'pessoal', label: 'Pessoal', color: 'bg-orange-400' },
  { value: 'cantina', label: 'Cantina', color: 'bg-emerald-500' },
  { value: 'transferencia', label: 'Transf.', color: 'bg-blue-500' },
  { value: 'ajuste', label: 'Ajuste', color: 'bg-slate-700' },
  { value: 'outros', label: 'Outros', color: 'bg-slate-400' },
];

export const FUND_SOURCES: { value: FundSource; label: string }[] = [
  { value: 'caixa_fisico', label: 'Dinheiro Físico (Caixa)' },
  { value: 'bb_corrente', label: 'Banco do Brasil - Corrente' },
  { value: 'bb_poupanca', label: 'Banco do Brasil - Poupança' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'nubank', label: 'Nubank' },
  { value: 'ton', label: 'Ton' },
  { value: 'caixa_poupanca', label: 'Caixa Econômica Federal - Poupança' },
  { value: 'pessoal', label: 'Dinheiro Pessoal' },
  { value: 'cantina', label: 'Caixa da Cantina' },
];

export const APP_LOGO = logo;
export const LOGO_ANCHIETA = logoAnchieta;
export const LOGO_CPJA = logoCPJA;
export const SCHOOL_NAME = "Colégio Anchieta CPJA";
export const PLATFORM_NAME = "Nokite Hub";
