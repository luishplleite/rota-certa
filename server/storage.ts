import type { User, Itinerary, Stop, StopStatus, InsertStop, Expense, InsertExpense, Income, InsertIncome, FinancialCycle, FinancialCycleStatus } from "@shared/schema";
import { randomUUID } from "crypto";
import { isSupabaseConfigured } from "./supabase";
import { supabaseStorage, type ExtendedUser, type SubscriptionInfo } from "./supabaseStorage";

export interface IStorage {
  getUser(id: string): Promise<User | ExtendedUser | undefined>;
  getUserByEmail(email: string): Promise<User | ExtendedUser | undefined>;
  createUser(email: string, name: string, password?: string): Promise<User | ExtendedUser>;
  validatePassword?(email: string, password: string): Promise<ExtendedUser | undefined>;
  getSubscriptionInfo?(accountId: string): Promise<SubscriptionInfo>;
  getNextStopCounter?(accountId: string): Promise<number>;
  
  getItinerary(userId: string, date: string): Promise<Itinerary | undefined>;
  getActiveItinerary(userId: string): Promise<Itinerary | undefined>;
  createItinerary(userId: string, date: string, name: string): Promise<Itinerary>;
  updateItinerary(id: string, updates: Partial<Itinerary>): Promise<Itinerary | undefined>;
  
  getStops(itineraryId: string): Promise<Stop[]>;
  getStopsByUserId(userId: string): Promise<Stop[]>;
  createStop(itineraryId: string, data: InsertStop, fixedIdentifier: string, sequenceOrder: number): Promise<Stop>;
  updateStop(id: string, updates: Partial<Stop>): Promise<Stop | undefined>;
  deleteStop(id: string): Promise<boolean>;
  reorderStops(itineraryId: string, stopIds: string[]): Promise<Stop[]>;
  findStopByAddress?(itineraryId: string, latitude: number, longitude: number): Promise<Stop | null>;
  incrementPackageCount?(stopId: string): Promise<Stop | undefined>;
  
  getExpenses(userId: string, startDate?: string, endDate?: string): Promise<Expense[]>;
  getExpensesByDate(userId: string, date: string): Promise<Expense[]>;
  createExpense(userId: string, accountId: string, data: InsertExpense): Promise<Expense>;
  deleteExpense(id: string): Promise<boolean>;
  
  getIncomes(userId: string, startDate?: string, endDate?: string): Promise<Income[]>;
  getIncomesByDate(userId: string, date: string): Promise<Income[]>;
  createIncome(userId: string, accountId: string, data: InsertIncome): Promise<Income>;
  deleteIncome(id: string): Promise<boolean>;
  
  getDeliveredStopsInPeriod(userId: string, startDate: string, endDate: string): Promise<Stop[]>;
  getIncomesInPeriod(userId: string, startDate: string, endDate: string): Promise<Income[]>;
  getExpensesInPeriod(userId: string, startDate: string, endDate: string): Promise<Expense[]>;
  getFinancialCycleHistory(userId: string): Promise<FinancialCycle[]>;
  getDailyDeliveryStats(userId: string, startDate: string, endDate: string): Promise<Array<{ date: string; delivered: number; failed: number; earnings: number }>>;
  getMonthlyDeliveryStats(userId: string, year: number, month: number): Promise<Array<{ day: number; delivered: number; earnings: number }>>;
  createFinancialCycle(data: Omit<FinancialCycle, 'id' | 'createdAt' | 'updatedAt' | 'paidAt'>): Promise<FinancialCycle>;
  updateFinancialCycleStatus(id: string, status: FinancialCycleStatus): Promise<FinancialCycle | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private itineraries: Map<string, Itinerary>;
  private stops: Map<string, Stop>;
  private expenses: Map<string, Expense>;
  private incomes: Map<string, Income>;
  private stopCounter: number;

