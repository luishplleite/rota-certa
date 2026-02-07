import { z } from "zod";

// Default business rules (used when account settings not available)
export const BUSINESS_RULES = {
  EARNING_PER_DELIVERY: 2.80,
  SUNDAY_BONUS_THRESHOLD: 50,
  SUNDAY_BONUS_VALUE: 100.00,
} as const;

// Account-level configurable settings
export interface AccountSettings {
  earningPerDelivery: number;
  sundayBonusThreshold: number;
  sundayBonusValue: number;
  startAddress?: string;
  startLatitude?: number;
  startLongitude?: number;
}

export const updateSettingsSchema = z.object({
  earningPerDelivery: z.number().min(0.01, "Valor por entrega deve ser maior que zero"),
  sundayBonusThreshold: z.number().int().min(1, "Meta de entregas deve ser pelo menos 1"),
  sundayBonusValue: z.number().min(0, "Valor do bonus nao pode ser negativo"),
  startAddress: z.string().optional(),
  startLatitude: z.number().optional(),
  startLongitude: z.number().optional(),
});

export type UpdateSettings = z.infer<typeof updateSettingsSchema>;

export type StopStatus = 'pending' | 'current' | 'delivered' | 'failed';
export type ItineraryStatus = 'active' | 'completed';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Itinerary {
  id: string;
  userId: string;
  date: string;
  name: string;
  status: ItineraryStatus;
  totalEarnings: number;
  createdAt: string;
}

export const createItinerarySchema = z.object({
  date: z.string().min(10, "Data inválida"),
  name: z.string().optional(),
});

export interface Stop {
  id: string;
  itineraryId: string;
  fixedIdentifier: string;
  addressFull: string;
  latitude: number;
  longitude: number;
  sequenceOrder: number;
  status: StopStatus;
  packageCount: number;
  deliveryTime?: string;
  createdAt: string;
}

export interface Earnings {
  base: number;
  bonus: number;
  total: number;
}

export const insertStopSchema = z.object({
  addressFull: z.string().min(5, "Endereço deve ter pelo menos 5 caracteres"),
  latitude: z.number(),
  longitude: z.number(),
});

export const updateStopStatusSchema = z.object({
  status: z.enum(['pending', 'current', 'delivered', 'failed']),
  deliveredCount: z.number().int().min(1).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(4, "Senha deve ter pelo menos 4 caracteres"),
});

export type InsertStop = z.infer<typeof insertStopSchema>;
export type UpdateStopStatus = z.infer<typeof updateStopStatusSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateItinerary = z.infer<typeof createItinerarySchema>;

export interface SubscriptionInfo {
  plan: string;
  status: string;
  trialDaysRemaining: number;
  isTrialExpired: boolean;
  canAccessFinancials: boolean;
  subscriptionDaysRemaining?: number;
  paidEndDate?: string | null;
}

export const signupSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(4, "Senha deve ter pelo menos 4 caracteres"),
});

export type ExpenseCategory = 'fuel' | 'food' | 'maintenance' | 'other';

export interface Expense {
  id: string;
  userId: string;
  accountId: string;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  date: string;
  createdAt: string;
}

export const insertExpenseSchema = z.object({
  category: z.enum(['fuel', 'food', 'maintenance', 'other']),
  amount: z.number().positive("Valor deve ser positivo"),
  description: z.string().optional(),
  date: z.string().optional(),
});

export type InsertExpense = z.infer<typeof insertExpenseSchema>;

export type IncomeCategory = 'tip' | 'bonus' | 'extra_delivery' | 'other';

export interface Income {
  id: string;
  userId: string;
  accountId: string;
  category: IncomeCategory;
  amount: number;
  description?: string;
  date: string;
  createdAt: string;
}

export const insertIncomeSchema = z.object({
  category: z.enum(['tip', 'bonus', 'extra_delivery', 'other']),
  amount: z.number().positive("Valor deve ser positivo"),
  description: z.string().optional(),
  date: z.string().optional(),
});

export type InsertIncome = z.infer<typeof insertIncomeSchema>;

export type FinancialCycleStatus = 'active' | 'pending' | 'paid';

export interface FinancialCycle {
  id: string;
  userId: string;
  accountId: string;
  cycleStart: string;
  cycleEnd: string;
  deliveriesCount: number;
  baseEarnings: number;
  bonusEarnings: number;
  otherIncomes: number;
  totalEarnings: number;
  totalExpenses: number;
  netProfit: number;
  status: FinancialCycleStatus;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CycleSummary {
  currentCycle: {
    startDate: string;
    endDate: string;
    daysRemaining: number;
    deliveries: number;
    earnings: {
      base: number;
      bonus: number;
      otherIncomes: number;
      total: number;
    };
    expenses: number;
    netProfit: number;
  };
  history: FinancialCycle[];
  dailyStats: Array<{
    date: string;
    delivered: number;
    failed: number;
    earnings: number;
  }>;
  monthlyStats: Array<{
    day: number;
    delivered: number;
    earnings: number;
  }>;
}
