/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Category } from './types';
export const APP_LOGO = '/logo_anchieta.png';
export const LOGO_ANCHIETA = '/logo_anchieta.png';
export const LOGO_CPJA = '/logo_cpja.jpg';

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

export const SCHOOL_NAME = "Colégio Anchieta CPJA";
export const PLATFORM_NAME = "Nokite Hub";
