/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Category = 
  | 'escola'      // Geral Escola
  | 'mensalidade' // Recebimento de alunos
  | 'evento'      // Festas, feiras, eventos
  | 'materiais'   // Papelaria, Limpeza, etc
  | 'folha'       // Salários e encargos
  | 'manutencao'  // Reparos e estrutura
  | 'pessoal' 
  | 'cantina' 
  | 'outros' 
  | 'transferencia' 
  | 'ajuste';

export type FundSource = 
  | 'caixa_fisico' 
  | 'bb_corrente' 
  | 'bb_poupanca' 
  | 'mercado_pago' 
  | 'nubank' 
  | 'ton' 
  | 'caixa_poupanca' 
  | 'pessoal' 
  | 'cantina';

export interface Account {
  id: string;
  name: string;
  balance: number;
  tenantId: string;
  createdAt: any;
  color?: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category: Category;      // O que é o gasto (Escola, Pessoal, Cantina)
  accountId: string;       // ID da conta vinculada
  toAccountId?: string;    // Para transferências
  userId: string;
  createdAt: any;
  deleted?: boolean;
}

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  description: string;
  tenantId: string;
  createdAt: any;
}

export type DebtType = 'card' | 'loan' | 'other';
export type DebtStatus = 'active' | 'paid';

export interface Debt {
  id: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  dueDate?: string;
  type: DebtType;
  status: DebtStatus;
  installments?: number;
  remainingInstallments?: number;
  installmentValue?: number;
  userId: string;
  createdAt: any;
}

export type BillStatus = 'pending' | 'paid';

export interface Bill {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  category: Category;
  status: BillStatus;
  userId: string;
  createdAt: any;
}

export type WalletBalance = {
  id: FundSource;
  name: string;
  balance: number;
}

export type UserRole = 'owner' | 'viewer';

export interface TeamMember {
  id?: string;
  email: string;
  role: UserRole;
  tenantId: string;
  invitedAt: number;
    permissions?: {
      categories?: Category[];
      accountId?: string[];
      tabs?: string[];
    };
}
