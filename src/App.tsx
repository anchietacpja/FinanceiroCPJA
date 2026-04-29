/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  BarChart3, 
  Plus, 
  Wallet, 
  AlertCircle,
  LayoutDashboard,
  History,
  Receipt,
  LogOut,
  School,
  User,
  Coffee,
  LogIn,
  Search,
  Filter,
  ArrowRight,
  Download,
  Calendar,
  GraduationCap,
  Users,
  BookOpen,
  PieChart,
  Upload,
  FileText,
  Save,
  Trash2,
  CheckCircle2,
  Loader2,
  Pencil,
  X,
  CreditCard,
  Landmark,
  Target,
  ShieldAlert,
  UserPlus,
  UserMinus,
  ShieldCheck,
  ArrowUpRight,
  TrendingUp,
  ArrowLeftRight,
  ChevronRight,
  Image as ImageIcon,
} from 'lucide-react';

const SafeLogo = ({ src, alt, className, fallbackIcon: Fallback = School }: { src: string; alt: string; className?: string; fallbackIcon?: any }) => {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    setError(false);
    setLoading(true);
  }, [src]);

  if (error || !src) {
    return (
      <div className={`${className} flex items-center justify-center bg-slate-50 text-slate-300`}>
        <Fallback size={24} strokeWidth={1} />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-200">
          <Fallback size={20} strokeWidth={1} className="animate-pulse" />
        </div>
      )}
      <img 
        src={src} 
        alt={alt} 
        className={`${className} ${loading ? 'opacity-0' : 'opacity-100'}`} 
        onLoad={() => setLoading(false)}
        referrerPolicy="no-referrer"
        onError={(e) => {
          console.error(`Failed to load logo: ${src}`, e);
          setError(true);
          setLoading(false);
        }} 
      />
    </div>
  );
};
import { motion, AnimatePresence } from 'motion/react';
import { Transaction, Category, FundSource, Debt, Bill, UserRole, TeamMember, Account, Transfer } from './types';
import { CATEGORIES, FUND_SOURCES, LOGO_ANCHIETA, LOGO_CPJA, SCHOOL_NAME, PLATFORM_NAME, APP_LOGO } from './constants';
import { auth, db, signInWithGoogle, loginWithEmail, registerWithEmail, createCollaboratorAccount, logout, handleFirestoreError } from './lib/firebase';
import { exportTransactionsToCSV } from './lib/export';
import { learnCategories, suggestCategory, parseStatementLine, normalizeDate } from './lib/intelligence';
import { useAuthState } from 'react-firebase-hooks/auth';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  BarChart, 
  Bar,
  Cell
} from 'recharts';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  setDoc,
  serverTimestamp, 
  onSnapshot,
  deleteDoc,
  updateDoc,
  doc
} from 'firebase/firestore';