  constructor() {
    this.users = new Map();
    this.itineraries = new Map();
    this.stops = new Map();
    this.expenses = new Map();
    this.incomes = new Map();
    this.stopCounter = 0;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.email === email);
  }

  async createUser(email: string, name: string): Promise<User> {
    const id = randomUUID();
    const user: User = { id, email, name };
    this.users.set(id, user);
    return user;
  }

  async getItinerary(userId: string, date: string): Promise<Itinerary | undefined> {
    return Array.from(this.itineraries.values()).find(
      (it) => it.userId === userId && it.date === date && it.status === 'active'
    );
  }

  async getActiveItinerary(userId: string): Promise<Itinerary | undefined> {
    return Array.from(this.itineraries.values()).find(
      (it) => it.userId === userId && it.status === 'active'
    );
  }

  async createItinerary(userId: string, date: string, name: string): Promise<Itinerary> {
    const existingActive = await this.getActiveItinerary(userId);
    if (existingActive) {
      existingActive.status = 'completed';
      this.itineraries.set(existingActive.id, existingActive);
    }
    
    const id = randomUUID();
    const itinerary: Itinerary = {
      id,
      userId,
      date,
      name,
      status: 'active',
      totalEarnings: 0,
      createdAt: new Date().toISOString(),
    };
    this.itineraries.set(id, itinerary);
    return itinerary;
  }

  async updateItinerary(id: string, updates: Partial<Itinerary>): Promise<Itinerary | undefined> {
    const itinerary = this.itineraries.get(id);
    if (!itinerary) return undefined;
    
    const updated = { ...itinerary, ...updates };
    this.itineraries.set(id, updated);
    return updated;
  }

  async getStops(itineraryId: string): Promise<Stop[]> {
    return Array.from(this.stops.values())
      .filter((stop) => stop.itineraryId === itineraryId)
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  }

  async getStopsByUserId(userId: string): Promise<Stop[]> {
    const today = new Date().toISOString().split('T')[0];
    const itinerary = await this.getItinerary(userId, today);
    if (!itinerary) return [];
    return this.getStops(itinerary.id);
  }

  async createStop(
    itineraryId: string,
    data: InsertStop,
    fixedIdentifier: string,
    sequenceOrder: number
  ): Promise<Stop> {
    const id = randomUUID();
    const stop: Stop = {
      id,
      itineraryId,
      fixedIdentifier,
      addressFull: data.addressFull,
      latitude: data.latitude,
      longitude: data.longitude,
      sequenceOrder,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.stops.set(id, stop);
    return stop;
  }

  async updateStop(id: string, updates: Partial<Stop>): Promise<Stop | undefined> {
    const stop = this.stops.get(id);
    if (!stop) return undefined;
    
    const updated = { ...stop, ...updates };
    if (updates.status === 'delivered' || updates.status === 'failed') {
      updated.deliveryTime = new Date().toISOString();
    }
    this.stops.set(id, updated);
    
    if (updates.status === 'delivered' || updates.status === 'failed') {
      const allStops = await this.getStops(stop.itineraryId);
      const pendingStops = allStops.filter(s => s.status === 'pending');
      if (pendingStops.length > 0) {
        const nextStop = pendingStops[0];
        nextStop.status = 'current';
        this.stops.set(nextStop.id, nextStop);
      }
    }
    
    return updated;
  }

  async deleteStop(id: string): Promise<boolean> {
    const stop = this.stops.get(id);
    if (!stop) return false;
    
    this.stops.delete(id);
    
    const remainingStops = await this.getStops(stop.itineraryId);
    remainingStops.forEach((s, index) => {
      s.sequenceOrder = index + 1;
      this.stops.set(s.id, s);
    });
    
    return true;
  }

  async reorderStops(itineraryId: string, stopIds: string[]): Promise<Stop[]> {
    stopIds.forEach((id, index) => {
      const stop = this.stops.get(id);
      if (stop && stop.itineraryId === itineraryId) {
        stop.sequenceOrder = index + 1;
        this.stops.set(id, stop);
      }
    });
    return this.getStops(itineraryId);
  }

  async getNextStopCounter(): Promise<number> {
    this.stopCounter++;
    return this.stopCounter;
  }

  async findStopByAddress(itineraryId: string, latitude: number, longitude: number): Promise<Stop | null> {
    const tolerance = 0.00003;
    const stops = await this.getStops(itineraryId);
    
    for (const stop of stops) {
      if (stop.status !== 'delivered' && stop.status !== 'failed') {
        const latDiff = Math.abs(stop.latitude - latitude);
        const lngDiff = Math.abs(stop.longitude - longitude);
        if (latDiff < tolerance && lngDiff < tolerance) {
          return stop;
        }
      }
    }
    return null;
  }

  async incrementPackageCount(stopId: string): Promise<Stop | undefined> {
    const stop = this.stops.get(stopId);
    if (!stop) return undefined;
    
    const currentCount = stop.packageCount || 1;
    const updated = { ...stop, packageCount: currentCount + 1 };
    this.stops.set(stopId, updated);
    return updated;
  }

  async getExpenses(userId: string, startDate?: string, endDate?: string): Promise<Expense[]> {
    let expenses = Array.from(this.expenses.values())
      .filter(e => e.userId === userId);
    
    if (startDate) {
      expenses = expenses.filter(e => e.date >= startDate);
    }
    if (endDate) {
      expenses = expenses.filter(e => e.date <= endDate);
    }
    
    return expenses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getExpensesByDate(userId: string, date: string): Promise<Expense[]> {
    return Array.from(this.expenses.values())
      .filter(e => e.userId === userId && e.date === date)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createExpense(userId: string, accountId: string, data: InsertExpense): Promise<Expense> {
    const id = randomUUID();
    const expense: Expense = {
      id,
      userId,
      accountId,
      category: data.category,
      amount: data.amount,
      description: data.description,
      date: data.date || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };
    this.expenses.set(id, expense);
    return expense;
  }

  async deleteExpense(id: string): Promise<boolean> {
    return this.expenses.delete(id);
  }

  async getIncomes(userId: string, startDate?: string, endDate?: string): Promise<Income[]> {
    let incomes = Array.from(this.incomes.values())
      .filter(i => i.userId === userId);
    
    if (startDate) {
      incomes = incomes.filter(i => i.date >= startDate);
    }
    if (endDate) {
      incomes = incomes.filter(i => i.date <= endDate);
    }
    
    return incomes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getIncomesByDate(userId: string, date: string): Promise<Income[]> {
    return Array.from(this.incomes.values())
      .filter(i => i.userId === userId && i.date === date)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createIncome(userId: string, accountId: string, data: InsertIncome): Promise<Income> {
    const id = randomUUID();
    const income: Income = {
      id,
      userId,
      accountId,
      category: data.category,
      amount: data.amount,
      description: data.description,
      date: data.date || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };
    this.incomes.set(id, income);
    return income;
  }

  async deleteIncome(id: string): Promise<boolean> {
    return this.incomes.delete(id);
  }

  async getDeliveredStopsInPeriod(userId: string, startDate: string, endDate: string): Promise<Stop[]> {
    const userItineraries = Array.from(this.itineraries.values())
      .filter(it => it.userId === userId && it.date >= startDate && it.date <= endDate);
    
    const itineraryIds = new Set(userItineraries.map(it => it.id));
    
    return Array.from(this.stops.values())
      .filter(s => itineraryIds.has(s.itineraryId) && s.status === 'delivered');
  }

  async getIncomesInPeriod(userId: string, startDate: string, endDate: string): Promise<Income[]> {
    return Array.from(this.incomes.values())
      .filter(i => i.userId === userId && i.date >= startDate && i.date <= endDate);
  }

  async getExpensesInPeriod(userId: string, startDate: string, endDate: string): Promise<Expense[]> {
    return Array.from(this.expenses.values())
      .filter(e => e.userId === userId && e.date >= startDate && e.date <= endDate);
  }

  async getFinancialCycleHistory(userId: string): Promise<FinancialCycle[]> {
    return [];
  }

  async getDailyDeliveryStats(userId: string, startDate: string, endDate: string): Promise<Array<{ date: string; delivered: number; failed: number; earnings: number }>> {
    return [];
  }

  async getMonthlyDeliveryStats(userId: string, year: number, month: number): Promise<Array<{ day: number; delivered: number; earnings: number }>> {
    return [];
  }

  async createFinancialCycle(data: Omit<FinancialCycle, 'id' | 'createdAt' | 'updatedAt' | 'paidAt'>): Promise<FinancialCycle> {
    const id = randomUUID();
    const cycle: FinancialCycle = {
      id,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return cycle;
  }

  async updateFinancialCycleStatus(id: string, status: FinancialCycleStatus): Promise<FinancialCycle | undefined> {
    return undefined;
  }
}

const memStorage = new MemStorage();

export const storage: IStorage = isSupabaseConfigured() ? supabaseStorage : memStorage;

export const getStorage = (): IStorage => {
  return isSupabaseConfigured() ? supabaseStorage : memStorage;
};