export default function App() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [user, loading, error] = useAuthState(auth);
  const [userRole, setUserRole] = useState<UserRole>('owner');
  const [userPermissions, setUserPermissions] = useState<TeamMember['permissions'] | null>(null);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'accounts' | 'reports' | 'debts' | 'payables' | 'settings'>('dashboard');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isParsingPDF, setIsParsingPDF] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<'thisMonth' | 'lastMonth' | 'all'>('thisMonth');
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState<string | 'all'>(new Date().getMonth().toString());
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmDeleteMember, setConfirmDeleteMember] = useState<TeamMember | null>(null);
  const [confirmDeleteDebt, setConfirmDeleteDebt] = useState<string | null>(null);
  const [confirmPayDebt, setConfirmPayDebt] = useState<string | null>(null);
  const [confirmDeleteBill, setConfirmDeleteBill] = useState<string | null>(null);
  const [editingPermissionsMember, setEditingPermissionsMember] = useState<TeamMember | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      await processPDF(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setImportText(content);
      };
      reader.readAsText(file);
    }
  };

  const processPDF = async (file: File) => {
    setIsParsingPDF(true);
    try {
      const base64 = await fileToBase64(file);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: "gemini-1.5-pro",
        contents: [
          {
            parts: [
              { text: "Extraia todas as transações deste extrato bancário. Retorne um JSON com um array de objetos contendo: date (string AAAA-MM-DD), description (string), amount (number positivo), type ('income' ou 'expense'). Importante: Converta as datas para o formato ISO AAAA-MM-DD. Ignore cabeçalhos e rodapés." },
              { inlineData: { data: base64.split(',')[1], mimeType: "application/pdf" } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transactions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING },
                    description: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                    type: { type: Type.STRING }
                  },
                  required: ["date", "description", "amount", "type"]
                }
              }
            }
          }
        }
      });

      const data = JSON.parse(response.text);
      const knowledge = learnCategories(transactions);
      
      // Garante que as datas estão normalizadas mesmo que a IA falhe em retornar AAAA-MM-DD
      const newTxs = data.transactions.map((t: any) => ({
        ...t,
        date: t.date.includes('/') ? normalizeDate(t.date) : t.date,
        category: suggestCategory(t.description, knowledge),
        accountId: accounts[0]?.id || 'default'
      }));

      setPreviewTransactions(newTxs);
    } catch (err) {
      console.error("Erro ao ler PDF:", err);
      alert("Houve um erro ao processar o PDF com IA. Tente converter para texto ou usar um arquivo CSV.");
    } finally {
      setIsParsingPDF(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };
  const [previewTransactions, setPreviewTransactions] = useState<Partial<Transaction>[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [modalType, setModalType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('viewer');
  const [invitePassword, setInvitePassword] = useState('');
  const [isRegisteringMember, setIsRegisteringMember] = useState(false);
  const [loginTab, setLoginTab] = useState<'login' | 'register'>('login');

  // Role and Tenant Management
  useEffect(() => {
    if (!user) return;

    // Check if user is a team member
    const unsubscribe = onSnapshot(doc(db, 'team_members', user.email!), (docSnap) => {
      if (!docSnap.exists()) {
        console.log("Criando registro de membro para novo usuário:", user.email);
        const newMember: TeamMember = {
          email: user.email!,
          role: 'owner',
          tenantId: user.uid,
          invitedAt: Date.now()
        };
        setDoc(doc(db, 'team_members', user.email!), newMember)
          .then(() => console.log("Membro criado com sucesso."))
          .catch(err => {
            console.error("Erro ao criar membro:", err);
            alert("Erro ao configurar seu acesso inicial. Por favor, tente recarregar a página.");
          });
      } else {
        const data = docSnap.data() as TeamMember;
        console.log("Perfil carregado com sucesso:", data.email, "Role:", data.role, "Tenant:", data.tenantId);
        setUserRole(data.role);
        setUserPermissions(data.permissions || null);
        setCurrentTenantId(data.tenantId);
      }
    }, (error) => {
      console.error("Erro no listener de team_members:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Load team members if owner
  useEffect(() => {
    if (!user || userRole !== 'owner' || !currentTenantId) return;

    const q = query(
      collection(db, 'team_members'),
      where('tenantId', '==', currentTenantId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const members = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      })) as TeamMember[];
      setTeamMembers(members);
    }, (err) => {
      handleFirestoreError(err, 'get' as any, 'team_members');
    });

    return () => unsubscribe();
  }, [user, userRole, currentTenantId]);

  // Real-time synchronization
  useEffect(() => {
    if (!user || !currentTenantId) return;

    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', currentTenantId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
        .filter(t => !t.deleted) as Transaction[];
      // Sort client-side to avoid index requirement
      const sortedTxs = txs.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.date);
        const dateB = b.createdAt?.toDate?.() || new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      });
      console.log("Transações sincronizadas:", sortedTxs.length);
      setTransactions(sortedTxs);
    }, (err) => {
      handleFirestoreError(err, 'get' as any, 'transactions');
    });

    return () => unsubscribe();
  }, [user, currentTenantId]);

  // Real-time synchronization for Accounts
  useEffect(() => {
    if (!user || !currentTenantId) return;

    const q = query(
      collection(db, 'accounts'),
      where('tenantId', '==', currentTenantId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const accs = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })) as Account[];
      setAccounts(accs.sort((a, b) => b.createdAt - a.createdAt));
    }, (err) => {
      handleFirestoreError(err, 'get' as any, 'accounts');
    });

    return () => unsubscribe();
  }, [user, currentTenantId]);

  // Real-time synchronization for Transfers
  useEffect(() => {
    if (!user || !currentTenantId) return;

    const q = query(
      collection(db, 'transfers'),
      where('tenantId', '==', currentTenantId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trs = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })) as Transfer[];
      setTransfers(trs.sort((a, b) => b.createdAt - a.createdAt));
    }, (err) => {
      handleFirestoreError(err, 'get' as any, 'transfers');
    });

    return () => unsubscribe();
  }, [user, currentTenantId]);

  // Real-time synchronization for Debts
  useEffect(() => {
    if (!user || !currentTenantId) return;

    const q = query(
      collection(db, 'debts'),
      where('userId', '==', currentTenantId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbts = snapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
        .filter(d => !d.deleted) as Debt[];
      // Sort client-side
      const sortedDbts = dbts.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.dueDate);
        const dateB = b.createdAt?.toDate?.() || new Date(b.dueDate);
        return dateB.getTime() - dateA.getTime();
      });
      setDebts(sortedDbts);
    }, (err) => {
      console.error("Erro ao sincronizar dívidas:", err);
    });

    return () => unsubscribe();
  }, [user, currentTenantId]);

  // Real-time synchronization for Bills
  useEffect(() => {
    if (!user || !currentTenantId) return;

    const q = query(
      collection(db, 'bills'),
      where('userId', '==', currentTenantId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bls = snapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
        .filter(b => !b.deleted) as Bill[];
      // Sort client-side by dueDate
      const sortedBls = bls.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      setBills(sortedBls);
    }, (err) => {
      console.error("Erro ao sincronizar contas a pagar:", err);
    });

    return () => unsubscribe();
  }, [user, currentTenantId]);

  useEffect(() => {
    if (userRole === 'viewer' && userPermissions?.tabs && !userPermissions.tabs.includes(activeTab)) {
      // If viewer is on a tab they don't have access to, redirect to first allowed or dashboard if allowed
      const allowedTabs = userPermissions.tabs;
      if (allowedTabs.length > 0) {
        setActiveTab(allowedTabs[0] as any);
      }
    }
  }, [userRole, userPermissions, activeTab]);

  // Contas autorizadas conforme as permissões do usuário
  const authorizedBills = useMemo(() => {
    if (userRole === 'owner') return bills;
    if (userRole === 'viewer') {
      let filtered = [...bills];
      if (userPermissions) {
        if (userPermissions.categories) {
          filtered = filtered.filter(b => userPermissions.categories?.includes(b.category));
        }
      }
      return filtered;
    }
    return bills;
  }, [bills, userRole, userPermissions]);

  const isRootOwner = useMemo(() => user?.uid === currentTenantId, [user, currentTenantId]);

  // Transações autorizadas conforme as permissões do usuário
  const authorizedTransactions = useMemo(() => {
    // Proprietário vê tudo
    if (userRole === 'owner') return transactions;
    
    // Se for viewer e tiver permissões, filtramos rigorosamente
    if (userRole === 'viewer') {
      let filtered = [...transactions];
      
      // Se as permissões estão definidas, aplicamos os filtros
      if (userPermissions) {
        // Filtrar por categorias (se a lista existir, o usuário só vê o que está nela)
        if (userPermissions.categories) {
          filtered = filtered.filter(t => userPermissions.categories?.includes(t.category));
        }
        
        // Filtrar por origens/contas (se a lista existir, o usuário só vê o que está nela)
        if (userPermissions.accountId) {
          filtered = filtered.filter(t => userPermissions.accountId?.includes(t.accountId));
        }
      } else {
        // Se for um viewer sem objeto de permissões no banco, bloqueamos por segurança ou mostramos tudo?
        // Em um sistema profissional, se não tem permissão definida, não vê nada ou vê o básico.
        // Vamos permitir ver tudo como fallback se o objeto for totalmente nulo (legado), 
        // mas restringir se as listas estiverem presentes.
      }
      
      return filtered;
    }
    
    return transactions;
  }, [transactions, userRole, userPermissions]);

  // Filtragem por período
  const periodFilteredTransactions = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return authorizedTransactions.filter(t => {
      const dateStr = (t.date || '').includes('/') ? normalizeDate(t.date) : (t.date || '');
      const tDate = new Date(dateStr + 'T12:00:00');
      if (isNaN(tDate.getTime())) return periodFilter === 'all';
      
      if (periodFilter === 'all') return true;
      if (periodFilter === 'thisMonth') {
        return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
      }
      if (periodFilter === 'lastMonth') {
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return tDate.getMonth() === lastMonth && tDate.getFullYear() === lastMonthYear;
      }
      return true;
    });
  }, [authorizedTransactions, periodFilter]);

  // Métricas do período filtrado
  const periodMetrics = useMemo(() => {
    const income = periodFilteredTransactions
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + (t.amount || 0), 0);
    
    const expense = periodFilteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + (t.amount || 0), 0);
    
    const transfers = periodFilteredTransactions
      .filter(t => t.type === 'transfer')
      .reduce((acc, t) => acc + (t.amount || 0), 0);

    return { income, expense, transfers, net: income - expense };
  }, [periodFilteredTransactions]);

  // Dados para o Gráfico de Fluxo de Caixa Diário
  const chartData = useMemo(() => {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();

    if (periodFilter === 'lastMonth') {
      month = month === 0 ? 11 : month - 1;
      year = month === 11 ? year - 1 : year;
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const data = Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      income: 0,
      expense: 0
    }));

    periodFilteredTransactions.forEach(t => {
      const dateStr = (t.date || '').includes('/') ? (t.date.split('/').reverse().join('-')) : (t.date || '');
      const tDate = new Date(dateStr + 'T12:00:00');
      if (isNaN(tDate.getTime())) return;

      const day = tDate.getDate();
      // Only include in chart if it belongs to the month/year we are plotting
      if (tDate.getMonth() === month && tDate.getFullYear() === year) {
        if (t.type === 'income' && data[day - 1]) data[day - 1].income += t.amount;
        if (t.type === 'expense' && data[day - 1]) data[day - 1].expense += t.amount;
      }
    });

    return data;
  }, [periodFilteredTransactions, periodFilter]);

  // Totais por Origem de Recurso (Saldo real de cada "Carteira")
  // Aqui estamos somando os movimentos. Em uma app real, poderíamos ter um saldo inicial configurável.
  const [notifications, setNotifications] = useState<{id: string, message: string, type: 'success' | 'error'}[]>([]);

  const addNotification = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const balances = useMemo(() => {
    const b: Record<string, number> = {};
    accounts.forEach(acc => {
      b[acc.id] = acc.balance || 0;
    });

    authorizedTransactions.forEach(t => {
      if (t.type === 'income') {
        if (b[t.accountId] !== undefined) b[t.accountId] += t.amount || 0;
      } else if (t.type === 'expense') {
        if (b[t.accountId] !== undefined) b[t.accountId] -= t.amount || 0;
      } else if (t.type === 'transfer') {
        // Para transferências, o accountId é de onde SAI e toAccountId é para onde VAI
        if (b[t.accountId] !== undefined) b[t.accountId] -= t.amount || 0;
        if (t.toAccountId && b[t.toAccountId] !== undefined) {
          b[t.toAccountId] += t.amount || 0;
        }
      }
    });

    return b;
  }, [authorizedTransactions, accounts]);

  // Cruzamento de dados: Quando gastamos dinheiro da 'origem' errada
  const inconsistencies = useMemo(() => {
    return authorizedTransactions.filter(t => {
      if (t.type === 'income') return false; // Inconsistências costumam ser saídas
      
      const account = accounts.find(acc => acc.id === t.accountId);
      const accName = (account?.name || '').toLowerCase();
      const isPublicSource = !accName.includes('pessoal') && !accName.includes('cantina');
      const isPrivateSource = accName.includes('pessoal') || accName.includes('cantina');

      if (t.category === 'pessoal' && isPublicSource) return true;
      if (t.category === 'escola' && isPrivateSource) return true;
      if (t.category === 'cantina' && isPublicSource) return true;
      return false;
    });
  }, [authorizedTransactions, accounts]);

  // Métricas do período filtrado
  const schoolMetrics = useMemo(() => {
    const totalDebt = debts.reduce((acc, d) => d.status === 'active' ? acc + d.totalAmount : acc, 0);
    return {
      tuition: periodFilteredTransactions.filter(t => t.category === 'mensalidade' && t.type === 'income').reduce((acc, t) => acc + (t.amount || 0), 0),
      payroll: periodFilteredTransactions.filter(t => t.category === 'folha' && t.type === 'expense').reduce((acc, t) => acc + (t.amount || 0), 0),
      maintenance: periodFilteredTransactions.filter(t => t.category === 'manutencao' && t.type === 'expense').reduce((acc, t) => acc + (t.amount || 0), 0),
      totalDebt,
      events: periodFilteredTransactions.filter(t => t.category === 'evento').reduce((acc, t) => {
        if (t.type === 'income') return acc + (t.amount || 0);
        if (t.type === 'expense') return acc - (t.amount || 0);
        return acc;
      }, 0),
    };
  }, [periodFilteredTransactions, debts]);

  // Métricas da Agenda
  const agendaMetrics = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const plannedThisMonth = bills.filter(b => {
      const dateStr = (b.dueDate || '').includes('/') ? normalizeDate(b.dueDate) : (b.dueDate || '');
      const d = new Date(dateStr + 'T12:00:00');
      if (isNaN(d.getTime())) return false;
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).reduce((acc, b) => acc + b.amount, 0);

    const spentPreviousMonths = authorizedTransactions.filter(t => {
      if (t.type !== 'expense') return false;
      const dateStr = (t.date || '').includes('/') ? normalizeDate(t.date) : (t.date || '');
      const d = new Date(dateStr + 'T12:00:00');
      if (isNaN(d.getTime())) return false;
      const isBeforeCurrentMonth = d.getFullYear() < currentYear || (d.getFullYear() === currentYear && d.getMonth() < currentMonth);
      return isBeforeCurrentMonth;
    }).reduce((acc, t) => acc + t.amount, 0);

    return { plannedThisMonth, spentPreviousMonths };
  }, [bills, authorizedTransactions]);

  const filteredTransactions = useMemo(() => {
    return authorizedTransactions.filter(t => {
      const matchesSearch = t.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [authorizedTransactions, searchQuery, categoryFilter]);

  const addTransaction = async (t: Omit<Transaction, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) {
      alert("Sessão expirada. Por favor, faça login novamente.");
      return;
    }
    if (!currentTenantId) {
      alert("Ambiente não carregado. Aguarde um momento e tente novamente.");
      return;
    }
    if (userRole === 'viewer') {
      alert('Acesso restrito: Visualizadores não podem realizar alterações.');
      return;
    }
    
    try {
      console.log("Iniciando addTransaction:", t);
      setIsProcessing(true);
      if (editingTransaction) {
        const docRef = doc(db, 'transactions', editingTransaction.id);
        console.log("Atualizando transação existente:", editingTransaction.id);
        const normalizedDateStr = t.date.includes('/') ? normalizeDate(t.date) : t.date;
        const updateData: any = {
          date: normalizedDateStr,
          description: t.description,
          amount: t.amount,
          type: t.type,
          category: t.type === 'transfer' ? 'transferencia' : t.category,
          accountId: t.accountId,
        };
        if (t.type === 'transfer' && t.toAccountId) {
          updateData.toAccountId = t.toAccountId;
        } else {
          updateData.toAccountId = null;
        }
        await updateDoc(docRef, updateData);
        setEditingTransaction(null);
        addNotification("Transação atualizada com sucesso!", "success");
      } else {
        const normalizedDateStr = t.date.includes('/') ? normalizeDate(t.date) : t.date;
        const cleanData: any = {
          date: normalizedDateStr,
          description: t.description,
          amount: t.amount,
          type: t.type,
          category: t.type === 'transfer' ? 'transferencia' : t.category,
          accountId: t.accountId,
          userId: currentTenantId,
          createdAt: serverTimestamp(),
        };

        if (t.type === 'transfer' && t.toAccountId) {
          cleanData.toAccountId = t.toAccountId;
        }

        console.log("Salvando nova transação:", cleanData);
        await addDoc(collection(db, 'transactions'), cleanData);
        addNotification(`Sucesso: ${t.type === 'income' ? 'Recebimento' : t.type === 'expense' ? 'Pagamento' : 'Transferência'} registrado.`, "success");
      }
      console.log("Transação salva com sucesso.");
      setShowAddModal(false);
    } catch (err) {
      console.error("Erro fatal em addTransaction:", err);
      addNotification("Erro ao salvar transação. Verifique sua conexão.", "error");
      handleFirestoreError(err, editingTransaction ? 'update' : 'create', 'transactions');
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!user) return;
    if (userRole === 'viewer') {
      alert('Você não tem permissão para excluir transações.');
      return;
    }
    try {
      await updateDoc(doc(db, 'transactions', id), { deleted: true, deletedAt: serverTimestamp() });
      addNotification("Registro removido com sucesso (movido para o histórico).", "success");
      setConfirmDelete(null);
    } catch (err: any) {
      console.error('Erro ao excluir transação:', err);
      addNotification(`Erro ao excluir: ${err.message || 'Erro de permissão'}`, "error");
    }
  };

  const addDebt = async (d: Omit<Debt, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) {
      alert("Sessão expirada. Por favor, faça login novamente.");
      return;
    }
    if (!currentTenantId) {
      alert("Ambiente não carregado. Aguarde um momento e tente novamente.");
      return;
    }
    if (userRole === 'viewer') {
      alert('Acesso restrito: Visualizadores não podem realizar alterações.');
      return;
    }
    try {
      const cleanData = {
        ...d,
        userId: currentTenantId,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'debts'), cleanData);
      setShowDebtModal(false);
    } catch (err) {
      handleFirestoreError(err, 'create', 'debts');
    }
  };

  const deleteDebt = async (id: string) => {
    if (!user) return;
    if (userRole === 'viewer') {
      alert('Apenas administradores podem excluir dívidas.');
      return;
    }
    try {
      await updateDoc(doc(db, 'debts', id), { deleted: true, deletedAt: serverTimestamp() });
      addNotification("Provisão de dívida arquivada com sucesso.", "success");
    } catch (err: any) {
      console.error('Erro ao excluir dívida:', err);
      addNotification(`Erro ao excluir: ${err.message || 'Erro de permissão'}`, "error");
    }
  };

  const addTeamMember = async (email: string, role: UserRole = 'viewer', password?: string) => {
    if (!user) {
      alert('Você precisa estar logado.');
      return;
    }
    if (!currentTenantId) {
      alert('Seu ambiente financeiro não foi carregado corretamente. Tente recarregar a página.');
      return;
    }
    if (userRole !== 'owner') {
      alert('Desculpe, apenas proprietários podem adicionar membros.');
      return;
    }

    setIsRegisteringMember(true);
    try {
      // Se informou senha, cria a conta no Firebase Auth primeiro
      if (password && password.length >= 6) {
        try {
          await createCollaboratorAccount(email, password);
        } catch (authErr: any) {
          // Se o usuário já existir no Auth, apenas ignoramos o erro e atualizamos o Firestore
          if (authErr.code !== 'auth/email-already-in-use') {
            throw authErr;
          }
        }
      }

      await setDoc(doc(db, 'team_members', email), {
        email,
        role,
        tenantId: currentTenantId,
        invitedAt: Date.now(),
      });
      addNotification(`Colaborador ${email} autorizado com sucesso! Se você definiu uma senha, ele já pode entrar.`, "success");
    } catch (err: any) {
      console.error('Erro ao adicionar membro:', err);
      if (err.code === 'auth/operation-not-allowed' || (err.message && err.message.includes('auth/operation-not-allowed'))) {
        addNotification('⚠️ CONFIGURAÇÃO NECESSÁRIA: Ative E-mail/Senha no Firebase Console.', "error");
      } else if (err.code === 'permission-denied') {
        addNotification('Você não tem permissão para realizar esta ação.', "error");
      } else {
        addNotification(`Erro ao salvar: ${err.message || 'Erro desconhecido'}`, "error");
      }
    } finally {
      setIsRegisteringMember(false);
    }
  };

  const removeTeamMember = async (id: string) => {
    if (!user) return;
    if (userRole !== 'owner') {
      alert('Apenas proprietários podem remover membros.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'team_members', id));
      addNotification('Membro removido com sucesso.', "success");
    } catch (err: any) {
      console.error('Erro ao remover membro:', err);
      if (err.code === 'permission-denied') {
        addNotification('Você não tem permissão para remover este membro.', "error");
      } else {
        addNotification(`Erro ao remover: ${err.message || 'Erro desconhecido'}`, "error");
      }
    }
  };

  const updateMemberPermissions = async (memberEmail: string, permissions: TeamMember['permissions']) => {
    if (!user || userRole !== 'owner') return;
    try {
      await updateDoc(doc(db, 'team_members', memberEmail), { permissions });
      addNotification('Permissões atualizadas com sucesso!', "success");
      setEditingPermissionsMember(null);
    } catch (err) {
      console.error('Erro ao atualizar permissões:', err);
      handleFirestoreError(err, 'update', 'team_members');
    }
  };

  const updateDebt = async (id: string, data: Partial<Debt>) => {
    if (!user || userRole === 'viewer') return;
    try {
      const docRef = doc(db, 'debts', id);
      await updateDoc(docRef, data as any);
      addNotification("Dívida atualizada com sucesso.", "success");
    } catch (err) {
      console.error("Erro ao atualizar dívida:", err);
      // Extrair mensagem legível se for JSON do handleFirestoreError
      let displayMsg = "Tente novamente.";
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.error) displayMsg = `Permissão Negada: ${parsed.operationType} em ${parsed.path}`;
        } catch {
          displayMsg = err.message;
        }
      }
      alert("Erro ao atualizar dívida: " + displayMsg);
      handleFirestoreError(err, 'update', 'debts');
    }
  };

  const addBill = async (b: Omit<Bill, 'id' | 'createdAt' | 'userId'>) => {
    if (!user) {
      alert("Sessão expirada. Por favor, faça login novamente.");
      return;
    }
    if (!currentTenantId) {
      alert("Ambiente não carregado. Aguarde um momento e tente novamente.");
      return;
    }
    if (userRole === 'viewer') {
      alert('Acesso restrito: Visualizadores não podem realizar alterações.');
      return;
    }
    try {
      const normalizedDueDate = (b.dueDate || '').includes('/') ? normalizeDate(b.dueDate) : (b.dueDate || '');
      if (editingBill) {
        await updateDoc(doc(db, 'bills', editingBill.id), {
          ...b,
          dueDate: normalizedDueDate
        });
        setEditingBill(null);
      } else {
        const cleanData = {
          ...b,
          dueDate: normalizedDueDate,
          userId: currentTenantId,
          createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, 'bills'), cleanData);
      }
      setShowBillModal(false);
    } catch (err) {
      handleFirestoreError(err, editingBill ? 'update' : 'create', 'bills');
    }
  };

  const deleteBill = async (id: string) => {
    if (!user) return;
    if (userRole === 'viewer') {
      alert('Apenas administradores podem excluir contas.');
      return;
    }
    try {
      await updateDoc(doc(db, 'bills', id), { deleted: true, deletedAt: serverTimestamp() });
      addNotification("Conta a pagar removida do fluxo ativo.", "success");
    } catch (err: any) {
      console.error('Erro ao excluir conta:', err);
      addNotification(`Erro ao excluir: ${err.message || 'Erro de permissão'}`, "error");
    }
  };

  const addAccount = async (a: Omit<Account, 'id' | 'createdAt' | 'tenantId'>) => {
    if (!user) return;
    if (userRole === 'viewer') {
      alert('Acesso restrito: Visualizadores não podem criar contas.');
      return;
    }
    if (userRole !== 'owner') {
      alert('Apenas proprietários podem gerenciar contas.');
      return;
    }
    try {
      if (editingAccount) {
        await updateDoc(doc(db, 'accounts', editingAccount.id), {
          ...a,
        });
        setEditingAccount(null);
      } else {
        await addDoc(collection(db, 'accounts'), {
          ...a,
          tenantId: currentTenantId,
          createdAt: Date.now(),
        });
      }
      setShowAccountModal(false);
      addNotification("Conta salva com sucesso!", "success");
    } catch (err) {
      handleFirestoreError(err, editingAccount ? 'update' : 'create', 'accounts');
    }
  };

  const deleteAccount = async (id: string) => {
    if (!user) return;
    if (userRole === 'viewer') {
      alert('Acesso restrito: Visualizadores não podem excluir contas.');
      return;
    }
    if (userRole !== 'owner') {
      alert('Apenas proprietários podem excluir contas.');
      return;
    }
    // Check if account has transactions
    const hasTransactions = transactions.some(t => t.accountId === id);
    if (hasTransactions) {
      alert("Não é possível excluir uma conta que possui movimentações. Tente apenas renomear ou ocultar.");
      return;
    }
    try {
      await deleteDoc(doc(db, 'accounts', id));
      addNotification("Conta removida.", "success");
    } catch (err) {
      handleFirestoreError(err, 'delete', 'accounts');
    }
  };

  const addTransfer = async (t: { fromAccountId: string, toAccountId: string, amount: number, description: string, date: string }) => {
    if (!user || userRole === 'viewer') return;
    try {
      setIsProcessing(true);
      const timestamp = Date.now();
      
      // 1. Create Transfer Record
      await addDoc(collection(db, 'transfers'), {
        ...t,
        tenantId: currentTenantId,
        createdAt: timestamp,
      });

      // 2. Create Transfer Transaction
      // Note: type 'transfer' correctly handles balance subtraction in fromAccountId 
      // AND addition in toAccountId in the accountBalances useMemo.
      await addDoc(collection(db, 'transactions'), {
        date: t.date,
        description: `TRANSFERÊNCIA: ${t.description}`,
        amount: t.amount,
        type: 'transfer', 
        category: 'transferencia',
        accountId: t.fromAccountId,
        toAccountId: t.toAccountId,
        userId: currentTenantId,
        createdAt: serverTimestamp(),
      });

      setShowAddModal(false);
      addNotification("Transferência realizada com sucesso!", "success");
    } catch (err) {
      handleFirestoreError(err, 'create', 'transfers');
    } finally {
      setIsProcessing(false);
    }
  };

  const markBillAsPaid = async (bill: Bill) => {
    if (!user || userRole === 'viewer') return;
    try {
      // Create a transaction first
      await addTransaction({
        date: new Date().toISOString().split('T')[0],
        description: `PAGTO: ${bill.description}`,
        amount: bill.amount,
        type: 'expense',
        category: bill.category,
        accountId: accounts[0]?.id || 'caixa_fisico', // Default to first account
      });
      // Mark bill as paid
      await updateDoc(doc(db, 'bills', bill.id), {
        status: 'paid'
      });
    } catch (err) {
      handleFirestoreError(err, 'update', 'bills');
    }
  };

  const processImport = () => {
    if (userRole === 'viewer') {
      alert('Acesso restrito: Visualizadores não podem importar dados.');
      return;
    }
    setIsProcessing(true);
    // Simula um pequeno delay para feedback visual de "inteligência processando"
    setTimeout(() => {
      const lines = importText.split('\n').filter(line => line.trim().length > 0);
      const knowledge = learnCategories(transactions);
      const newTxs: Partial<Transaction>[] = [];

      lines.forEach(line => {
        const parsed = parseStatementLine(line);
        
        if (parsed) {
          newTxs.push({
            date: parsed.date,
            description: parsed.description,
            amount: parsed.amount,
            type: parsed.type,
            category: suggestCategory(parsed.description, knowledge),
            accountId: accounts[0]?.id || 'caixa_fisico', // Default para extrato bancário
          });
        }
      });

      if (newTxs.length === 0) {
        alert("Não conseguimos localizar transações válidas. Tente colar novamente ou arraste o arquivo .CSV do banco.");
      }

      setPreviewTransactions(newTxs);
      setIsProcessing(false);
    }, 800);
  };

  const saveImported = async () => {
    if (!user) return;
    if (userRole === 'viewer') {
      alert('Acesso restrito: Visualizadores não podem salvar importações.');
      return;
    }
    try {
      for (const t of previewTransactions) {
        await addTransaction(t as any);
      }
      setShowImportModal(false);
      setPreviewTransactions([]);
      setImportText('');
    } catch (err) {
      console.error("Erro ao salvar importação:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-slate-100 rounded-full" />
            <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
          </div>
          <div className="text-center">
            <p className="text-slate-900 font-black italic tracking-tighter uppercase mb-1">Carregando</p>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Sincronizando finanças CPJA</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans selection:bg-orange-100 relative overflow-hidden">
        {/* Educational Background Image with Overlay */}
        <div className="absolute inset-0 z-0 scale-110">
          <img 
            src="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=2070&auto=format&fit=crop" 
            alt="School Background"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-30 grayscale"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900/90 to-orange-900/40"></div>
          {/* Subtle Grid Pattern Overlay */}
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        </div>

        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center relative z-10">
          <div className="text-center lg:text-left order-2 lg:order-1">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col items-center lg:items-start gap-12"
            >
              {/* Creator Highlight Box */}
              <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 p-6 rounded-[2rem] shadow-2xl flex items-center gap-5 group hover:bg-slate-800 transition-all">
                <div className="w-14 h-14 bg-white rounded-2xl p-2.5 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <SafeLogo src={APP_LOGO} className="w-full h-full object-contain" alt="Creator Logo" fallbackIcon={Target} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-orange-500 tracking-[0.4em] leading-none mb-1.5">Plataforma</p>
                  <p className="text-xl font-black text-white italic tracking-tighter leading-none uppercase">{PLATFORM_NAME} <span className="text-orange-500">HUB</span></p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <motion.div 
                    whileHover={{ scale: 1.05 }}
                    className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden border border-slate-100 p-2"
                  >
                    <SafeLogo src={LOGO_ANCHIETA} alt="School Logo 1" className="w-full h-full object-contain" fallbackIcon={GraduationCap} />
                  </motion.div>
                  <motion.div 
                    whileHover={{ scale: 1.05 }}
                    className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden border border-slate-100 p-2"
                  >
                    <SafeLogo src={LOGO_CPJA} alt="School Logo 2" className="w-full h-full object-contain" fallbackIcon={School} />
                  </motion.div>
                </div>
                <div className="h-12 w-[1px] bg-white/20"></div>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.4em] leading-none mb-2">Ecossistema</p>
                  <p className="text-xl font-black text-white italic tracking-tighter leading-none shadow-sm uppercase">{SCHOOL_NAME}</p>
                </div>
              </div>
              
              <div className="space-y-6">
                <h1 className="text-5xl md:text-7xl lg:text-5xl xl:text-7xl font-black text-white tracking-tighter leading-[0.8] italic text-center lg:text-left drop-shadow-2xl">
                  HUB<br />
                  <span className="text-orange-500">FINANCEIRO</span>
                </h1>
                <p className="text-white/60 text-base md:text-lg max-w-sm leading-relaxed font-medium mx-auto lg:mx-0 border-l-2 border-orange-500/30 pl-6">
                  Gestão estratégica de ativos educacionais do Grupo Anchieta CPJA.
                </p>
              </div>

              <div className="hidden md:flex items-center gap-6 pt-4">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white/20 bg-white/5 backdrop-blur-sm flex items-center justify-center overflow-hidden ring-4 ring-white/5">
                      <User size={20} className="text-white/40" />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-white/40 font-black uppercase tracking-widest leading-tight">
                  <span className="text-white">+10 lideranças</span><br />
                  monitorando agora
                </p>
              </div>
            </motion.div>
          </div>

          <div className="order-1 lg:order-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
            >
              <div className="bg-white p-8 md:p-12 rounded-[48px] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.5)] border border-white/10 relative overflow-hidden">
                <div className="flex justify-center lg:justify-start mb-8">
                  <div className="w-20 h-20 bg-white rounded-3xl p-3 shadow-xl border border-slate-50 flex items-center justify-center">
                    <SafeLogo src={LOGO_ANCHIETA} alt="School Logo" className="w-full h-full object-contain" fallbackIcon={GraduationCap} />
                  </div>
                </div>

                {/* Watermark logo */}
                <div className="absolute -top-10 -right-10 opacity-[0.03] rotate-12 pointer-events-none">
                    <GraduationCap size={200} />
                </div>

                <div className="mb-10 text-center lg:text-left">
                  <h2 className="text-4xl font-black text-slate-900 tracking-tight italic">Bem-vindo</h2>
                  <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2 flex items-center gap-2">
                    <ShieldCheck size={14} className="text-orange-500" />
                    Acesso Restrito ao Setor Financeiro
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex bg-slate-50 p-1.5 rounded-2xl">
                    <button 
                      onClick={() => setLoginTab('login')}
                      className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${loginTab === 'login' ? 'bg-white shadow-xl shadow-slate-200/50 text-orange-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Entrar
                    </button>
                    <button 
                      onClick={() => setLoginTab('register')}
                      className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${loginTab === 'register' ? 'bg-white shadow-xl shadow-slate-200/50 text-orange-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Cadastrar
                    </button>
                  </div>

                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const target = e.target as any;
                      const email = target.email.value;
                      const password = target.password.value;
                      if (isLoggingIn) return;
                      setIsLoggingIn(true);
                      try {
                        if (loginTab === 'login') {
                          await loginWithEmail(email, password);
                        } else {
                          await registerWithEmail(email, password);
                        }
                      } catch (err: any) {
                        console.error("Auth action failed:", err);
                        if (err.code === 'auth/operation-not-allowed' || (err.message && err.message.includes('auth/operation-not-allowed'))) {
                          alert('⚠️ CONFIGURAÇÃO NECESSÁRIA:\n\nO login por E-mail/Senha está desativado no seu Firebase.\n\nPara corrigir:\n1. Vá ao Firebase Console\n2. Authentication > Sign-in Method\n3. Ative "Email/Password"\n4. Salve e tente novamente.');
                        } else if (err.code === 'auth/email-already-in-use') {
                          alert('Este e-mail já possui uma conta cadastrada.');
                        } else if (err.code === 'auth/weak-password') {
                          alert('A senha deve ter pelo menos 6 caracteres.');
                        } else {
                          alert('Falha na autenticação. Verifique os dados ou se você foi autorizado pelo administrador.');
                        }
                      } finally {
                        setIsLoggingIn(false);
                      }
                    }}
                    className="space-y-5"
                  >
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço de E-mail</label>
                      <div className="relative group">
                        <User size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-orange-500 transition-colors" />
                        <input 
                          name="email"
                          type="email" 
                          required
                          placeholder="nome@exemplo.com"
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-5 py-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha de Acesso</label>
                      <div className="relative group">
                        <Target size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-orange-500 transition-colors" />
                        <input 
                          name="password"
                          type="password" 
                          required
                          placeholder="••••••••"
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-5 py-4 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all"
                        />
                      </div>
                    </div>
                    <button 
                      type="submit"
                      disabled={isLoggingIn}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-[0.98] flex items-center justify-center gap-3 uppercase text-xs tracking-widest h-14"
                    >
                      {isLoggingIn ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
                      {loginTab === 'login' ? 'Entrar Agora' : 'Finalizar Cadastro'}
                    </button>
                  </form>

                  <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-100"></div>
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase font-black text-slate-300 tracking-[0.3em] bg-white px-6">Ou</div>
                  </div>

                  <button 
                    onClick={async () => {
                      if (isLoggingIn) return;
                      setIsLoggingIn(true);
                      try {
                        await signInWithGoogle();
                      } catch (err: any) {
                        if (err.code !== 'auth/cancelled-popup-request') {
                          console.error("Login failed:", err);
                        }
                      } finally {
                        setIsLoggingIn(false);
                      }
                    }}
                    disabled={isLoggingIn}
                    className="w-full bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] uppercase text-[10px] tracking-widest"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12 5.04c1.94 0 3.51.68 4.75 1.81l3.5-3.5C18.16 1.34 15.35 0 12 0 7.37 0 3.4 2.7 1.4 6.64l3.96 3.06C6.31 7.15 8.94 5.04 12 5.04z" />
                      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.3h6.44c-.28 1.48-1.11 2.75-2.36 3.59l3.66 2.84c2.14-1.98 3.39-4.9 3.39-8.46z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.66-2.84c-1.1.74-2.5 1.18-4.28 1.18-3.3 0-6.1-2.23-7.1-5.23L.94 17.26C3.12 21.2 7.23 24 12 24z" />
                      <path fill="#FBBC05" d="M4.9 14.2c-.25-.74-.39-1.52-.39-2.34s.14-1.6.39-2.34L.94 6.4C.34 7.6 0 9.07 0 10.61s.34 3.01.94 4.21l3.96-3.07z" />
                    </svg>
                    Conta Google corporativa
                  </button>

                  <div className="mt-8 pt-6 border-t border-slate-50 flex justify-center">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full border border-green-100">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[9px] text-green-600 font-black uppercase tracking-tighter leading-none italic">Safe Educational Node</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Developer Branding & Copyright below the card */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-8 flex flex-col md:flex-row items-center justify-between gap-6 px-6"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-white rounded-2xl p-2.5 flex items-center justify-center shadow-lg border border-slate-100">
                    <SafeLogo src={APP_LOGO} className="w-8 h-8 object-contain" alt="Nokite Logo" fallbackIcon={Target} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-white/40 tracking-[0.3em] leading-none mb-1.5">Arquitetura de Software</p>
                    <p className="text-xs font-black text-white uppercase tracking-wider">{PLATFORM_NAME}</p>
                  </div>
                </div>
                
                <div className="text-center md:text-right">
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest italic">
                      {SCHOOL_NAME} • Centro Financeiro
                  </p>
                  <p className="text-[9px] font-medium text-white/20 uppercase tracking-tighter mt-1">
                    © 2024 Todos os direitos reservados
                  </p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans selection:bg-orange-100 overflow-x-hidden relative">
      {/* Educational Geometric Background Details */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-orange-100/30 rounded-full -mr-64 -mt-64 z-0 blur-3xl pointer-events-none"></div>
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-blue-100/30 rounded-full -ml-48 -mb-48 z-0 blur-3xl pointer-events-none"></div>
      
      {/* Notebook Line Pattern */}
      <div className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, #94a3b8 31px, #94a3b8 32px)' }}></div>

      {/* Sidebar Navigation */}
      <nav className="fixed bottom-0 left-0 w-full h-20 md:h-full bg-white border-t border-slate-200 flex flex-row md:fixed md:left-0 md:top-0 md:w-64 md:border-r md:border-t-0 md:flex-col z-50 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.05)] md:shadow-none">
        
        {/* School Identity Header */}
        <div className="p-6 hidden md:flex flex-col gap-4 border-b border-slate-50 mb-2">
           <div className="flex items-center gap-3">
             <div className="flex -space-x-2">
               <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-md overflow-hidden border border-slate-100 p-1 hover:z-10 transition-transform hover:scale-110">
                  <SafeLogo src={LOGO_ANCHIETA} alt="School Logo" className="w-full h-full object-contain" fallbackIcon={GraduationCap} />
               </div>
               <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-md overflow-hidden border border-slate-100 p-1 hover:z-10 transition-transform hover:scale-110">
                  <SafeLogo src={LOGO_CPJA} alt="CPJA Logo" className="w-full h-full object-contain" fallbackIcon={School} />
               </div>
             </div>
             <div>
                <h1 className="font-black text-[14px] tracking-tighter text-slate-900 leading-tight uppercase italic">{SCHOOL_NAME}</h1>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em] mt-0.5 leading-none">Hub Financeiro</p>
              </div>
           </div>
         </div>

        <div className="flex-1 flex flex-row md:flex-col items-center justify-start md:justify-start px-4 md:px-3 md:mt-2 md:space-y-1 overflow-x-auto md:overflow-y-auto custom-scrollbar scrollbar-hide gap-4 md:gap-0">
          {(userRole === 'owner' || (userPermissions?.tabs?.includes('dashboard') ?? true)) && (
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 w-auto md:w-full p-2 md:px-4 md:py-3.5 rounded-2xl transition-all ${activeTab === 'dashboard' ? 'bg-orange-50 text-orange-600 shadow-sm border border-orange-100' : 'text-slate-400 hover:text-orange-600 hover:bg-orange-50/50'}`}
            >
              <LayoutDashboard size={20} className={activeTab === 'dashboard' ? 'text-orange-600' : 'text-slate-400'} />
              <span className="font-black text-[10px] md:text-xs uppercase tracking-widest">Painel</span>
            </button>
          )}

          {(userRole === 'owner' || userPermissions?.tabs?.includes('accounts')) && (
            <button 
              onClick={() => setActiveTab('accounts')}
              className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 w-auto md:w-full p-2 md:px-4 md:py-3.5 rounded-2xl transition-all ${activeTab === 'accounts' ? 'bg-orange-50 text-orange-600 shadow-sm border border-orange-100' : 'text-slate-400 hover:text-orange-600 hover:bg-orange-50/50'}`}
            >
              <Wallet size={20} className={activeTab === 'accounts' ? 'text-orange-600' : 'text-slate-400'} />
              <span className="font-black text-[10px] md:text-xs uppercase tracking-widest">Contas</span>
            </button>
          )}

          {(userRole === 'owner' || userPermissions?.tabs?.includes('transactions')) && (
            <button 
              onClick={() => setActiveTab('transactions')}
              className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 w-auto md:w-full p-2 md:px-4 md:py-3.5 rounded-2xl transition-all ${activeTab === 'transactions' ? 'bg-slate-900 text-white shadow-xl translate-x-1' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              <History size={20} />
              <span className="font-black text-[10px] md:text-xs uppercase tracking-widest">Extrato</span>
            </button>
          )}
          
          {(userRole === 'owner' || userPermissions?.tabs?.includes('debts')) && (
            <button 
              onClick={() => setActiveTab('debts')}
              className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 w-auto md:w-full p-2 md:px-4 md:py-3.5 rounded-2xl transition-all ${activeTab === 'debts' ? 'bg-slate-900 text-white shadow-xl translate-x-1' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              <CreditCard size={20} />
              <span className="font-black text-[10px] md:text-xs uppercase tracking-widest">Dívidas</span>
            </button>
          )}

          {(userRole === 'owner' || userPermissions?.tabs?.includes('payables')) && (
            <button 
              onClick={() => setActiveTab('payables')}
              className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 w-auto md:w-full p-2 md:px-4 md:py-3.5 rounded-2xl transition-all ${activeTab === 'payables' ? 'bg-slate-900 text-white shadow-xl translate-x-1' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              <Calendar size={20} />
              <span className="font-black text-[10px] md:text-xs uppercase tracking-widest">Agenda</span>
            </button>
          )}
          
          {(userRole === 'owner' || userPermissions?.tabs?.includes('reports')) && (
            <button 
              onClick={() => setActiveTab('reports')}
              className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 w-auto md:w-full p-2 md:px-4 md:py-3.5 rounded-2xl transition-all ${activeTab === 'reports' ? 'bg-slate-900 text-white shadow-xl translate-x-1' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              <Receipt size={20} />
              <span className="font-black text-[10px] md:text-xs uppercase tracking-widest">Relatos</span>
            </button>
          )}

          {userRole === 'owner' && (
            <button 
              onClick={() => setActiveTab('settings')}
              className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 w-auto md:w-full p-2 md:px-4 md:py-3.5 rounded-2xl transition-all ${activeTab === 'settings' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'}`}
            >
              <Users size={20} />
              <span className="font-black text-[10px] md:text-xs uppercase tracking-widest leading-none">Equipe</span>
            </button>
          )}
          <button 
            onClick={logout}
            className="flex flex-col md:flex-row md:hidden items-center justify-center gap-1 p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-all min-w-[70px] border border-red-100"
          >
            <LogOut size={20} />
            <span className="font-black text-[9px] uppercase tracking-tighter leading-none">Sair</span>
          </button>
        </div>

        <div className="hidden md:block p-4 border-t border-slate-100 mt-auto">
          <div className="flex items-center gap-3 mb-4 px-2 hidden md:flex">
             <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-lg border-2 border-white shadow-sm" />
             <div className="overflow-hidden">
               <p className="text-[10px] font-bold text-slate-800 truncate leading-none mb-0.5">{user.displayName}</p>
               <p className="text-[9px] text-slate-400 font-medium truncate leading-none">{user.email}</p>
             </div>
          </div>
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 p-2.5 text-slate-400 hover:text-red-600 transition-colors group mb-2"
          >
            <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
            <span className="font-bold text-xs hidden md:block uppercase tracking-widest">Sair</span>
          </button>

          <div className="hidden md:block pt-4 border-t border-slate-100 mt-2 bg-white/50 rounded-t-2xl -mx-4 px-4 pb-2 group/dev">
            <div className="flex flex-col items-center gap-1.5 transition-all duration-500">
               <div className="w-8 h-8 bg-white rounded-lg p-1 border border-slate-200 shadow-sm group-hover/dev:shadow-md transition-all group-hover/dev:scale-105">
                 <SafeLogo src={APP_LOGO} className="w-full h-full object-contain" alt="Nokite Logo" fallbackIcon={Target} />
               </div>
               <div className="text-center">
                 <p className="text-[6px] font-black text-slate-400 uppercase tracking-[0.5em] mb-0.5 opacity-60 leading-none">Desenvolvido por</p>
                 <h3 className="text-[9px] font-black text-slate-900 tracking-tighter uppercase italic leading-none">{PLATFORM_NAME}</h3>
               </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="pb-40 md:pb-10 md:ml-64 p-4 md:p-10 relative z-10 min-h-screen flex flex-col">
        <div className="flex-1">
        {activeTab === 'dashboard' ? (
          <div className="space-y-12">
            {/* Bons Negócios Greeting Section */}
            <div className="relative mb-12">
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-slate-900/5 rounded-full blur-2xl pointer-events-none"></div>

              <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-8 mb-12">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[9px] font-black uppercase tracking-widest rounded-full leading-none">
                      Financeiro Ativo
                    </span>
                    <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                      {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                    </span>
                  </div>
                  
                  <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter leading-none">
                    Bons negócios, <span className="text-orange-500">{user.displayName?.split(' ')[0]}!</span>
                  </h1>

                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-200">
                        <GraduationCap size={20} />
                     </div>
                     <p className="text-slate-500 font-medium text-lg leading-tight">
                      Gestão Integrada: <span className="font-black text-slate-900 italic">{SCHOOL_NAME}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <div className="bg-white/80 backdrop-blur-md border border-slate-200 p-1 rounded-2xl shadow-sm flex">
                    {[
                      { id: 'thisMonth', label: 'Mês Atual' },
                      { id: 'lastMonth', label: 'Anterior' },
                      { id: 'all', label: 'Tudo' }
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPeriodFilter(p.id as any)}
                        className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          periodFilter === p.id 
                            ? 'bg-slate-900 text-white shadow-lg shadow-slate-200 translate-y-[-1px]' 
                            : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="bg-white border-2 border-slate-900 rounded-2xl px-8 py-4 shadow-xl shadow-slate-100 relative overflow-hidden group min-w-[240px]">
                    <div className="absolute top-0 right-0 p-2 opacity-5">
                      <TrendingUp size={48} />
                    </div>
                    <span className="text-[9px] uppercase tracking-[0.25em] text-slate-400 block mb-0.5 font-black leading-none italic">Patrimônio Global</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-bold text-slate-400">R$</span>
                      <span className="text-3xl font-mono font-black text-slate-900 tracking-tighter tabular-nums leading-none">
                        {((Object.values(balances) as number[]).reduce((a, b) => a + b, 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Hero Section */}
            <div className="relative h-48 md:h-64 rounded-[2rem] overflow-hidden shadow-2xl group border-4 border-white">
                <img 
                  src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&q=80&w=2000" 
                  alt="Gestão Financeira"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover brightness-75 group-hover:scale-105 transition-transform duration-700"
                />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent flex flex-col justify-end p-8 md:p-12">
                <div className="flex items-center gap-4 mb-2">
                   <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                   <p className="text-[10px] md:text-xs font-black text-blue-400 uppercase tracking-[0.4em]">Visão Geral de Performance</p>
                </div>
                <h2 className="text-2xl md:text-4xl lg:text-5xl font-black text-white uppercase tracking-tighter leading-none mb-2">
                  Controle <span className="text-blue-500">Total</span> de Ativos
                </h2>
                <div className="flex items-center gap-6 text-white/60 text-[10px] md:text-xs font-black uppercase tracking-widest bg-white/5 backdrop-blur-md w-max px-4 py-2 rounded-lg border border-white/10">
                   <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/> Em Tempo Real</span>
                   <span className="hidden md:inline">• Segurança Bancária</span>
                   <span className="hidden md:inline">• Inteligência em Dados</span>
                </div>
              </div>
            </div>

            {/* Quick Action Bar (Consolidated) */}
            <div className="flex flex-wrap gap-3">
              {userRole === 'owner' && (
                <>
                  <button 
                    onClick={() => setShowImportModal(true)}
                    className="group bg-white border border-slate-200 text-slate-900 font-black py-4 px-8 rounded-2xl flex items-center justify-center gap-3 transition-all hover:border-orange-500 hover:shadow-lg hover:shadow-orange-50 active:scale-95 uppercase text-[10px] tracking-widest"
                  >
                    <div className="w-6 h-6 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                      <Upload size={14} />
                    </div>
                    Importar Extrato
                  </button>
                  <button 
                    onClick={() => {
                      setModalType('expense');
                      setShowAddModal(true);
                    }}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-black py-4 px-10 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-orange-100 active:scale-95 uppercase text-[10px] tracking-widest"
                  >
                    <Plus size={18} strokeWidth={4} />
                    Novo Registro
                  </button>
                  <button 
                    onClick={() => {
                      setModalType('transfer');
                      setShowAddModal(true);
                    }}
                    className="bg-slate-900 hover:bg-black text-white font-black py-4 px-8 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-slate-200 active:scale-95 uppercase text-[10px] tracking-widest"
                  >
                    <ArrowLeftRight size={16} />
                    Transferência
                  </button>
                </>
              )}
            </div>

            {/* Gráfico de Fluxo de Caixa Diário */}
            <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-8 md:p-12 shadow-xl relative overflow-hidden group">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-1">Fluxo de Caixa Mensal</h3>
                  <p className="text-xs text-slate-400 font-medium tracking-tight">
                    Histórico diário de entradas e saídas ({periodFilter === 'all' ? 'Tudo' : periodFilter === 'thisMonth' ? 'Mês Atual' : 'Mês Passado'})
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entradas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saídas</span>
                  </div>
                </div>
              </div>

              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="day" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                      labelStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '4px', color: '#64748b' }}
                      formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, '']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="income" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorIncome)" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="expense" 
                      stroke="#ef4444" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorExpense)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Entradas Totais do Período */}
              <div className="bg-white border-2 border-slate-900 rounded-3xl p-8 text-slate-800 shadow-[8px_8px_0px_0px_rgba(16,185,129,1)] hover:shadow-[12px_12px_0px_0px_rgba(16,185,129,1)] transition-all relative overflow-hidden group">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-2 italic">Total Entradas ({periodFilter === 'all' ? 'Histórico' : periodFilter === 'thisMonth' ? 'Mês' : 'Anterior'})</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-bold text-slate-400">R$</span>
                  <p className="text-3xl font-mono font-black tracking-tighter text-slate-900">
                    {periodMetrics.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Soma de todos os recebimentos</p>
                </div>
              </div>

              {/* Saídas Totais do Período */}
              <div className="bg-white border-2 border-slate-900 rounded-3xl p-8 text-slate-800 shadow-[8px_8px_0px_0px_rgba(239,68,68,1)] hover:shadow-[12px_12px_0px_0px_rgba(239,68,68,1)] transition-all relative overflow-hidden group">
                <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.3em] mb-2 italic">Total Saídas ({periodFilter === 'all' ? 'Histórico' : periodFilter === 'thisMonth' ? 'Mês' : 'Anterior'})</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-bold text-slate-400">R$</span>
                  <p className="text-3xl font-mono font-black tracking-tighter text-slate-900">
                    {periodMetrics.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total de despesas liquidadas</p>
                </div>
              </div>

              {/* Resultado do Período */}
              <div className={`rounded-3xl p-8 text-white shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] transition-all relative overflow-hidden group border-2 border-slate-900 ${periodMetrics.net >= 0 ? 'bg-slate-900' : 'bg-red-900'}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2 italic opacity-60">Fluxo Líquido</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-bold opacity-40">R$</span>
                  <p className="text-3xl font-mono font-black tracking-tighter">
                    {periodMetrics.net.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-2">
                   <div className={`w-1.5 h-1.5 rounded-full ${periodMetrics.net >= 0 ? 'bg-emerald-400 animate-pulse' : 'bg-white h-0.5 w-3'}`} />
                   <p className="text-[9px] font-black uppercase tracking-widest opacity-60">Superavit / Deficit</p>
                </div>
              </div>

              {/* Consolidated Total Balance */}
              <div className="bg-emerald-600 rounded-3xl p-8 text-white shadow-[8px_8px_0px_0px_rgba(5,150,105,1)] overflow-hidden relative group border-2 border-emerald-500">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2 opacity-80 italic">Patrimônio Global</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-bold opacity-40">R$</span>
                  <p className="text-3xl font-mono font-black tracking-tighter">
                    {(Object.values(balances) as number[]).reduce((acc: number, b: number) => acc + b, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <p className="text-[9px] mt-4 font-black uppercase opacity-60 leading-tight">Liquidez imediata em todas as contas</p>
              </div>
            </div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Receita Acadêmica - Tuition Category */}
                {(userRole === 'owner' || (userPermissions?.categories?.includes('tuition') ?? true)) && (
                  <div className="bg-orange-500 rounded-3xl p-10 text-white shadow-[0_20px_50px_rgba(249,115,22,0.3)] overflow-hidden relative group border-2 border-orange-400">
                    <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
                      <GraduationCap size={80} />
                    </div>
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] mb-2 opacity-80 italic">Receita Acadêmica</p>
                    <p className="text-3xl font-mono font-black tracking-tighter">R$ {(schoolMetrics.tuition || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] mt-4 font-black uppercase opacity-60">Mensalidades CPJA</p>
                  </div>
                )}
                
                {/* Folha de Pagamento - Payroll Category */}
                {(userRole === 'owner' || (userPermissions?.categories?.includes('payroll') ?? true)) && (
                  <div className="bg-slate-900 rounded-3xl p-10 text-white shadow-[0_20px_50px_rgba(15,23,42,0.3)] overflow-hidden relative group border-2 border-slate-700">
                    <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
                      <Users size={80} />
                    </div>
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] mb-2 opacity-60 italic">Folha de Pagamento</p>
                    <p className="text-3xl font-mono font-black tracking-tighter text-orange-400">R$ {(schoolMetrics.payroll || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] mt-4 font-black uppercase opacity-40">Salários e Encargos</p>
                  </div>
                )}

                {/* Eventos Escolares - Events Category */}
                {(userRole === 'owner' || (userPermissions?.categories?.includes('events') ?? true)) && (
                  <div className="bg-white border-2 border-slate-900 rounded-3xl p-10 text-slate-800 shadow-[12px_12px_0px_0px_rgba(15,23,42,1)] hover:shadow-[16px_16px_0px_0px_rgba(15,23,42,1)] transition-all group overflow-hidden relative">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2 italic">Eventos Escolares</p>
                    <p className="text-3xl font-mono font-black tracking-tighter text-blue-600">R$ {(schoolMetrics.events || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <div className="mt-6 h-2 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                       <div className="h-full bg-blue-500 w-2/3"></div>
                    </div>
                  </div>
                )}

                {/* Always show debt but could be filtered if we had debt categories */}
                <div className="bg-white border-2 border-slate-900 rounded-3xl p-10 text-slate-800 shadow-[12px_12px_0px_0px_rgba(15,23,42,1)] hover:shadow-[16px_16px_0px_0px_rgba(15,23,42,1)] transition-all group overflow-hidden relative">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2 italic">Passivo Exposto</p>
                  <p className="text-3xl font-mono font-black tracking-tighter text-red-500">R$ {schoolMetrics.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-[9px] text-red-500 font-black uppercase mt-4 bg-red-50 px-2 py-1 rounded w-max">Atenção Crítica</p>
                </div>
              </div>



            {/* Reconciliation Alarms Footer-style section */}
            {inconsistencies.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-red-50 border border-red-100 rounded-2xl p-6 shadow-sm items-center"
              >
                <div className="md:col-span-1 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-red-200 flex items-center justify-center text-red-700 text-xl font-black">
                    !
                  </div>
                </div>
                <div className="md:col-span-8">
                  <h3 className="text-sm font-bold text-red-800 uppercase tracking-widest mb-1">Painel de Alerta de Mistura de Caixa</h3>
                  <p className="text-xs text-red-600 font-medium">
                    Identificamos <strong>{inconsistencies.length} transações</strong> onde fundos institucionais foram utilizados para fins pessoais (ou vice-versa). 
                    A conciliação é recomendada para evitar distorções no relatório financeiro.
                  </p>
                </div>
                <div className="md:col-span-3 flex justify-end">
                  <button 
                    onClick={() => setActiveTab('transactions')}
                    className="bg-white border border-red-200 text-red-700 px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-red-50 transition-colors shadow-sm"
                  >
                    Corrigir Agora
                  </button>
                </div>
              </motion.div>
            )}

            {/* Distributed Visuals */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                  <div>
                    <h3 className="font-bold text-lg text-slate-800 tracking-tight">Análise de Fluxo Geométrico</h3>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-1">Distribuição semanal de entradas e saídas</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {CATEGORIES.map(c => (
                      <div key={c.value} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-sm ${c.color}`} />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                    <div className="h-64 flex items-end gap-3 px-4 overflow-hidden">
                      {Array.from({ length: 24 }).map((_, i) => (
                        <div key={i} className="flex-1 flex flex-col gap-1 group cursor-pointer h-full justify-end">
                           <div className="flex flex-col-reverse gap-1 opacity-40 group-hover:opacity-100 transition-all group-hover:scale-y-110 origin-bottom duration-500">
                              <div className="w-full bg-blue-600 rounded-t-lg shadow-[0_0_20px_rgba(37,99,235,0.4)]" style={{ height: (10 + Math.random() * 80) + 'px' }} />
                              <div className="w-full bg-emerald-500 rounded-lg shadow-[0_0_20px_rgba(16,185,129,0.4)]" style={{ height: (5 + Math.random() * 40) + 'px' }} />
                              <div className="w-full bg-slate-900 rounded-lg" style={{ height: (2 + Math.random() * 20) + 'px' }} />
                           </div>
                        </div>
                      ))}
                    </div>
                <div className="flex justify-between px-4 mt-4 py-3 border-t border-slate-50">
                   {['01', '05', '10', '15', '20', '25', '30'].map(d => (
                     <span key={d} className="text-[10px] font-mono font-bold text-slate-300">{d}.vial</span>
                   ))}
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="bg-slate-800 rounded-3xl p-8 text-white flex flex-col justify-between h-72 relative shadow-2xl overflow-hidden border-t-4 border-amber-400">
                  <div className="absolute top-0 left-0 w-32 h-32 bg-slate-700/50 rounded-full -ml-16 -mt-16"></div>
                  <div className="relative z-10">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4">Relatório de Saúde</h3>
                    <p className="text-xs text-amber-200 italic mb-2 tracking-wide">Consolidação Bancária Escola</p>
                    <p className="text-4xl font-mono font-bold">R$ {(balances.bb_corrente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="relative z-10 pt-6">
                    <div className="flex justify-between items-end">
                       <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Performance</div>
                       <div className="text-xl font-mono font-bold text-emerald-400">92%</div>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
                       <div className="h-full bg-amber-400" style={{ width: '92%' }}></div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 text-blue-200">
                    <PieChart size={40} />
                  </div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-3">Auditoria Escolar</h4>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                        <GraduationCap size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-blue-900 uppercase">Gestão Acadêmica</p>
                        <p className="text-[9px] text-blue-500 font-medium">Fluxo de mensalidades mapeado</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-white">
                        <BookOpen size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-800 uppercase">Insumos/Materiais</p>
                        <p className="text-[9px] text-slate-500 font-medium">Controle de estoque financeiro</p>
                      </div>
                    </div>
                  </div>
                </div>

              <div className="flex flex-col gap-4">
                {userRole !== 'viewer' && (
                  <button 
                    onClick={() => setShowAddModal(true)}
                    className="w-full bg-white border border-slate-200 p-6 rounded-2xl flex items-center justify-between hover:border-blue-600 transition-all group"
                  >
                    <div className="text-left">
                      <h4 className="font-bold text-slate-800 text-sm">Conciliar Contas</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Balanceamento de caixa</p>
                    </div>
                    <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <ArrowRight size={20} />
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        ) : activeTab === 'accounts' ? (
          <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase italic">Contas Financeiras</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Gestão de silos e separação de capital</p>
              </div>
              {userRole === 'owner' && (
                <button 
                  onClick={() => {
                    setEditingAccount(null);
                    setShowAccountModal(true);
                  }}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-orange-100 flex items-center gap-2 transition-all active:scale-95"
                >
                  <Plus size={18} />
                  Nova Conta
                </button>
              )}
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {accounts.map(acc => (
                <motion.div 
                  key={acc.id}
                  layoutId={`acc-${acc.id}`}
                  className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 relative overflow-hidden group"
                >
                  <div className={`absolute top-0 left-0 w-full h-2 ${acc.color || 'bg-slate-200'}`} />
                  
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-3 bg-slate-50 rounded-xl text-slate-400">
                      <Wallet size={24} />
                    </div>
                    {userRole === 'owner' && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setEditingAccount(acc);
                            setShowAccountModal(true);
                          }}
                          className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          <Pencil size={18} />
                        </button>
                        <button 
                          onClick={() => deleteAccount(acc.id)}
                          className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-1">{acc.name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">Saldo Atual</p>
                    <p className="text-3xl font-black font-mono tracking-tighter text-slate-900 leading-none">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(balances[acc.id] || 0)}
                    </p>
                  </div>

                  <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex flex-col">
                       <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Status</span>
                       <span className="text-[10px] font-bold text-green-500 uppercase tracking-tighter leading-none">Ativa</span>
                    </div>
                    <div className="text-right">
                       <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Última Ref.</span>
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter leading-none">{new Date(acc.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {accounts.length === 0 && (
              <div className="bg-slate-50 rounded-[3rem] p-20 text-center border-2 border-dashed border-slate-200">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                  <Wallet size={32} className="text-slate-200" />
                </div>
                <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest mb-2">Nenhuma conta ativa</h3>
                <p className="text-sm text-slate-300 max-w-xs mx-auto font-medium">Configure suas contas para começar a separar o dinheiro da empresa, pessoal e outras áreas.</p>
              </div>
            )}
          </div>
        ) : activeTab === 'transactions' ? (
          <div className="space-y-12">
            <header className={`flex flex-col xl:flex-row xl:items-end justify-between gap-6`}>
              <div className="flex items-center gap-6">
                <div className="hidden md:flex w-20 h-20 bg-white border-2 border-slate-900 rounded-3xl items-center justify-center p-0 overflow-hidden shadow-xl relative">
                   <img 
                      src="https://images.unsplash.com/photo-1544377193-33dcf4d68fb5?auto=format&fit=crop&q=80&w=400" 
                      alt="Extrato"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover opacity-90"
                   />
                   <div className="absolute inset-0 bg-slate-900/10" />
                   <History className="absolute text-slate-900 drop-shadow-lg" size={28} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Fluxo Contínuo Ativo</span>
                  </div>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tighter mb-1 uppercase italic">Extrato de Auditoria</h1>
                  <p className="text-slate-500 font-medium font-serif">Histórico imutável de movimentações financeiras.</p>
                </div>
              </div>
              
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
                <div className="bg-white border-2 border-slate-900 p-1 rounded-2xl flex shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                  {[
                    { id: 'thisMonth', label: 'Mês Atual' },
                    { id: 'lastMonth', label: 'Anterior' },
                    { id: 'all', label: 'Tudo' }
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPeriodFilter(p.id as any)}
                      className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${periodFilter === p.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                
                <div className="bg-white border border-slate-200 px-6 py-3 rounded-xl shadow-sm flex flex-col justify-center">
                  <span className="text-[8px] uppercase tracking-[0.2em] text-slate-400 block mb-0.5 font-black leading-none">Saldo consolidado</span>
                  <span className="text-lg font-mono font-bold text-slate-800 leading-none">
                    R$ {((Object.values(balances) as number[]).reduce((a, b) => a + b, 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                
                {userRole === 'owner' && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setShowImportModal(true)}
                      className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-600 font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-all hover:border-orange-600 hover:text-orange-600 shadow-sm active:scale-95 uppercase text-[10px] tracking-widest"
                    >
                      <Upload size={16} />
                      Importar
                    </button>
                    <button 
                      onClick={() => {
                        setModalType('expense');
                        setShowAddModal(true);
                      }}
                      className="flex-1 md:flex-none bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 px-8 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-orange-100 active:scale-95 uppercase text-xs tracking-widest"
                    >
                      <Plus size={20} strokeWidth={3} />
                      Novo
                    </button>
                  </div>
                )}
              </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-center justify-between mt-8">
               <div className="relative flex-grow max-w-2xl group">
                 <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                   <Search className="text-slate-300 group-focus-within:text-orange-600 transition-colors" size={20} />
                 </div>
                 <input 
                  type="text" 
                  placeholder="LOCALIZAR LANÇAMENTO..." 
                  className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 ring-orange-50 transition-all text-xs font-bold tracking-widest placeholder:text-slate-300 uppercase"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                 />
               </div>
               <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
                  <button 
                    onClick={() => setCategoryFilter('all')}
                    className={`px-5 py-2.5 rounded-lg text-[10px] font-black tracking-[0.15em] transition-all border ${categoryFilter === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}
                  >
                    Geral
                  </button>
                  {CATEGORIES.map(c => (
                    <button 
                      key={c.value}
                      onClick={() => setCategoryFilter(c.value)}
                      className={`px-5 py-2.5 rounded-lg text-[10px] font-black tracking-[0.15em] transition-all border ${categoryFilter === c.value ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}
                    >
                      {c.label.toUpperCase()}
                    </button>
                  ))}
               </div>
            </div>

            <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-[12px_12px_0px_0px_rgba(15,23,42,1)] overflow-hidden">
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 border-b border-slate-800">
                        <th className="px-8 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Dossiê de Registro</th>
                        <th className="px-8 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Silo (Fluxo)</th>
                        <th className="px-8 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Origem do Ativo</th>
                        <th className="px-8 py-6 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] text-right">Impacto Nominal</th>
                        <th className="px-8 py-6 w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {periodFilteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-8 py-20 text-center">
                            <div className="flex flex-col items-center">
                              <History size={48} className="text-slate-100 mb-4" />
                              <p className="text-sm font-black text-slate-300 uppercase tracking-widest italic">Nenhuma movimentação localizada</p>
                              <p className="text-[10px] text-slate-200 font-bold uppercase tracking-widest mt-2">Ajuste os filtros ou adicione um novo registro.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        periodFilteredTransactions.map(t => (
                          <tr key={t.id} className="hover:bg-blue-50/30 transition-colors group">
                          <td className="px-8 py-6 border-r border-slate-100">
                            <div className="flex flex-col">
                              <span className="font-black text-slate-900 text-sm mb-0.5 tracking-tight uppercase italic">{t.description}</span>
                              <span className="text-[10px] text-slate-400 font-mono font-black border-l-2 border-slate-200 pl-2">
                                {(() => {
                                  try {
                                    const dStr = (t.date || '').includes('/') ? normalizeDate(t.date) : (t.date || '');
                                    const dObj = new Date(dStr + 'T12:00:00');
                                    return isNaN(dObj.getTime()) ? (t.date || '---') : dObj.toLocaleDateString('pt-BR');
                                  } catch (e) {
                                    return t.date || '---';
                                  }
                                })()}
                              </span>
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <span className={`px-4 py-1.5 rounded-lg text-[10px] font-black text-white uppercase tracking-widest inline-block shadow-sm ${CATEGORIES.find(c => c.value === t.category)?.color}`}>
                              {CATEGORIES.find(c => c.value === t.category)?.label}
                            </span>
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full w-max border border-slate-100">
                                {t.type === 'transfer' ? (
                                  <span className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                    {accounts.find(f => f.id === t.accountId)?.name || t.accountId}
                                    <ArrowRight size={12} className="text-slate-300" />
                                    {accounts.find(f => f.id === t.toAccountId)?.name || t.toAccountId}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${t.type === 'income' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                    {accounts.find(f => f.id === t.accountId)?.name || t.accountId}
                                  </span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className={`px-8 py-6 text-right font-mono font-black text-base ${t.type === 'income' ? 'text-emerald-600' : t.type === 'transfer' ? 'text-orange-600' : 'text-slate-900'}`}>
                            <div className="flex flex-col items-end">
                               <span className="text-[9px] uppercase tracking-widest opacity-40 font-sans mb-1">{t.type === 'income' ? 'Entrada' : t.type === 'transfer' ? 'Transferência' : 'Saída'}</span>
                               <span>{t.type === 'income' ? '+' : t.type === 'transfer' ? '⇄' : '-'} R$ {t.amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            {userRole === 'owner' && (
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => {
                                    setEditingTransaction(t);
                                    setModalType(t.type);
                                    setShowAddModal(true);
                                  }}
                                  className="p-2 text-slate-300 hover:text-orange-600 transition-colors"
                                >
                                  <Pencil size={16} />
                                </button>
                                <button 
                                  onClick={() => setConfirmDelete(t.id)}
                                  className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )))}
                    </tbody>
                 </table>
               </div>
            </div>
          </div>
        ) : activeTab === 'debts' ? (
          <div className="space-y-10">
            {/* Hero Banner for Debts */}
            <div className="relative h-40 md:h-56 rounded-[2rem] overflow-hidden shadow-2xl group border-4 border-white mb-8">
                <img 
                  src="https://images.unsplash.com/photo-1554224155-1697414265d7?auto=format&fit=crop&q=80&w=1200" 
                  alt="Gestão de Passivos"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover brightness-50 group-hover:scale-105 transition-transform duration-700"
                />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent flex flex-col justify-end p-8 md:p-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-1 h-4 bg-orange-500 rounded-full" />
                  <p className="text-[10px] font-black text-orange-400 uppercase tracking-[0.4em]">Engenharia de Crédito</p>
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter leading-none italic">
                  Mapa de <span className="text-orange-500">Compromissos</span>
                </h2>
              </div>
            </div>

            {/* Header section with Bento style summary */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 mb-2"
                >
                  <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-orange-100">
                    <CreditCard size={20} strokeWidth={2.5} />
                  </div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Mapa de Passivos</h2>
                </motion.div>
                <p className="text-slate-500 font-medium font-serif max-w-md">Gestão estratégica de compromissos financeiros de longo prazo e crédito.</p>
              </div>
              {userRole !== 'viewer' && (
                <button 
                  onClick={() => setShowDebtModal(true)}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-black py-4 px-10 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-2xl shadow-slate-200 active:scale-95 uppercase text-[10px] tracking-[0.2em]"
                >
                  <Plus size={20} strokeWidth={3} />
                  Anotar Nova Dívida
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Primary Summary Bento Card */}
              <div className="md:col-span-2 bg-white border-2 border-slate-900 rounded-[2.5rem] p-10 relative overflow-hidden shadow-[12px_12px_0px_0px_rgba(15,23,42,1)]">
                <div className="absolute top-0 right-0 m-8 opacity-5">
                   <Target size={120} />
                </div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-8">Consolidado Devedor</h3>
                <div className="grid grid-cols-2 gap-8 relative z-10">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dívidas Ativas</p>
                    <p className="text-2xl font-mono font-bold text-slate-300">
                      {debts.filter(d => d.status === 'active').length} Contratos
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Total Quitado</p>
                    <p className="text-2xl font-mono font-bold text-emerald-600">
                      R$ {(debts.filter(d => d.status === 'paid').reduce((acc, d) => acc + d.totalAmount, 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <div className="mt-12">
                   <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">Exposição Atual</p>
                   <div className="flex items-baseline gap-2">
                     <span className="text-4xl font-mono font-black text-slate-900">
                       R$ {schoolMetrics.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                     </span>
                     <span className="text-xs font-bold text-red-400 uppercase tracking-tighter">Em aberto</span>
                   </div>
                </div>
              </div>

              {/* Composition Bento Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-[2.5rem] p-8 flex flex-col justify-between">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-6">Composição Ativa</h3>
                <div className="space-y-6">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                         <span className="text-[11px] font-bold text-slate-600 uppercase">Cartões</span>
                      </div>
                      <span className="text-xs font-mono font-black">{debts.filter(d => d.status === 'active' && d.type === 'card').length}</span>
                   </div>
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                         <span className="text-[11px] font-bold text-slate-600 uppercase">Empréstimos</span>
                      </div>
                      <span className="text-xs font-mono font-black">{debts.filter(d => d.status === 'active' && d.type === 'loan').length}</span>
                   </div>
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                         <span className="text-[11px] font-bold text-slate-600 uppercase">Outros</span>
                      </div>
                      <span className="text-xs font-mono font-black">{debts.filter(d => d.status === 'active' && d.type === 'other').length}</span>
                   </div>
                </div>
                <div className="mt-8 pt-6 border-t border-slate-200">
                   <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">Foco na amortização de juros altos primeiro.</p>
                </div>
              </div>

              {/* Health Score Bento Card */}
              <div className="bg-orange-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                <h3 className="text-[10px] font-black text-orange-200 uppercase tracking-[0.3em] mb-8">Nível de Crédito</h3>
                <div className="flex flex-col items-center justify-center py-4">
                   <div className="text-5xl font-mono font-black mb-1">
                     {Math.max(0, Math.min(100, Math.round(100 - (schoolMetrics.totalDebt / 50000 * 100))))}%
                   </div>
                   <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Segurança de Caixa</span>
                </div>
              </div>
            </div>

            {/* Debts List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {debts.length === 0 ? (
                <div className="md:col-span-2 bg-slate-50 border-4 border-dashed border-slate-200 rounded-[3rem] p-24 text-center group">
                  <div className="w-48 h-48 mx-auto mb-8 bg-white rounded-full flex items-center justify-center border-4 border-slate-100 overflow-hidden shadow-2xl">
                     <img 
                       src="https://images.unsplash.com/photo-1579621909532-47578f97b11a?auto=format&fit=crop&q=80&w=400" 
                       alt="Nenhuma dívida" 
                       referrerPolicy="no-referrer"
                       className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                     />
                  </div>
                  <h4 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2 italic">Horizonte Limpo</h4>
                  <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] max-w-xs mx-auto">Sua empresa não possui compromissos financeiros de longo prazo registrados no momento.</p>
                </div>
              ) : (
                [...debts].sort((a,b) => b.totalAmount - a.totalAmount).map(debt => (
                  <div key={debt.id} className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-xl shadow-slate-100/50 hover:shadow-2xl hover:shadow-orange-100/40 transition-all group relative border-b-4 border-b-slate-900">
                    <div className="flex items-start justify-between mb-8">
                      <div className="flex items-center gap-5">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner ${debt.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-500'}`}>
                          {debt.type === 'card' ? <CreditCard size={28} /> : debt.type === 'loan' ? <Landmark size={28} /> : <FileText size={28} />}
                        </div>
                        <div>
                          <h4 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter mb-1">{debt.description}</h4>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                               {debt.type === 'card' ? 'Crédito Rotativo' : debt.type === 'loan' ? 'Empréstimo Bancário' : 'Outra Provisão'}
                            </span>
                            {debt.dueDate && (
                              <>
                                <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${new Date(debt.dueDate) < new Date() && debt.status !== 'paid' ? 'text-red-500' : 'text-slate-400'}`}>
                                  Vence em: {new Date(debt.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setConfirmDeleteDebt(debt.id)}
                        className="p-3 text-slate-200 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-10">
                       <div className="p-5 rounded-2xl bg-orange-50 border border-orange-100">
                          <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-2 italic">Saldo devedor</p>
                          <p className="text-xl font-mono font-bold text-orange-600">R$ {debt.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                       </div>
                       <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-center">
                          {debt.installmentValue ? (
                            <>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Valor Parcela</p>
                              <p className="text-sm font-mono font-bold text-slate-700">R$ {debt.installmentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic italic">Amortizado</p>
                              <p className="text-sm font-mono font-bold text-emerald-600">R$ {debt.paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </>
                          )}
                       </div>
                    </div>

                    {debt.remainingInstallments && (
                       <div className="mb-8 p-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                          <div className="flex justify-between items-center px-1">
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Plano de Pagamento</span>
                             <span className="text-[10px] font-mono font-black text-slate-600">Faltam {debt.remainingInstallments} de {debt.installments || '?'}</span>
                          </div>
                          <div className="mt-3 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                             <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${100 - (debt.remainingInstallments / (debt.installments || debt.remainingInstallments)) * 100}%` }}
                                className="h-full bg-orange-500 rounded-full"
                             />
                          </div>
                       </div>
                    )}

                    {userRole !== 'viewer' && (
                      <div className="mt-6 flex gap-3">
                        <button 
                          onClick={async () => {
                            const newVal = prompt('Reduzir saldo devedor em (R$):', '0');
                            if (newVal !== null) {
                              const val = parseFloat(newVal.replace(',', '.'));
                              if (isNaN(val) || val <= 0) {
                                alert("Por favor, insira um valor válido maior que zero.");
                                return;
                              }
                              
                              // Seleção de conta simplificada por prompt para não quebrar o fluxo mobile
                              const accountNames = accounts.map((a, i) => `${i + 1}: ${a.name}`).join('\n');
                              const accChoice = prompt(`Pagar com qual conta?\n\n${accountNames}\n\nDigite o número:`, '1');
                              
                              const accIdx = parseInt(accChoice || '1') - 1;
                              const selectedAccount = accounts[accIdx];
                              
                              if (!selectedAccount) {
                                alert("Conta não localizada. Pagamento cancelado.");
                                return;
                              }

                              const reduced = Math.max(0, debt.totalAmount - val);
                              const remaining = debt.remainingInstallments ? Math.max(0, debt.remainingInstallments - 1) : undefined;
                              
                              try {
                                // Criar transação de saída
                                await addTransaction({
                                  date: new Date().toISOString().split('T')[0],
                                  description: `PARCELA: ${debt.description}`,
                                  amount: val,
                                  type: 'expense',
                                  category: 'folha', // ou 'outros', mas folha/manutencao costuma ser divida
                                  accountId: selectedAccount.id,
                                });

                                await updateDebt(debt.id, { 
                                   totalAmount: reduced,
                                   remainingInstallments: remaining,
                                   status: reduced <= 0 ? 'paid' : 'active'
                                });
                                
                                addNotification(`Parcela de R$ ${val} paga com ${selectedAccount.name}`, "success");
                              } catch (error) {
                                console.error(error);
                              }
                            }
                          }}
                          className="flex-1 py-4 bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-xl shadow-slate-200 active:scale-95 flex items-center justify-center gap-2"
                        >
                          <CreditCard size={14} />
                          Pagar Parcela
                        </button>
                        <button 
                          onClick={() => {
                            const confirmPay = window.confirm(`Deseja quitar totalmente esta dívida?\n\nValor: R$ ${debt.totalAmount.toLocaleString('pt-BR')}`);
                            if (!confirmPay) return;

                            const accountNames = accounts.map((a, i) => `${i + 1}: ${a.name}`).join('\n');
                            const accChoice = prompt(`Pagar com qual conta?\n\n${accountNames}\n\nDigite o número:`, '1');
                            const accIdx = parseInt(accChoice || '1') - 1;
                            const selectedAccount = accounts[accIdx];

                            if (!selectedAccount) {
                              alert("Conta não localizada. Quitação cancelada.");
                              return;
                            }

                            (async () => {
                              try {
                                await addTransaction({
                                  date: new Date().toISOString().split('T')[0],
                                  description: `QUITAÇÃO: ${debt.description}`,
                                  amount: debt.totalAmount,
                                  type: 'expense',
                                  category: 'folha',
                                  accountId: selectedAccount.id,
                                });
                                await updateDebt(debt.id, { totalAmount: 0, status: 'paid', remainingInstallments: 0 });
                                addNotification(`Dívida quitada com ${selectedAccount.name}`, "success");
                              } catch (e) { console.error(e); }
                            })();
                          }}
                          className="px-6 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-100 transition-all flex items-center justify-center"
                          title="Quitar"
                        >
                          <CheckCircle2 size={20} strokeWidth={3} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeTab === 'payables' ? (
          <div className="space-y-6 md:y-8 px-0 md:px-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 px-4 md:px-0">
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mb-1 md:mb-2 italic uppercase">Agenda de Contas</h2>
                <p className="text-slate-500 text-xs md:text-sm font-medium font-serif">Compromissos financeiros agendados</p>
              </div>
              {userRole === 'owner' && (
                <button 
                  onClick={() => {
                    setEditingBill(null);
                    setShowBillModal(true);
                  }}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 md:py-4 px-6 md:px-8 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-orange-100 active:scale-95 uppercase text-[10px] md:text-xs tracking-widest w-full md:w-auto"
                >
                  <Plus size={18} md:size={20} strokeWidth={3} />
                  Agendar Pagamento
                </button>
              )}
            </div>

            {/* Resume / Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mx-4 md:mx-0">
               <div className="bg-white border-2 border-slate-900 rounded-[2rem] p-8 relative overflow-hidden shadow-[8px_8px_0px_0px_rgba(15,23,42,1)]">
                 <div className="flex items-center gap-3 mb-4">
                   <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                     <Calendar size={18} />
                   </div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Previsão de Saída (Mês Atual)</p>
                 </div>
                 <p className="text-3xl font-mono font-black text-slate-900 tracking-tighter">
                   R$ {agendaMetrics.plannedThisMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                 </p>
                 <p className="text-[9px] mt-4 font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                   Baseado em todas as contas agendadas <br /> para o mês de {new Date().toLocaleDateString('pt-BR', { month: 'long' })}.
                 </p>
               </div>

               <div className="bg-slate-900 border-2 border-slate-900 rounded-[2rem] p-8 relative overflow-hidden shadow-[8px_8px_0px_0px_rgba(249,115,22,1)]">
                 <div className="flex items-center gap-3 mb-4">
                   <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-orange-500">
                     <TrendingUp size={18} />
                   </div>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Executado (Meses Anteriores)</p>
                 </div>
                 <p className="text-3xl font-mono font-black text-white tracking-tighter">
                   R$ {agendaMetrics.spentPreviousMonths.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                 </p>
                 <p className="text-[9px] mt-4 font-black text-slate-500 uppercase tracking-widest leading-relaxed">
                   Soma de todas as despesas liquidadas <br /> antes do início deste mês.
                 </p>
               </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:gap-8">
              {authorizedBills.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] md:rounded-[3rem] p-12 md:p-24 text-center group mx-4 md:mx-0">
                  <div className="w-32 h-32 md:w-48 md:h-48 mx-auto mb-6 md:mb-8 bg-white rounded-full flex items-center justify-center border-2 md:border-4 border-slate-100 overflow-hidden shadow-xl md:shadow-2xl">
                     <img 
                       src="https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&q=80&w=400" 
                       alt="Sem contas" 
                       referrerPolicy="no-referrer"
                       className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                     />
                  </div>
                  <h4 className="text-lg md:text-xl font-black text-slate-800 uppercase tracking-tighter mb-2 italic">Agenda Livre</h4>
                  <p className="text-slate-400 font-black uppercase text-[8px] md:text-[10px] tracking-[0.2em] max-w-xs mx-auto">Nenhum compromisso pendente encontrado no seu nível.</p>
                </div>
              ) : (
                Object.entries(authorizedBills.reduce((acc, bill) => {
                  const date = bill.dueDate;
                  if (!acc[date]) acc[date] = [];
                  acc[date].push(bill);
                  return acc;
                }, {} as Record<string, Bill[]>)).sort(([a], [b]) => a.localeCompare(b)).map(([date, dayBills]: [string, Bill[]]) => (
                  <div key={date} className="relative pl-12 md:pl-20 pr-4 md:pr-0">
                    <div className="absolute left-[23px] md:left-[35px] top-0 bottom-0 w-px bg-slate-200"></div>
                    <div className="absolute left-0 top-0 w-12 h-12 md:w-18 md:h-18 flex flex-col items-center justify-center bg-white border-2 border-slate-200 rounded-xl md:rounded-2xl shadow-sm z-10 text-slate-800">
                       <span className="text-[7px] md:text-[9px] font-black uppercase tracking-tight opacity-50 leading-none">{new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short' })}</span>
                       <span className="text-base md:text-2xl font-mono font-black border-y border-slate-100 my-0.5 w-full text-center">{new Date(date + 'T00:00:00').getDate()}</span>
                       <span className="text-[6px] md:text-[8px] font-black uppercase tracking-widest opacity-40 leading-none truncate w-full text-center px-1">{new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
                    </div>

                    <div className="space-y-3 md:space-y-4">
                      {dayBills.map(bill => (
                        <div key={bill.id} className={`bg-white border rounded-2xl md:rounded-[1.5rem] p-4 md:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 transition-all hover:shadow-md ${bill.status === 'paid' ? 'border-emerald-100 bg-emerald-50/10 opacity-60' : 'border-slate-100'}`}>
                          <div className="flex items-center gap-4 md:gap-6">
                            <div className={`w-12 h-12 md:w-14 md:h-14 shrink-0 rounded-xl md:rounded-2xl flex items-center justify-center ${CATEGORIES.find(c => c.value === bill.category)?.color} text-white shadow-lg`}>
                               {bill.status === 'paid' ? <CheckCircle2 size={20} md:size={24} /> : <AlertCircle size={20} md:size={24} />}
                            </div>
                            <div className="min-w-0">
                               <div className="flex flex-wrap items-center gap-2 mb-0.5 md:mb-1">
                                 <h4 className="font-black text-slate-800 uppercase tracking-tight text-xs md:text-sm truncate">{bill.description}</h4>
                                 {bill.status === 'paid' && (
                                   <span className="bg-emerald-500 text-white text-[7px] md:text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">Pago</span>
                                 )}
                                 <span className={`text-[7px] md:text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0 ${bill.billType === 'variable' ? 'bg-orange-100 text-orange-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                   {bill.billType === 'variable' ? 'Passageira' : 'Fixa'}
                                 </span>
                               </div>
                               <div className="flex items-center gap-2 md:gap-3 overflow-hidden text-ellipsis whitespace-nowrap">
                                 <span className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{CATEGORIES.find(c => c.value === bill.category)?.label}</span>
                                 <span className="hidden md:inline w-1 md:w-1.5 h-1 md:h-1.5 bg-slate-200 rounded-full"></span>
                                 <span className="text-[8px] md:text-[10px] font-mono font-bold text-slate-400 md:text-slate-500 uppercase">{new Date(bill.dueDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
                               </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between md:justify-end gap-3 md:gap-12 pt-3 md:pt-0 border-t md:border-t-0 border-slate-50 mt-1 md:mt-0">
                             <div className="text-left md:text-right">
                               <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5 md:mb-1 leading-none">Valor Previsto</p>
                               <p className={`text-lg md:text-xl font-mono font-black leading-none ${bill.status === 'paid' ? 'text-emerald-600' : 'text-slate-800'}`}>
                                 R$ {bill.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                               </p>
                             </div>

                             {userRole === 'owner' && (
                               <div className="flex items-center gap-1 md:gap-2 shrink-0">
                                 {bill.status === 'pending' && (
                                   <button 
                                    onClick={() => markBillAsPaid(bill)}
                                    className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 md:p-3 rounded-lg md:rounded-xl transition-all shadow-lg shadow-emerald-100 active:scale-95"
                                    title="Marcar como Pago"
                                   >
                                     <CheckCircle2 size={16} md:size={20} />
                                   </button>
                                 )}
                                 <button 
                                  onClick={() => {
                                    setEditingBill(bill);
                                    setShowBillModal(true);
                                  }}
                                  className="p-2 md:p-3 text-slate-300 hover:text-orange-600 transition-colors"
                                  title="Editar"
                                 >
                                   <Pencil size={16} md:size={20} />
                                 </button>
                                 <button 
                                  onClick={() => {
                                    if (window.confirm('Excluir este agendamento?')) {
                                      deleteBill(bill.id);
                                    }
                                  }}
                                  className="p-2 md:p-3 text-slate-300 hover:text-red-500 transition-colors"
                                  title="Excluir"
                                 >
                                   <Trash2 size={16} md:size={20} />
                                 </button>
                               </div>
                             )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeTab === 'reports' ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="md:col-span-1 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Calendar size={18} className="text-blue-600" />
                    Filtro de Período
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Ano de Referência</label>
                      <select 
                        value={reportYear}
                        onChange={(e) => setReportYear(parseInt(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 font-bold text-xs uppercase tracking-widest"
                      >
                        <option value={2026}>2026</option>
                        <option value={2025}>2025</option>
                        <option value={2024}>2024</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Mês Competência</label>
                      <select 
                        value={reportMonth}
                        onChange={(e) => setReportMonth(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 font-bold text-xs uppercase tracking-widest"
                      >
                        <option value="all">Todos os Meses</option>
                        <option value="0">Janeiro</option>
                        <option value="1">Fevereiro</option>
                        <option value="2">Março</option>
                        <option value="3">Abril</option>
                        <option value="4">Maio</option>
                        <option value="5">Junho</option>
                        <option value="6">Julho</option>
                        <option value="7">Agosto</option>
                        <option value="8">Setembro</option>
                        <option value="9">Outubro</option>
                        <option value="10">Novembro</option>
                        <option value="11">Dezembro</option>
                      </select>
                    </div>
                    <button 
                      onClick={() => exportTransactionsToCSV(periodFilteredTransactions, accounts)}
                      className="w-full mt-6 bg-slate-800 hover:bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all uppercase text-xs tracking-widest"
                    >
                      <Download size={18} />
                      Gerar Arquivo (CSV)
                    </button>
                    <p className="text-[9px] text-slate-400 font-medium leading-relaxed mt-4 italic">
                      * O arquivo gerado é compatível com Excel e sistemas de contabilidade padrão.
                    </p>
                  </div>
               </div>

               <div className="md:col-span-2 space-y-6">
                  <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-8">Consolidado por Categoria</h3>
                    <div className="space-y-6">
                      {CATEGORIES.filter(cat => 
                        userRole === 'owner' || 
                        (userPermissions?.categories?.includes(cat.value) ?? true)
                      ).map(cat => {
                        const catTotal = authorizedTransactions
                          .filter(t => {
                            if (t.category !== cat.value) return false;
                            const tDate = new Date(t.date + 'T00:00:00');
                            const matchesYear = tDate.getFullYear() === reportYear;
                            const matchesMonth = reportMonth === 'all' || tDate.getMonth().toString() === reportMonth;
                            return matchesYear && matchesMonth;
                          })
                          .reduce((acc, t) => {
                            if (t.type === 'income') return acc + t.amount;
                            if (t.type === 'expense') return acc - t.amount;
                            return acc;
                          }, 0);
                        
                        return (
                          <div key={cat.value} className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className={`w-3 h-10 rounded-full ${cat.color}`}></div>
                              <div>
                                <p className="text-xs font-black text-slate-800 uppercase tracking-widest">{cat.label}</p>
                                <p className="text-[10px] text-slate-400 font-medium">Acumulado no Período</p>
                              </div>
                            </div>
                            <p className={`text-lg font-mono font-bold ${catTotal < 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
                              R$ {(catTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-orange-600 p-8 rounded-2xl text-white shadow-xl shadow-orange-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-[0.2em] opacity-60 mb-2">Total em Circulação</h4>
                      <p className="text-3xl font-mono font-bold">
                        R$ {((Object.values(balances) as number[]).reduce((a, b) => a + b, 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center border-4 border-orange-400/30">
                       <BarChart3 size={32} />
                    </div>
                  </div>
               </div>
            </div>
          </div>
        ) : activeTab === 'settings' ? (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-2 italic">Gestão da Equipe</h2>
                <p className="text-slate-500 font-medium font-serif">Gerencie quem pode visualizar seus relatórios e dados financeiros</p>
              </div>
              
              {!showInviteInput ? (
                <button 
                  onClick={() => setShowInviteInput(true)}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-8 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-orange-100 active:scale-95 uppercase text-xs tracking-widest"
                >
                  <UserPlus size={20} strokeWidth={3} />
                  Novo Colaborador
                </button>
              ) : (
                <div className="flex flex-col md:flex-row items-end gap-4 bg-white p-6 rounded-3xl shadow-xl border border-slate-200 animate-in fade-in slide-in-from-right-4 duration-300 max-w-4xl w-full">
                  <div className="space-y-2 flex-1 w-full">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                    <input 
                      type="email"
                      placeholder="email@empresa.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-4 py-3 text-sm font-bold text-slate-700 outline-none bg-slate-50 rounded-xl border border-slate-100 focus:border-orange-300 transition-colors"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2 flex-1 w-full">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha Inicial (Min. 6 Carac.)</label>
                    <input 
                      type="text"
                      placeholder="Senha do colaborador"
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      className="w-full px-4 py-3 text-sm font-bold text-slate-700 outline-none bg-slate-50 rounded-xl border border-slate-100 focus:border-orange-300 transition-colors"
                    />
                  </div>
                  <div className="space-y-2 w-full md:w-40">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Privilégio</label>
                    <select 
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as UserRole)}
                      className="w-full px-4 py-3 text-sm font-bold text-slate-700 outline-none bg-slate-50 rounded-xl border border-slate-100 focus:border-orange-300 transition-colors"
                    >
                      <option value="viewer">Visualizador</option>
                      <option value="owner">Administrador</option>
                    </select>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button 
                      disabled={isRegisteringMember}
                      onClick={async () => {
                        if (inviteEmail && inviteEmail.includes('@')) {
                          try {
                            await addTeamMember(inviteEmail, inviteRole, invitePassword);
                            setInviteEmail('');
                            setInvitePassword('');
                            setInviteRole('viewer');
                            setShowInviteInput(false);
                          } catch (e) {
                            // Erro já tratado no addTeamMember
                          }
                        } else {
                          alert('Por favor, informe um e-mail válido.');
                        }
                      }}
                      className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-orange-100 active:scale-95 disabled:opacity-50"
                    >
                      {isRegisteringMember ? 'Processando...' : 'Autorizar e Criar'}
                    </button>
                    <button 
                      onClick={() => setShowInviteInput(false)}
                      className="px-6 py-3 text-slate-400 hover:text-slate-600 transition-colors text-[10px] font-black uppercase tracking-widest"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
               <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                     <Users size={20} className="text-orange-600" />
                     <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Colaboradores Ativos</h3>
                  </div>
                  <span className="text-[10px] bg-white border border-slate-200 px-3 py-1 rounded-full font-black text-slate-400 uppercase tracking-widest">
                    {teamMembers.length} usuários
                  </span>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="border-b border-slate-100">
                          <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuário / E-mail</th>
                          <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo</th>
                          <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                          <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ação</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                       {teamMembers.map(member => (
                         <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                           <td className="px-8 py-6">
                              <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-bold border border-slate-200">
                                   {member.email.charAt(0).toUpperCase()}
                                 </div>
                                 <div>
                                   <p className="text-sm font-bold text-slate-800">{member.email}</p>
                                   <p className="text-[10px] text-slate-400 font-medium">Tenant ID: {member.tenantId.substring(0, 8)}...</p>
                                 </div>
                              </div>
                           </td>
                           <td className="px-8 py-6">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${member.role === 'owner' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>
                                {member.role === 'owner' ? 'Proprietário' : 'Visualizador'}
                              </span>
                           </td>
                           <td className="px-8 py-6 text-sm">
                             <div className="flex items-center gap-2">
                               <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ativo</span>
                             </div>
                           </td>
                           <td className="px-8 py-6 text-right flex items-center justify-end gap-2">
                               {userRole === 'owner' && member.role === 'viewer' && (
                                 <button 
                                   onClick={() => setEditingPermissionsMember(member)}
                                   className="text-slate-300 hover:text-orange-500 transition-colors p-2"
                                   title="Gerenciar Permissões"
                                 >
                                   <ShieldCheck size={18} />
                                 </button>
                               )}
                               {(isRootOwner ? member.email !== user?.email : member.role !== 'owner') && (
                                <button 
                                  onClick={() => setConfirmDeleteMember(member)}
                                  className="text-slate-300 hover:text-red-500 transition-colors p-2"
                                >
                                  <UserMinus size={18} />
                                </button>
                              )}
                           </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
               </div>
            </div>

            <div className="bg-orange-50 border border-orange-100 p-8 rounded-3xl">
               <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-orange-600 shadow-sm border border-orange-100 shrink-0">
                     <ShieldCheck size={24} />
                  </div>
                  <div>
                     <h4 className="text-sm font-black text-orange-900 uppercase tracking-widest mb-2">Política de Acesso Personalizada</h4>
                     <p className="text-xs text-orange-700 font-medium leading-relaxed max-w-2xl">
                       Usuários com cargo de **Visualizador** possuem acesso restrito. 
                       Você pode definir exatamente quais **Categorias** e **Contas Financeiras** cada colaborador pode ver clicando no ícone de escudo <ShieldCheck size={12} className="inline" />.
                        Isso garante que cada pessoa veja apenas o que é relevante para sua função, evitando mistura de informações sensíveis.
                      </p>
                   </div>
                </div>
             </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-[3rem] border-4 border-dashed border-slate-100">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm mb-6">
              <LayoutDashboard size={40} className="text-slate-200" />
            </div>
            <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest italic">Página em Construção</h3>
            <p className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.2em] mt-2">Esta funcionalidade está sendo refinada para você.</p>
          </div>
        )}
        </div>
        {/* Scroll Headroom */}
        <div className="h-20 w-full pointer-events-none"></div>
      </main>

      {/* Add Transaction Modal - Geometric Style */}
      <AnimatePresence>
        {showImportModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowImportModal(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-4xl max-h-[90vh] bg-white rounded-2xl p-0 z-[110] shadow-2xl overflow-y-auto border-t-8 border-indigo-600"
            >
              <div className="p-6 md:p-10">
                <header className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-1 uppercase">Importação Inteligente</h2>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Aprendizado automático de conta e categoria</p>
                  </div>
                  <button onClick={() => setShowImportModal(false)} className="text-slate-300 hover:text-slate-600">
                    <Trash2 size={24} />
                  </button>
                </header>

                {previewTransactions.length === 0 ? (
                  <div className="space-y-6">
                    <div className="p-6 bg-orange-50 border border-orange-100 rounded-2xl">
                      <div className="flex items-center gap-3 text-orange-700 mb-4">
                        <FileText size={18} strokeWidth={3} />
                        <span className="text-xs font-black uppercase tracking-widest">IA + PDF Suportado</span>
                      </div>
                      <p className="text-[10px] text-orange-500 font-bold uppercase tracking-tight leading-relaxed">
                        Arraste um arquivo **PDF, CSV** ou cole o texto. 
                        A IA lerá o PDF e identificará os gastos automaticamente.
                      </p>
                    </div>

                    <div 
                      onClick={() => !isParsingPDF && fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) {
                          if (file.type === 'application/pdf') {
                            await processPDF(file);
                          } else {
                            const reader = new FileReader();
                            reader.onload = (event) => setImportText(event.target?.result as string);
                            reader.readAsText(file);
                          }
                        }
                      }}
                      className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer group ${isParsingPDF ? 'border-indigo-600 bg-indigo-50 cursor-wait' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'}`}
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept=".csv,.txt,.pdf" 
                        className="hidden" 
                      />
                      {isParsingPDF ? (
                        <div className="space-y-4">
                          <Loader2 size={48} className="text-indigo-600 animate-spin mx-auto" />
                          <p className="text-sm font-bold text-indigo-600">A Inteligência Artificial está lendo seu PDF...</p>
                          <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Extraindo datas, valores e descrições</p>
                        </div>
                      ) : (
                        <>
                          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                            <Upload size={32} className="text-slate-400 group-hover:text-indigo-600" />
                          </div>
                          <p className="text-sm font-bold text-slate-600 mb-1">Arraste seu PDF ou arquivo aqui</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Suporta PDF, CSV ou TXT</p>
                        </>
                      )}
                    </div>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-100"></div>
                      </div>
                      <div className="relative flex justify-center text-[10px] uppercase font-black text-slate-300">
                        <span className="bg-white px-4">Ou cole o texto aqui</span>
                      </div>
                    </div>

                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="Cole aqui seu extrato..."
                      className="w-full h-40 bg-slate-50 border border-slate-200 rounded-2xl p-6 outline-none focus:border-indigo-600 transition-all font-mono text-xs leading-relaxed"
                    />

                    <button
                      onClick={processImport}
                      disabled={!importText.trim() || isProcessing}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-indigo-100 uppercase text-xs tracking-widest relative overflow-hidden"
                    >
                      {isProcessing ? (
                        <div className="flex items-center gap-2">
                           <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                           Processando Inteligência...
                        </div>
                      ) : (
                        <>
                          <BarChart3 size={18} />
                          Analisar Inteligência
                        </>
                      )}
                    </button>
                    
                    {importText.trim() && previewTransactions.length === 0 && (
                      <p className="text-center text-[10px] text-red-500 font-bold uppercase tracking-widest animate-pulse">
                        Pressione o botão acima para identificar as transações.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center text-white">
                          <Wallet size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Configuração em Lote</p>
                          <p className="text-xs text-slate-500 font-medium">Defina conta e categoria para todos os itens</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <select 
                          className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-widest outline-none focus:border-indigo-600"
                          onChange={(e) => {
                            const updated = previewTransactions.map(t => ({ ...t, accountId: e.target.value }));
                            setPreviewTransactions(updated);
                          }}
                        >
                          <option value="" disabled>Conta em Lote</option>
                          {accounts.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                        <select 
                          className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-widest outline-none focus:border-indigo-600"
                          onChange={(e) => {
                            const updated = previewTransactions.map(t => ({ ...t, category: e.target.value as Category }));
                            setPreviewTransactions(updated);
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Categoria em Lote</option>
                          {CATEGORIES.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria Aprendida</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Conta</th>
                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
                            <th className="px-6 py-4"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {previewTransactions.map((t, i) => (
                            <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 font-mono text-[10px] text-slate-500 whitespace-nowrap">{t.date}</td>
                              <td className="px-6 py-4">
                                <p className="text-xs font-bold text-slate-800 uppercase leading-snug">{t.description}</p>
                              </td>
                              <td className="px-6 py-4">
                                <select 
                                  value={t.category} 
                                  onChange={(e) => {
                                    const updated = [...previewTransactions];
                                    updated[i].category = e.target.value as Category;
                                    setPreviewTransactions(updated);
                                  }}
                                  className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight outline-none focus:border-indigo-600 w-full"
                                >
                                  {CATEGORIES.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-6 py-4">
                                <select 
                                  value={t.accountId || ''} 
                                  onChange={(e) => {
                                    const updated = [...previewTransactions];
                                    updated[i].accountId = e.target.value;
                                    setPreviewTransactions(updated);
                                  }}
                                  className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight outline-none focus:border-emerald-600 w-full"
                                >
                                  {accounts.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-6 py-4 text-right whitespace-nowrap">
                                <span className={`text-xs font-mono font-bold ${t.type === 'expense' ? 'text-red-500' : 'text-emerald-500'}`}>
                                  {t.type === 'expense' ? '-' : '+'} R$ {t.amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <button 
                                  onClick={() => {
                                    const updated = previewTransactions.filter((_, idx) => idx !== i);
                                    setPreviewTransactions(updated);
                                  }}
                                  className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex gap-4">
                       <button
                        onClick={() => setPreviewTransactions([])}
                        className="flex-1 bg-white border border-slate-200 text-slate-500 font-bold py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-slate-50 transition-all"
                      >
                        Limpar e Voltar
                      </button>
                      <button
                        onClick={saveImported}
                        className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-indigo-100 uppercase text-xs tracking-widest"
                      >
                        <CheckCircle2 size={18} />
                        Confirmar Lançamentos
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}

        {showBillModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
              onClick={() => {
                setShowBillModal(false);
                setEditingBill(null);
              }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-xl max-h-[90vh] bg-white rounded-2xl p-0 z-[110] shadow-2xl overflow-y-auto scrollbar-hide border-t-8 border-orange-600"
            >
              <div className="p-6 md:p-10">
                <header className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-1 uppercase italic">{editingBill ? 'Repactuar Conta' : 'Agendar Pagamento'}</h2>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest tracking-[0.2em]">Compromisso no Fluxo de Caixa</p>
                  </div>
                  <button onClick={() => {
                    setShowBillModal(false);
                    setEditingBill(null);
                  }} className="p-2 text-slate-300 hover:text-slate-600 transition-colors"><X size={20} /></button>
                </header>
                
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (isProcessing) return;
                  setIsProcessing(true);
                  try {
                    const formData = new FormData(e.currentTarget);
                    await addBill({
                      description: formData.get('description') as string,
                      amount: parseFloat(formData.get('amount') as string),
                      dueDate: formData.get('dueDate') as string,
                      category: formData.get('category') as any,
                      status: (editingBill?.status || 'pending') as any,
                      billType: formData.get('billType') as any,
                    });
                  } catch (err: any) {
                    console.error("Erro ao salvar conta:", err);
                    alert("Erro ao salvar: " + (err.message || "Tente novamente."));
                  } finally {
                    setIsProcessing(false);
                  }
                }} className="space-y-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição do Pagamento</label>
                    <input 
                      type="text" 
                      name="description" 
                      placeholder="EX: CONTA DE LUZ, INTERNET, FORNECEDOR X..." 
                      defaultValue={editingBill?.description}
                      required 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-5 outline-none focus:border-orange-600 transition-all font-bold text-xs uppercase tracking-widest placeholder:text-slate-200" 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vencimento Planejado</label>
                      <input 
                        type="date" 
                        name="dueDate" 
                        defaultValue={editingBill?.dueDate || new Date().toISOString().split('T')[0]} 
                        required 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 outline-none focus:border-indigo-600 transition-all font-bold text-xs uppercase tracking-[0.2em]" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Silo (Categoria)</label>
                      <select 
                        name="category" 
                        defaultValue={editingBill?.category || 'escola'}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 outline-none focus:border-indigo-600 transition-all font-bold text-xs uppercase tracking-widest appearance-none cursor-pointer"
                      >
                        {CATEGORIES.filter(c => !['transferencia'].includes(c.value)).map(source => (
                          <option key={source.value} value={source.value}>{source.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Recorrência</label>
                      <select 
                        name="billType" 
                        defaultValue={editingBill?.billType || 'fixed'}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 outline-none focus:border-indigo-600 transition-all font-bold text-xs uppercase tracking-widest appearance-none cursor-pointer"
                      >
                        <option value="fixed">💡 CONTA FIXA</option>
                        <option value="variable">🌪️ PASSAGEIRA</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Nominal (R$)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.01" 
                        name="amount" 
                        placeholder="0.00" 
                        defaultValue={editingBill?.amount}
                        required 
                        className="w-full bg-indigo-50/50 border border-indigo-100 rounded-2xl px-8 py-8 outline-none focus:border-indigo-600 transition-all font-mono font-black text-3xl text-indigo-700" 
                      />
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-4 pt-6">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowBillModal(false);
                        setEditingBill(null);
                      }} 
                      className="flex-1 py-5 font-black text-slate-400 hover:text-slate-600 text-[10px] uppercase tracking-[0.3em] transition-colors order-2 md:order-1"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      disabled={isProcessing}
                      className="flex-1 py-5 font-black bg-indigo-600 text-white rounded-xl shadow-2xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 uppercase text-[10px] tracking-widest order-1 md:order-2 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isProcessing && <Loader2 size={16} className="animate-spin" />}
                      {editingBill ? 'Aplicar Alterações' : 'Confirmar Agendamento'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}

        {showAddModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-xl max-h-[90vh] bg-white rounded-2xl p-0 z-[110] shadow-2xl overflow-y-auto scrollbar-hide border-t-8 border-orange-600"
            >
              <div className="p-6 md:p-10">
                <header className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter mb-1 uppercase italic tracking-tight">
                      {editingTransaction ? 'Revisar Registro' : modalType === 'income' ? 'Nova Entrada' : modalType === 'transfer' ? 'Transferência' : 'Nova Saída'}
                    </h2>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">
                      {modalType === 'transfer' ? 'Movimentação entre silos financeiros' : 'Registro imutável no auditor do tenant'}
                    </p>
                  </div>
                  <button onClick={() => {
                    setShowAddModal(false);
                    setEditingTransaction(null);
                  }} className="p-3 bg-slate-50 rounded-xl text-slate-300 hover:text-slate-600 transition-all"><X size={20} /></button>
                </header>
                
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (isProcessing) return;
                  setIsProcessing(true);
                  try {
                    const formData = new FormData(e.currentTarget);
                    const amountValue = formData.get('amount') as string;
                    if (!amountValue) {
                      alert("Por favor, informe o valor.");
                      return;
                    }
                    
                    const parsedAmount = parseFloat(amountValue.replace(',', '.'));
                    if (isNaN(parsedAmount) || parsedAmount <= 0) {
                      alert("Valor inválido. Use números positivos.");
                      return;
                    }

                    await addTransaction({
                      date: formData.get('date') as string,
                      description: formData.get('description') as string,
                      amount: parsedAmount,
                      type: modalType,
                      category: (modalType === 'transfer' ? 'transferencia' : formData.get('category')) as Category,
                      accountId: formData.get('accountId') as string,
                      toAccountId: modalType === 'transfer' ? formData.get('toAccountId') as string : undefined,
                    } as any);
                  } catch (err: any) {
                    console.error("Erro crítico ao salvar:", err);
                    let displayMsg = "Tente novamente.";
                    try {
                      const details = JSON.parse(err.message);
                      if (details.error) displayMsg = details.error;
                    } catch {
                      displayMsg = err.message || displayMsg;
                    }
                    alert("Erro ao salvar: " + displayMsg);
                  } finally {
                    setIsProcessing(false);
                  }
                }} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Modalidade</label>
                      <select 
                        name="type" 
                        value={modalType}
                        onChange={(e) => setModalType(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3.5 outline-none focus:border-blue-600 transition-all font-bold text-xs uppercase tracking-widest"
                      >
                        <option value="expense">Saída de Caixa</option>
                        <option value="income">Entrada de Caixa</option>
                        <option value="transfer">Transferência entre Contas</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Fixada</label>
                      <input 
                        type="date" 
                        name="date" 
                        defaultValue={editingTransaction?.date || new Date().toISOString().split('T')[0]} 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3.5 outline-none focus:border-blue-600 transition-all font-bold text-xs" 
                      />
                    </div>
                  </div>

                  {modalType !== 'transfer' ? (
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-1 italic">01. Silo de Destinação (Categoria)</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {CATEGORIES.filter(c => !['transferencia', 'outros'].includes(c.value)).map(c => (
                            <label key={c.value} className="relative cursor-pointer">
                              <input 
                                type="radio" 
                                name="category" 
                                value={c.value} 
                                defaultChecked={editingTransaction ? editingTransaction.category === c.value : c.value === 'escola'} 
                                className="sr-only peer" 
                              />
                              <div className="px-4 py-6 rounded-xl border border-slate-100 bg-slate-50 text-center transition-all peer-checked:border-blue-600 peer-checked:bg-white peer-checked:shadow-md hover:bg-white">
                                <span className="text-[10px] font-black block uppercase tracking-tight text-slate-600 group-peer-checked:text-blue-600">{c.label}</span>
                              </div>
                            </label>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-2xl">
                      <div className="flex items-center gap-3 text-indigo-700 mb-4">
                        <ArrowRight size={18} strokeWidth={3} />
                        <span className="text-xs font-black uppercase tracking-widest">Configuração de Transferência</span>
                      </div>
                      <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-tight leading-relaxed">
                        Ao transferir, o sistema registrará automaticamente a saída do valor da conta de origem e a entrada na conta de destino.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest ml-1 italic">
                        {modalType === 'transfer' ? '02. Conta de Origem' : '02. Conta Financeira'}
                      </label>
                      <select 
                        name="accountId" 
                        required 
                        defaultValue={editingTransaction?.accountId}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3.5 outline-none focus:border-emerald-600 transition-all font-bold text-xs uppercase tracking-widest"
                      >
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </select>
                    </div>

                    {modalType === 'transfer' && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1 italic font-serif">03. Conta de Destino</label>
                        <select 
                          name="toAccountId" 
                          required 
                          defaultValue={editingTransaction?.toAccountId}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3.5 outline-none focus:border-indigo-600 transition-all font-bold text-xs uppercase tracking-widest"
                        >
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Especificação Técnica (Descrição)</label>
                    <input 
                      type="text" 
                      name="description" 
                      placeholder="EX: REPOSIÇÃO ALIMENTAR, MATERIAL EXPEDIENTE..." 
                      defaultValue={editingTransaction?.description}
                      required 
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-4 outline-none focus:border-blue-600 transition-all font-bold text-xs uppercase tracking-widest placeholder:text-slate-300" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Nominal (R$)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.01" 
                        name="amount" 
                        placeholder="00,00" 
                        defaultValue={editingTransaction?.amount}
                        required 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-6 py-5 outline-none focus:border-blue-600 transition-all font-mono font-bold text-2xl" 
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-6">
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowAddModal(false);
                        setEditingTransaction(null);
                      }} 
                      className="flex-1 py-4 font-bold text-slate-400 hover:text-slate-600 text-xs uppercase tracking-widest transition-colors"
                    >
                      Abortar
                    </button>
                    <button 
                      type="submit" 
                      disabled={isProcessing}
                      className="flex-1 py-4 font-bold bg-blue-600 text-white rounded-lg shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 uppercase text-xs tracking-widest disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
                    >
                      {isProcessing && <Loader2 size={16} className="animate-spin" />}
                      {editingTransaction ? 'Salvar Alterações' : 'Confirmar Registro'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAccountModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[105]"
              onClick={() => setShowAccountModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-white rounded-[2.5rem] p-0 z-[115] shadow-2xl overflow-y-auto border-t-[12px] border-orange-600"
            >
              <div className="p-8">
                <header className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tighter mb-1 uppercase italic">Configurar Conta</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Definição de Parâmetros Financeiros</p>
                  </div>
                  <button onClick={() => setShowAccountModal(false)} className="p-3 bg-slate-50 rounded-xl text-slate-300 hover:text-slate-600 transition-all">
                    <X size={20} />
                  </button>
                </header>
                
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  await addAccount({
                    name: formData.get('name') as string,
                    balance: parseFloat(formData.get('balance') as string) || 0,
                    color: formData.get('color') as string,
                  });
                }} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Conta</label>
                    <input 
                      type="text" 
                      name="name" 
                      placeholder="EX: ESCOLA, PESSOAL, CANTINA..." 
                      required 
                      defaultValue={editingAccount?.name}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 outline-none focus:border-orange-500 transition-all font-bold text-xs uppercase tracking-widest placeholder:text-slate-200" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Saldo Inicial (R$)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      name="balance" 
                      placeholder="0,00" 
                      defaultValue={editingAccount?.balance || 0}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 outline-none focus:border-orange-500 transition-all font-mono font-black text-xl" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cor de Identificação</label>
                    <input 
                      type="color" 
                      name="color" 
                      defaultValue={editingAccount?.color || '#ea580c'}
                      className="w-full h-12 bg-slate-50 border border-slate-100 rounded-2xl px-2 py-2 outline-none cursor-pointer" 
                    />
                  </div>

                  <div className="flex gap-4 pt-6">
                    <button type="button" onClick={() => setShowAccountModal(false)} className="flex-1 py-4 font-black text-slate-400 hover:text-slate-600 text-[10px] uppercase tracking-widest transition-colors">Cancelar</button>
                    <button 
                      type="submit" 
                      className="flex-1 py-4 font-black bg-orange-600 text-white rounded-2xl shadow-xl shadow-orange-100 hover:bg-orange-700 transition-all active:scale-95 uppercase text-[10px] tracking-widest"
                    >
                      Salvar Conta
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDebtModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
              onClick={() => setShowDebtModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-xl max-h-[90vh] bg-white rounded-[2.5rem] p-0 z-[110] shadow-2xl overflow-y-auto scrollbar-hide border-t-[12px] border-slate-900"
            >
              <div className="p-8 md:p-12">
                <header className="flex justify-between items-start mb-10">
                  <div>
                    <h2 className="text-3xl font-black text-slate-800 tracking-tighter mb-1 uppercase italic italic tracking-tight">Nova Provisão</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em]">Engenharia de Passivos e Crédito</p>
                  </div>
                  <button onClick={() => setShowDebtModal(false)} className="p-3 bg-slate-50 rounded-xl text-slate-300 hover:text-slate-600 transition-all">
                    <X size={20} />
                  </button>
                </header>
                
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (isProcessing) return;
                  setIsProcessing(true);
                  try {
                    const formData = new FormData(e.currentTarget);
                    await addDebt({
                      description: formData.get('description') as string,
                      totalAmount: parseFloat(formData.get('totalAmount') as string),
                      paidAmount: 0, 
                      dueDate: formData.get('dueDate') as string || null,
                      type: formData.get('type') as any,
                      installments: parseInt(formData.get('installments') as string) || null,
                      remainingInstallments: parseInt(formData.get('remainingInstallments') as string) || null,
                      installmentValue: parseFloat(formData.get('installmentValue') as string) || null,
                      status: 'active',
                    });
                  } catch (err: any) {
                    console.error("Erro ao salvar dívida:", err);
                    alert("Erro ao salvar: " + (err.message || "Tente novamente."));
                  } finally {
                    setIsProcessing(false);
                  }
                }} className="space-y-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição do Empréstimo / Dívida</label>
                    <input 
                      type="text" 
                      name="description" 
                      placeholder="EX: EMPRÉSTIMO BANCO DO BRASIL, CARTÃO NUBANK..." 
                      required 
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-5 outline-none focus:border-orange-500 transition-all font-bold text-xs uppercase tracking-widest placeholder:text-slate-200" 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Dívida</label>
                      <select name="type" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 outline-none focus:border-orange-500 transition-all font-bold text-xs uppercase tracking-widest appearance-none cursor-pointer">
                        <option value="loan">Empréstimo</option>
                        <option value="card">Cartão de Crédito</option>
                        <option value="other">Outras Dívidas</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Total que DEVE Hoje (R$)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        name="totalAmount" 
                        placeholder="0,00" 
                        required 
                        className="w-full bg-orange-50/30 border border-orange-100 rounded-2xl px-6 py-4 outline-none focus:border-orange-500 transition-all font-mono font-black text-2xl text-orange-600" 
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Informações de Parcelamento (Opcional)</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Total Parcelas</label>
                        <input type="number" name="installments" placeholder="Ex: 12" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 text-xs font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Restantes</label>
                        <input type="number" name="remainingInstallments" placeholder="Ex: 5" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 text-xs font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Parcela</label>
                        <input type="number" step="0.01" name="installmentValue" placeholder="0,00" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 text-xs font-bold font-mono" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data do Próximo Vencimento (Opcional)</label>
                    <input type="date" name="dueDate" className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 outline-none focus:border-orange-500 transition-all font-bold text-xs uppercase tracking-widest" />
                  </div>

                  <div className="flex flex-col md:flex-row gap-4 pt-6">
                    <button type="button" onClick={() => setShowDebtModal(false)} className="flex-1 py-5 font-black text-slate-400 hover:text-slate-600 text-[10px] uppercase tracking-[0.3em] transition-colors order-2 md:order-1">Cancelar</button>
                    <button 
                      type="submit" 
                      disabled={isProcessing}
                      className="flex-1 py-5 font-black bg-orange-600 text-white rounded-2xl shadow-2xl shadow-orange-100 hover:bg-orange-700 transition-all active:scale-95 uppercase text-[10px] tracking-[0.2em] order-1 md:order-2 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isProcessing && <Loader2 size={16} className="animate-spin" />}
                      Salvar Dívida
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingPermissionsMember && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150]"
              onClick={() => setEditingPermissionsMember(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg bg-white rounded-[40px] p-10 z-[160] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                    <ShieldCheck size={28} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter italic leading-tight">Permissões de Acesso</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{editingPermissionsMember.email}</p>
                  </div>
                </div>

                <div className="space-y-8 max-h-[60vh] overflow-y-auto px-1 custom-scrollbar">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Páginas Autorizadas</label>
                      <button 
                        onClick={() => {
                          const allTabs = ['dashboard', 'transactions', 'debts', 'payables', 'reports'];
                          setEditingPermissionsMember(prev => prev ? {
                            ...prev,
                            permissions: { ...prev.permissions, tabs: allTabs }
                          } : null);
                        }}
                        className="text-[10px] font-black text-orange-600 uppercase tracking-widest"
                      >
                        Ativar Tudo
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
                        { id: 'transactions', label: 'Extrato', icon: History },
                        { id: 'debts', label: 'Dívidas', icon: CreditCard },
                        { id: 'payables', label: 'Contas', icon: Calendar },
                        { id: 'reports', label: 'Relatos', icon: Receipt },
                      ].map(tab => (
                        <label key={tab.id} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200 group">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${editingPermissionsMember.permissions?.tabs?.includes(tab.id) ?? true ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                              <tab.icon size={16} />
                            </div>
                            <span className="text-xs font-bold text-slate-700 tracking-tight">{tab.label}</span>
                          </div>
                          <input 
                            type="checkbox"
                            checked={editingPermissionsMember.permissions?.tabs?.includes(tab.id) ?? true}
                            onChange={(e) => {
                              const current = editingPermissionsMember.permissions?.tabs ?? ['dashboard', 'transactions', 'debts', 'payables', 'reports'];
                              const next = e.target.checked 
                                ? [...current, tab.id]
                                : current.filter(v => v !== tab.id);
                              setEditingPermissionsMember({
                                ...editingPermissionsMember,
                                permissions: { ...editingPermissionsMember.permissions, tabs: next }
                              });
                            }}
                            className="w-5 h-5 rounded-lg border-slate-300 text-orange-600 focus:ring-orange-500 transition-all"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Categorias Permitidas</label>
                      <button 
                        onClick={() => {
                          const allCats = CATEGORIES.map(c => c.value);
                          setEditingPermissionsMember(prev => prev ? {
                            ...prev,
                            permissions: { ...prev.permissions, categories: allCats }
                          } : null);
                        }}
                        className="text-[10px] font-black text-orange-600 uppercase tracking-widest"
                      >
                        Marcar Todas
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {CATEGORIES.map(cat => (
                        <label key={cat.value} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors group">
                          <input 
                            type="checkbox"
                            checked={editingPermissionsMember.permissions?.categories?.includes(cat.value) ?? true}
                            onChange={(e) => {
                              const current = editingPermissionsMember.permissions?.categories ?? CATEGORIES.map(c => c.value);
                              const next = e.target.checked 
                                ? [...current, cat.value]
                                : current.filter(v => v !== cat.value);
                              setEditingPermissionsMember({
                                ...editingPermissionsMember,
                                permissions: { ...editingPermissionsMember.permissions, categories: next }
                              });
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                          />
                          <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900">{cat.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Contas Permitidas</label>
                      <button 
                        onClick={() => {
                          const allIds = accounts.map(s => s.id);
                          setEditingPermissionsMember(prev => prev ? {
                            ...prev,
                            permissions: { ...prev.permissions, accountId: allIds }
                          } : null);
                        }}
                        className="text-[10px] font-black text-orange-600 uppercase tracking-widest"
                      >
                        Marcar Todas
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {accounts.map(acc => (
                        <label key={acc.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors group">
                          <input 
                            type="checkbox"
                            checked={editingPermissionsMember.permissions?.accountId?.includes(acc.id) ?? true}
                            onChange={(e) => {
                              const current = editingPermissionsMember.permissions?.accountId ?? accounts.map(s => s.id);
                              const next = e.target.checked 
                                ? [...current, acc.id]
                                : current.filter(v => v !== acc.id);
                              setEditingPermissionsMember({
                                ...editingPermissionsMember,
                                permissions: { ...editingPermissionsMember.permissions, accountId: next }
                              });
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                          />
                          <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900">{acc.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-8 border-t border-slate-50 mt-8">
                  <button 
                    onClick={() => updateMemberPermissions(editingPermissionsMember.email, editingPermissionsMember.permissions || {
                      categories: CATEGORIES.map(c => c.value),
                      accountId: accounts.map(s => s.id),
                      tabs: ['dashboard', 'transactions', 'debts', 'payables', 'reports']
                    })}
                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-5 rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl shadow-slate-100 transition-all active:scale-95"
                  >
                    Confirmar Acessos
                  </button>
                  <button 
                    onClick={() => setEditingPermissionsMember(null)}
                    className="px-8 py-5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-3xl font-black uppercase text-xs tracking-widest transition-all"
                  >
                    Sair
                  </button>
                </div>
                </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150]"
              onClick={() => setConfirmDelete(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-white rounded-3xl p-8 z-[160] shadow-2xl border-t-8 border-red-500 text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={40} className="text-red-500" />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Você tem certeza?</h3>
              <p className="text-sm text-slate-400 font-medium mb-8">Esta ação é permanente e este lançamento não poderá ser recuperado após a exclusão.</p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    deleteTransaction(confirmDelete);
                    setConfirmDelete(null);
                  }}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-red-100 transition-all active:scale-95"
                >
                  Sim, apagar agora
                </button>
                <button 
                  onClick={() => setConfirmDelete(null)}
                  className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl font-black uppercase text-xs tracking-widest transition-all"
                >
                  Não, manter registro
                </button>
              </div>
            </motion.div>
          </>
        )}

        {confirmDeleteMember && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150]"
              onClick={() => setConfirmDeleteMember(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-white rounded-3xl p-8 z-[160] shadow-2xl border-t-8 border-red-500 text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <UserMinus size={40} className="text-red-500" />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Remover Acesso?</h3>
              <p className="text-sm text-slate-400 font-medium mb-8 text-center px-4">
                O acesso de <span className="text-slate-900 font-bold">{confirmDeleteMember.email}</span> será removido permanentemente deste ambiente.
              </p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    removeTeamMember(confirmDeleteMember.id!);
                    setConfirmDeleteMember(null);
                  }}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-red-100 transition-all active:scale-95"
                >
                  Sim, remover acesso
                </button>
                <button 
                  onClick={() => setConfirmDeleteMember(null)}
                  className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl font-black uppercase text-xs tracking-widest transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </>
        )}

        {confirmDeleteDebt && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150]"
              onClick={() => setConfirmDeleteDebt(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-white rounded-3xl p-8 z-[160] shadow-2xl border-t-8 border-red-500 text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} className="text-red-500" />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Excluir Compromisso?</h3>
              <p className="text-sm text-slate-400 font-medium mb-8 text-center px-4">
                Este registro de dívida/parcelamento será removido permanentemente.
              </p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    deleteDebt(confirmDeleteDebt);
                    setConfirmDeleteDebt(null);
                  }}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-red-100 transition-all active:scale-95"
                >
                  Sim, excluir agora
                </button>
                <button 
                  onClick={() => setConfirmDeleteDebt(null)}
                  className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl font-black uppercase text-xs tracking-widest transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </>
        )}

        {confirmPayDebt && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150]"
              onClick={() => setConfirmPayDebt(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-white rounded-3xl p-8 z-[160] shadow-2xl border-t-8 border-emerald-500 text-center"
            >
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={40} className="text-emerald-500" />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Liquidar Dívida?</h3>
              <p className="text-sm text-slate-400 font-medium mb-8 text-center px-4">
                Deseja marcar este compromisso como quitado integralmente?
              </p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    updateDebt(confirmPayDebt, { totalAmount: 0, status: 'paid', remainingInstallments: 0 });
                    setConfirmPayDebt(null);
                  }}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-emerald-100 transition-all active:scale-95"
                >
                  Sim, liquidar agora
                </button>
                <button 
                  onClick={() => setConfirmPayDebt(null)}
                  className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl font-black uppercase text-xs tracking-widest transition-all"
                >
                  Não, cancelar
                </button>
              </div>
            </motion.div>
          </>
        )}

        {confirmDeleteBill && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150]"
              onClick={() => setConfirmDeleteBill(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-white rounded-3xl p-8 z-[160] shadow-2xl border-t-8 border-red-500 text-center"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} className="text-red-500" />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Excluir Agendamento?</h3>
              <p className="text-sm text-slate-400 font-medium mb-8 text-center px-4">
                Esta conta a pagar será removida permanentemente do histórico.
              </p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    deleteBill(confirmDeleteBill);
                    setConfirmDeleteBill(null);
                  }}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-red-100 transition-all active:scale-95"
                >
                  Sim, excluir
                </button>
                <button 
                  onClick={() => setConfirmDeleteBill(null)}
                  className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl font-black uppercase text-xs tracking-widest transition-all"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Notifications - Robust and visible */}
      <div className="fixed bottom-8 right-8 z-[200] flex flex-col gap-4 pointer-events-none w-full max-w-sm">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              className={`pointer-events-auto p-6 rounded-2xl shadow-2xl flex items-start gap-4 border-l-8 ${n.type === 'success' ? 'bg-emerald-800 border-emerald-400 text-white' : 'bg-red-800 border-red-400 text-white'}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${n.type === 'success' ? 'bg-emerald-700' : 'bg-red-700'}`}>
                {n.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
              </div>
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] mb-1 opacity-60">Sistema de Auditoria</h4>
                <p className="text-sm font-bold tracking-tight">{n.message}</p>
              </div>
              <button 
                onClick={() => setNotifications(prev => prev.filter(nx => nx.id !== n.id))}
                className="ml-auto text-white/40 hover:text-white"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
