import type { User, Itinerary, Stop, InsertStop, Expense, InsertExpense, Income, InsertIncome, FinancialCycle, FinancialCycleStatus, AccountSettings, UpdateSettings, SubscriptionInfo } from "@shared/schema";
import { BUSINESS_RULES } from "@shared/schema";
import type { IStorage } from "./storage";
import { supabaseAdmin } from "./supabase";
import bcrypt from "bcryptjs";

interface AccountSubscription {
  id: string;
  account_id: string;
  plan: string;
  status: string;
  trial_start_date: string;
  trial_end_date: string;
  paid_start_date: string | null;
  paid_end_date: string | null;
}

interface DbUser {
  id: string;
  account_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  is_active: boolean;
}

interface DbItinerary {
  id: string;
  account_id: string;
  user_id: string;
  date: string;
  name: string;
  status: string;
  total_earnings: number;
  created_at: string;
}

interface DbStop {
  id: string;
  itinerary_id: string;
  account_id: string;
  fixed_identifier: string;
  address_full: string;
  latitude: number;
  longitude: number;
  sequence_order: number;
  status: string;
  package_count: number;
  delivery_time: string | null;
  created_at: string;
}

interface DbExpense {
  id: string;
  user_id: string;
  account_id: string;
  category: string;
  amount: number;
  description: string | null;
  date: string;
  created_at: string;
}

interface DbIncome {
  id: string;
  user_id: string;
  account_id: string;
  category: string;
  amount: number;
  description: string | null;
  date: string;
  created_at: string;
}

export interface ExtendedUser extends User {
  accountId: string;
  passwordHash?: string;
  role: string;
}

export class SupabaseStorage implements IStorage {
  
  private mapDbUserToUser(dbUser: DbUser): ExtendedUser {
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      accountId: dbUser.account_id,
      role: dbUser.role,
    };
  }

  private mapDbItineraryToItinerary(dbIt: DbItinerary): Itinerary {
    return {
      id: dbIt.id,
      userId: dbIt.user_id,
      date: dbIt.date,
      name: dbIt.name,
      status: dbIt.status as 'active' | 'completed',
      totalEarnings: Number(dbIt.total_earnings),
      createdAt: dbIt.created_at,
    };
  }

  private mapDbStopToStop(dbStop: DbStop): Stop {
    return {
      id: dbStop.id,
      itineraryId: dbStop.itinerary_id,
      fixedIdentifier: dbStop.fixed_identifier,
      addressFull: dbStop.address_full,
      latitude: dbStop.latitude,
      longitude: dbStop.longitude,
      sequenceOrder: dbStop.sequence_order,
      status: dbStop.status as 'pending' | 'current' | 'delivered' | 'failed',
      packageCount: dbStop.package_count || 1,
      deliveryTime: dbStop.delivery_time || undefined,
      createdAt: dbStop.created_at,
    };
  }

  async getUser(id: string): Promise<ExtendedUser | undefined> {
    if (!supabaseAdmin) return undefined;

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return undefined;
    return this.mapDbUserToUser(data as DbUser);
  }

  async getUserByEmail(email: string): Promise<ExtendedUser | undefined> {
    if (!supabaseAdmin) return undefined;

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !data) return undefined;
    
    const dbUser = data as DbUser;
    return {
      ...this.mapDbUserToUser(dbUser),
      passwordHash: dbUser.password_hash,
    };
  }

  async createUser(email: string, name: string, password?: string): Promise<ExtendedUser> {
    if (!supabaseAdmin) throw new Error('Supabase not configured');

    const passwordHash = password ? await bcrypt.hash(password, 10) : await bcrypt.hash('default', 10);
    
    // Create account first
    const { data: accountData, error: accountError } = await supabaseAdmin
      .from('accounts')
      .insert({ name, email })
      .select()
      .single();

    if (accountError) {
      if (accountError.code === '23505' || accountError.message?.includes('unique constraint')) {
        throw new Error('Este email já está cadastrado. Tente fazer login.');
      }
      console.error('Error creating account:', accountError);
      throw new Error('Erro ao criar conta');
    }

    // Create user
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        account_id: accountData.id,
        email,
        password_hash: passwordHash,
        name,
        role: 'admin',
        is_active: true,
      })
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      // Try to rollback account
      await supabaseAdmin.from('accounts').delete().eq('id', accountData.id);
      throw new Error('Erro ao criar usuário');
    }

    // Create subscription (16-day trial)
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 16);

    const { error: subError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        account_id: accountData.id,
        plan: 'trial',
        status: 'active',
        trial_start_date: now.toISOString().split('T')[0],
        trial_end_date: trialEnd.toISOString().split('T')[0],
      });

    if (subError) {
      console.error('Error creating subscription:', subError);
    }

    return {
      id: userData.id,
      email,
      name,
      accountId: accountData.id,
      role: 'admin',
    };
  }

  async validatePassword(email: string, password: string): Promise<ExtendedUser | undefined> {
    const user = await this.getUserByEmail(email);
    if (!user || !user.passwordHash) return undefined;

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return undefined;

    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword as ExtendedUser;
  }

  async getSubscriptionInfo(accountId: string): Promise<SubscriptionInfo> {
    if (!supabaseAdmin) {
      return {
        plan: 'trial',
        status: 'active',
        trialDaysRemaining: 16,
        isTrialExpired: false,
        canAccessFinancials: true,
      };
    }

    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('account_id', accountId)
      .single();

    if (error || !data) {
      return {
        plan: 'trial',
        status: 'expired',
        trialDaysRemaining: 0,
        isTrialExpired: true,
        canAccessFinancials: false,
      };
    }

    const subscription = data as AccountSubscription;
    const now = new Date();
    
    const trialEndDate = new Date(subscription.trial_end_date);
    const trialDiffTime = trialEndDate.getTime() - now.getTime();
    const trialDiffDays = Math.ceil(trialDiffTime / (1000 * 60 * 60 * 24));
    const trialDaysRemaining = Math.max(0, trialDiffDays);
    
    let subscriptionDaysRemaining: number | undefined;
    let paidEndDate: string | null = null;
    
    if (subscription.paid_end_date) {
      paidEndDate = subscription.paid_end_date;
      const paidEnd = new Date(subscription.paid_end_date);
      const paidDiffTime = paidEnd.getTime() - now.getTime();
      const paidDiffDays = Math.ceil(paidDiffTime / (1000 * 60 * 60 * 24));
      subscriptionDaysRemaining = Math.max(0, paidDiffDays);
    }
    
    const isTrialExpired = subscription.plan === 'trial' && trialDaysRemaining <= 0;
    const isPaidActive = subscription.plan !== 'trial' && subscription.status === 'active' && (subscriptionDaysRemaining ?? 0) > 0;
    const isPaidExpired = subscription.plan !== 'trial' && (subscriptionDaysRemaining ?? 0) <= 0;
    
    return {
      plan: subscription.plan,
      status: subscription.status,
      trialDaysRemaining,
      isTrialExpired: isTrialExpired || isPaidExpired,
      canAccessFinancials: isPaidActive || (!isTrialExpired && subscription.plan === 'trial'),
      subscriptionDaysRemaining,
      paidEndDate,
    };
  }

  async getAccountSettings(accountId: string): Promise<AccountSettings> {
    if (!supabaseAdmin) {
      return {
        earningPerDelivery: BUSINESS_RULES.EARNING_PER_DELIVERY,
        sundayBonusThreshold: BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD,
        sundayBonusValue: BUSINESS_RULES.SUNDAY_BONUS_VALUE,
      };
    }

    const { data, error } = await supabaseAdmin
      .from('accounts')
      .select('earning_per_delivery, sunday_bonus_threshold, sunday_bonus_value, start_address, start_latitude, start_longitude')
      .eq('id', accountId)
      .single();

    if (error || !data) {
      return {
        earningPerDelivery: BUSINESS_RULES.EARNING_PER_DELIVERY,
        sundayBonusThreshold: BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD,
        sundayBonusValue: BUSINESS_RULES.SUNDAY_BONUS_VALUE,
      };
    }

    return {
      earningPerDelivery: data.earning_per_delivery ?? BUSINESS_RULES.EARNING_PER_DELIVERY,
      sundayBonusThreshold: data.sunday_bonus_threshold ?? BUSINESS_RULES.SUNDAY_BONUS_THRESHOLD,
      sundayBonusValue: data.sunday_bonus_value ?? BUSINESS_RULES.SUNDAY_BONUS_VALUE,
      startAddress: data.start_address ?? undefined,
      startLatitude: data.start_latitude ?? undefined,
      startLongitude: data.start_longitude ?? undefined,
    };
  }

  async updateAccountSettings(accountId: string, settings: UpdateSettings): Promise<AccountSettings> {
    if (!supabaseAdmin) {
      return {
        earningPerDelivery: settings.earningPerDelivery,
        sundayBonusThreshold: settings.sundayBonusThreshold,
        sundayBonusValue: settings.sundayBonusValue,
        startAddress: settings.startAddress,
        startLatitude: settings.startLatitude,
        startLongitude: settings.startLongitude,
      };
    }

    const updateData: Record<string, any> = {
      earning_per_delivery: settings.earningPerDelivery,
      sunday_bonus_threshold: settings.sundayBonusThreshold,
      sunday_bonus_value: settings.sundayBonusValue,
      updated_at: new Date().toISOString(),
    };

    if (settings.startAddress !== undefined) {
      updateData.start_address = settings.startAddress;
    }
    if (settings.startLatitude !== undefined) {
      updateData.start_latitude = settings.startLatitude;
    }
    if (settings.startLongitude !== undefined) {
      updateData.start_longitude = settings.startLongitude;
    }

    const { data, error } = await supabaseAdmin
      .from('accounts')
      .update(updateData)
      .eq('id', accountId)
      .select('earning_per_delivery, sunday_bonus_threshold, sunday_bonus_value, start_address, start_latitude, start_longitude')
      .single();

    if (error) {
      console.error('Supabase updateAccountSettings error:', error.message, error.code, error.details);
      throw new Error(`Erro ao atualizar configuracoes: ${error.message}`);
    }
    
    if (!data) {
      throw new Error('Erro ao atualizar configuracoes: conta nao encontrada');
    }

    return {
      earningPerDelivery: data.earning_per_delivery,
      sundayBonusThreshold: data.sunday_bonus_threshold,
      sundayBonusValue: data.sunday_bonus_value,
      startAddress: data.start_address ?? undefined,
      startLatitude: data.start_latitude ?? undefined,
      startLongitude: data.start_longitude ?? undefined,
    };
  }

  async getItinerary(userId: string, date: string): Promise<Itinerary | undefined> {
    if (!supabaseAdmin) return undefined;

    const { data, error } = await supabaseAdmin
      .from('itineraries')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .eq('status', 'active')
      .single();

    if (error || !data) return undefined;
    return this.mapDbItineraryToItinerary(data as DbItinerary);
  }

  async getActiveItinerary(userId: string): Promise<Itinerary | undefined> {
    if (!supabaseAdmin) return undefined;

    const { data, error } = await supabaseAdmin
      .from('itineraries')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return undefined;
    return this.mapDbItineraryToItinerary(data as DbItinerary);
  }

  async getCompletedItineraries(userId: string, limit: number = 10): Promise<Itinerary[]> {
    if (!supabaseAdmin) return [];

    const { data, error } = await supabaseAdmin
      .from('itineraries')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return (data as DbItinerary[]).map(this.mapDbItineraryToItinerary);
  }

  async createItinerary(userId: string, date: string, name: string): Promise<Itinerary> {
    if (!supabaseAdmin) throw new Error('Supabase not configured');

    const user = await this.getUser(userId);
    if (!user) throw new Error('User not found');

    const existingActive = await this.getActiveItinerary(userId);
    if (existingActive) {
      await supabaseAdmin
        .from('itineraries')
        .update({ status: 'completed' })
        .eq('id', existingActive.id);
    }

    await this.resetStopCounter(user.accountId);

    console.log('Inserting itinerary with accountId:', user.accountId, 'userId:', userId);

    const { data, error } = await supabaseAdmin
      .from('itineraries')
      .insert({
        account_id: user.accountId,
        user_id: userId,
        date,
        name,
        status: 'active',
        total_earnings: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase createItinerary error details:', error);
      // Fallback for demo or development if RLS is still problematic
      if (error.code === '42501') {
        console.warn('RLS bypass failed, check Service Role Key permissions');
      }
      throw new Error(`Erro ao criar rota: ${error.message}`);
    }
    
    if (!data) throw new Error('Erro ao criar rota: nenhum dado retornado');
    return this.mapDbItineraryToItinerary(data as DbItinerary);
  }

  async updateItinerary(id: string, updates: Partial<Itinerary>): Promise<Itinerary | undefined> {
    if (!supabaseAdmin) return undefined;

    const dbUpdates: Record<string, unknown> = {};
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.totalEarnings !== undefined) dbUpdates.total_earnings = updates.totalEarnings;
    if (updates.name) dbUpdates.name = updates.name;

    const { data, error } = await supabaseAdmin
      .from('itineraries')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return undefined;
    return this.mapDbItineraryToItinerary(data as DbItinerary);
  }

  async getStops(itineraryId: string): Promise<Stop[]> {
    if (!supabaseAdmin) return [];

    const { data, error } = await supabaseAdmin
      .from('stops')
      .select('*')
      .eq('itinerary_id', itineraryId)
      .order('sequence_order', { ascending: true });

    if (error || !data) return [];
    return (data as DbStop[]).map(this.mapDbStopToStop);
  }

  async getStopsByUserId(userId: string): Promise<Stop[]> {
    if (!supabaseAdmin) return [];

    const itinerary = await this.getActiveItinerary(userId);
    if (!itinerary) return [];
    return this.getStops(itinerary.id);
  }

  async createStop(
    itineraryId: string,
    data: InsertStop,
    fixedIdentifier: string,
    sequenceOrder: number
  ): Promise<Stop> {
    if (!supabaseAdmin) throw new Error('Supabase not configured');

    const { data: itinerary } = await supabaseAdmin
      .from('itineraries')
      .select('account_id')
      .eq('id', itineraryId)
      .single();

    if (!itinerary) throw new Error('Itinerary not found');

    const { data: stop, error } = await supabaseAdmin
      .from('stops')
      .insert({
        itinerary_id: itineraryId,
        account_id: itinerary.account_id,
        fixed_identifier: fixedIdentifier,
        address_full: data.addressFull,
        latitude: data.latitude,
        longitude: data.longitude,
        sequence_order: sequenceOrder,
        status: 'pending',
        package_count: 1,
      })
      .select()
      .single();

    if (error || !stop) throw new Error('Erro ao criar parada');
    return this.mapDbStopToStop(stop as DbStop);
  }

  async findStopByAddress(itineraryId: string, latitude: number, longitude: number): Promise<Stop | null> {
    if (!supabaseAdmin) return null;

    const tolerance = 0.00003;

    const { data } = await supabaseAdmin
      .from('stops')
      .select('*')
      .eq('itinerary_id', itineraryId)
      .gte('latitude', latitude - tolerance)
      .lte('latitude', latitude + tolerance)
      .gte('longitude', longitude - tolerance)
      .lte('longitude', longitude + tolerance)
      .limit(1);

    if (!data || data.length === 0) return null;
    return this.mapDbStopToStop(data[0] as DbStop);
  }

  async incrementPackageCount(stopId: string): Promise<Stop | undefined> {
    if (!supabaseAdmin) return undefined;

    const { data: existingStop } = await supabaseAdmin
      .from('stops')
      .select('package_count')
      .eq('id', stopId)
      .single();

    const currentCount = existingStop?.package_count || 1;

    const { data, error } = await supabaseAdmin
      .from('stops')
      .update({ package_count: currentCount + 1 })
      .eq('id', stopId)
      .select()
      .single();

    if (error || !data) return undefined;
    return this.mapDbStopToStop(data as DbStop);
  }

  async updateStop(id: string, updates: Partial<Stop>): Promise<Stop | undefined> {
    if (!supabaseAdmin) return undefined;

    console.log('Updating stop:', id, 'with updates:', updates);

    const { data: existingStop, error: selectError } = await supabaseAdmin
      .from('stops')
      .select('*')
      .eq('id', id)
      .single();

    if (selectError) {
      console.error('Supabase updateStop select error:', selectError);
      return undefined;
    }

    if (!existingStop) {
      console.error('Supabase updateStop: stop not found for id:', id);
      return undefined;
    }

    console.log('Found existing stop:', existingStop);

    const dbUpdates: Record<string, unknown> = {};
    if (updates.status) {
      dbUpdates.status = updates.status;
    }
    if (updates.sequenceOrder !== undefined) dbUpdates.sequence_order = updates.sequenceOrder;
    if (updates.addressFull !== undefined) dbUpdates.address_full = updates.addressFull;
    if (updates.latitude !== undefined) dbUpdates.latitude = updates.latitude;
    if (updates.longitude !== undefined) dbUpdates.longitude = updates.longitude;

    console.log('Applying dbUpdates:', dbUpdates);

    const { data, error } = await supabaseAdmin
      .from('stops')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase updateStop error:', error);
      return undefined;
    }
    
    if (!data) {
      console.error('Supabase updateStop: no data returned after update');
      return undefined;
    }

    console.log('Stop updated successfully:', data);
    
    const updatedStop = this.mapDbStopToStop(data as DbStop);

    if (updates.status === 'delivered' || updates.status === 'failed') {
      const allStops = await this.getStops(updatedStop.itineraryId);
      const pendingStops = allStops.filter(s => s.status === 'pending');
      if (pendingStops.length > 0) {
        await supabaseAdmin
          .from('stops')
          .update({ status: 'current' })
          .eq('id', pendingStops[0].id);
      }
    }

    return updatedStop;
  }

  async deleteStop(id: string): Promise<boolean> {
    if (!supabaseAdmin) {
      console.log('deleteStop: supabaseAdmin not initialized');
      return false;
    }

    console.log('deleteStop: Looking for stop with id:', id);
    
    const { data: stop, error: selectError } = await supabaseAdmin
      .from('stops')
      .select('itinerary_id')
      .eq('id', id)
      .single();

    if (selectError) {
      console.log('deleteStop: Error finding stop:', selectError);
    }
    
    if (!stop) {
      console.log('deleteStop: Stop not found');
      return false;
    }
    
    console.log('deleteStop: Found stop, deleting...');

    const { error } = await supabaseAdmin
      .from('stops')
      .delete()
      .eq('id', id);

    if (error) {
      console.log('deleteStop: Error deleting stop:', error);
      return false;
    }

    const remainingStops = await this.getStops(stop.itinerary_id);
    for (let i = 0; i < remainingStops.length; i++) {
      await supabaseAdmin
        .from('stops')
        .update({ sequence_order: i + 1 })
        .eq('id', remainingStops[i].id);
    }

    return true;
  }

  async reorderStops(itineraryId: string, stopIds: string[]): Promise<Stop[]> {
    if (!supabaseAdmin) return [];

    console.log('reorderStops called with:', { itineraryId, stopIds });

    for (let i = 0; i < stopIds.length; i++) {
      const { data, error } = await supabaseAdmin
        .from('stops')
        .update({ sequence_order: i + 1 })
        .eq('id', stopIds[i])
        .eq('itinerary_id', itineraryId)
        .select()
        .single();
      
      if (error) {
        console.error('reorderStops update error for stop', stopIds[i], ':', error);
      } else {
        console.log('reorderStops updated stop', stopIds[i], 'to sequence_order', i + 1, 'result:', data?.sequence_order);
      }
    }

    return this.getStops(itineraryId);
  }

  async getNextStopCounter(accountId: string): Promise<number> {
    if (!supabaseAdmin) return 1;

    // Contar todos os stops já criados para esta account (de todas as rotas)
    // e usar esse valor + 1 como o próximo número de pacote
    const { count, error } = await supabaseAdmin
      .from('stops')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId);
    
    if (error) {
      console.error('Error counting stops:', error);
      return 1;
    }
    
    const nextCounter = (count || 0) + 1;
    console.log('getNextStopCounter - accountId:', accountId, 'total stops:', count, 'next:', nextCounter);
    return nextCounter;
  }

  async resetStopCounter(accountId: string): Promise<void> {
    // Não é mais necessário resetar pois usamos contagem de stops
    // Mas vamos manter a função para compatibilidade
    console.log('resetStopCounter called for account:', accountId, '(using stop count method now)');
  }

  private mapDbExpenseToExpense(db: DbExpense): Expense {
    return {
      id: db.id,
      userId: db.user_id,
      accountId: db.account_id,
      category: db.category as Expense['category'],
      amount: db.amount,
      description: db.description || undefined,
      date: db.date,
      createdAt: db.created_at,
    };
  }

  async getExpenses(userId: string, startDate?: string, endDate?: string): Promise<Expense[]> {
    if (!supabaseAdmin) return [];

    let query = supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return (data as DbExpense[]).map(this.mapDbExpenseToExpense);
  }

  async getExpensesByDate(userId: string, date: string): Promise<Expense[]> {
    if (!supabaseAdmin) return [];

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return (data as DbExpense[]).map(this.mapDbExpenseToExpense);
  }

  async createExpense(userId: string, accountId: string, data: InsertExpense): Promise<Expense> {
    if (!supabaseAdmin) throw new Error('Supabase not configured');

    const { data: expense, error } = await supabaseAdmin
      .from('expenses')
      .insert({
        user_id: userId,
        account_id: accountId,
        category: data.category,
        amount: data.amount,
        description: data.description || null,
        date: data.date || new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error || !expense) throw new Error('Erro ao criar despesa');
    return this.mapDbExpenseToExpense(expense as DbExpense);
  }

  async deleteExpense(id: string): Promise<boolean> {
    if (!supabaseAdmin) return false;

    const { error } = await supabaseAdmin
      .from('expenses')
      .delete()
      .eq('id', id);

    return !error;
  }

  private mapDbIncomeToIncome(db: DbIncome): Income {
    return {
      id: db.id,
      userId: db.user_id,
      accountId: db.account_id,
      category: db.category as Income['category'],
      amount: db.amount,
      description: db.description || undefined,
      date: db.date,
      createdAt: db.created_at,
    };
  }

  async getIncomes(userId: string, startDate?: string, endDate?: string): Promise<Income[]> {
    if (!supabaseAdmin) return [];

    let query = supabaseAdmin
      .from('incomes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return (data as DbIncome[]).map(this.mapDbIncomeToIncome);
  }

  async getIncomesByDate(userId: string, date: string): Promise<Income[]> {
    if (!supabaseAdmin) return [];

    const { data, error } = await supabaseAdmin
      .from('incomes')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return (data as DbIncome[]).map(this.mapDbIncomeToIncome);
  }

  async createIncome(userId: string, accountId: string, data: InsertIncome): Promise<Income> {
    if (!supabaseAdmin) throw new Error('Supabase not configured');

    const { data: income, error } = await supabaseAdmin
      .from('incomes')
      .insert({
        user_id: userId,
        account_id: accountId,
        category: data.category,
        amount: data.amount,
        description: data.description || null,
        date: data.date || new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error || !income) throw new Error('Erro ao criar renda');
    return this.mapDbIncomeToIncome(income as DbIncome);
  }

  async deleteIncome(id: string): Promise<boolean> {
    if (!supabaseAdmin) return false;

    const { error } = await supabaseAdmin
      .from('incomes')
      .delete()
      .eq('id', id);

    return !error;
  }

  async generateUniqueRouteName(userId: string, baseName: string): Promise<string> {
    if (!supabaseAdmin) return baseName;

    const { data: existingRoutes } = await supabaseAdmin
      .from('itineraries')
      .select('name')
      .eq('user_id', userId)
      .like('name', `${baseName}%`);
    
    if (!existingRoutes || existingRoutes.length === 0) {
      return baseName;
    }

    const existingNames = existingRoutes.map(r => r.name);
    let suffix = 2;
    while (existingNames.includes(`${baseName}-${suffix.toString().padStart(2, '0')}`)) {
      suffix++;
    }
    return `${baseName}-${suffix.toString().padStart(2, '0')}`;
  }

  async saveEarningsHistory(data: {
    accountId: string;
    userId: string;
    itineraryId: string;
    date: string;
    deliveriesCount: number;
    totalEarnings: number;
  }): Promise<void> {
    if (!supabaseAdmin) return;

    await supabaseAdmin
      .from('earnings_history')
      .insert({
        account_id: data.accountId,
        user_id: data.userId,
        itinerary_id: data.itineraryId,
        date: data.date,
        deliveries_count: data.deliveriesCount,
        total_earnings: data.totalEarnings,
      });
  }

  async getDeliveredStopsInPeriod(userId: string, startDate: string, endDate: string): Promise<Stop[]> {
    if (!supabaseAdmin) return [];

    const { data: itineraries } = await supabaseAdmin
      .from('itineraries')
      .select('id')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (!itineraries || itineraries.length === 0) return [];

    const itineraryIds = itineraries.map(it => it.id);

    const { data: stops } = await supabaseAdmin
      .from('stops')
      .select('*')
      .in('itinerary_id', itineraryIds)
      .eq('status', 'delivered');

    if (!stops) return [];

    return stops.map(s => this.mapDbStopToStop(s));
  }

  async getIncomesInPeriod(userId: string, startDate: string, endDate: string): Promise<Income[]> {
    if (!supabaseAdmin) return [];

    const { data } = await supabaseAdmin
      .from('incomes')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('created_at', { ascending: false });

    if (!data) return [];

    return data.map(i => ({
      id: i.id,
      userId: i.user_id,
      accountId: i.account_id,
      category: i.category,
      amount: parseFloat(i.amount),
      description: i.description,
      date: i.date,
      createdAt: i.created_at,
    }));
  }

  async getExpensesInPeriod(userId: string, startDate: string, endDate: string): Promise<Expense[]> {
    if (!supabaseAdmin) return [];

    const { data } = await supabaseAdmin
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('created_at', { ascending: false });

    if (!data) return [];

    return data.map(e => ({
      id: e.id,
      userId: e.user_id,
      accountId: e.account_id,
      category: e.category,
      amount: parseFloat(e.amount),
      description: e.description,
      date: e.date,
      createdAt: e.created_at,
    }));
  }

  async getFinancialCycleHistory(userId: string): Promise<FinancialCycle[]> {
    if (!supabaseAdmin) return [];

    const { data } = await supabaseAdmin
      .from('financial_cycles')
      .select('*')
      .eq('user_id', userId)
      .order('cycle_start', { ascending: false })
      .limit(10);

    if (!data) return [];

    return data.map(c => ({
      id: c.id,
      userId: c.user_id,
      accountId: c.account_id,
      cycleStart: c.cycle_start,
      cycleEnd: c.cycle_end,
      deliveriesCount: c.deliveries_count,
      baseEarnings: parseFloat(c.base_earnings),
      bonusEarnings: parseFloat(c.bonus_earnings),
      otherIncomes: parseFloat(c.other_incomes),
      totalEarnings: parseFloat(c.total_earnings),
      totalExpenses: parseFloat(c.total_expenses),
      netProfit: parseFloat(c.net_profit),
      status: c.status as FinancialCycleStatus,
      paidAt: c.paid_at,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
  }

  async getDailyDeliveryStats(userId: string, startDate: string, endDate: string): Promise<Array<{ date: string; delivered: number; failed: number; earnings: number }>> {
    if (!supabaseAdmin) return [];

    const { data: itineraries } = await supabaseAdmin
      .from('itineraries')
      .select('id, date')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (!itineraries || itineraries.length === 0) return [];

    const itineraryIds = itineraries.map(it => it.id);
    const dateMap = new Map(itineraries.map(it => [it.id, it.date]));

    const { data: stops } = await supabaseAdmin
      .from('stops')
      .select('itinerary_id, status, package_count')
      .in('itinerary_id', itineraryIds)
      .in('status', ['delivered', 'failed']);

    if (!stops) return [];

    const dailyStats: Record<string, { delivered: number; failed: number }> = {};

    stops.forEach(s => {
      const date = dateMap.get(s.itinerary_id) || '';
      if (!dailyStats[date]) {
        dailyStats[date] = { delivered: 0, failed: 0 };
      }
      if (s.status === 'delivered') {
        // Somar packageCount ao invés de incrementar 1
        dailyStats[date].delivered += (s.package_count || 1);
      } else if (s.status === 'failed') {
        dailyStats[date].failed++;
      }
    });

    return Object.entries(dailyStats)
      .map(([date, stats]) => ({
        date,
        delivered: stats.delivered,
        failed: stats.failed,
        earnings: stats.delivered * BUSINESS_RULES.EARNING_PER_DELIVERY,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getMonthlyDeliveryStats(userId: string, year: number, month: number): Promise<Array<{ day: number; delivered: number; earnings: number }>> {
    if (!supabaseAdmin) return [];

    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = `${year}-${month.toString().padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

    const { data: itineraries } = await supabaseAdmin
      .from('itineraries')
      .select('id, date')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (!itineraries || itineraries.length === 0) return [];

    const itineraryIds = itineraries.map(it => it.id);
    const dateMap = new Map(itineraries.map(it => [it.id, it.date]));

    const { data: stops } = await supabaseAdmin
      .from('stops')
      .select('itinerary_id, package_count')
      .in('itinerary_id', itineraryIds)
      .eq('status', 'delivered');

    if (!stops) return [];

    const dailyStats: Record<number, number> = {};

    stops.forEach(s => {
      const date = dateMap.get(s.itinerary_id) || '';
      const day = parseInt(date.split('-')[2]);
      // Somar packageCount ao invés de incrementar 1
      dailyStats[day] = (dailyStats[day] || 0) + (s.package_count || 1);
    });

    return Object.entries(dailyStats)
      .map(([dayStr, delivered]) => ({
        day: parseInt(dayStr),
        delivered,
        earnings: delivered * BUSINESS_RULES.EARNING_PER_DELIVERY,
      }))
      .sort((a, b) => a.day - b.day);
  }

  async createFinancialCycle(data: Omit<FinancialCycle, 'id' | 'createdAt' | 'updatedAt' | 'paidAt'>): Promise<FinancialCycle> {
    if (!supabaseAdmin) {
      throw new Error('Supabase not configured');
    }

    const { data: existing } = await supabaseAdmin
      .from('financial_cycles')
      .select('id')
      .eq('user_id', data.userId)
      .eq('cycle_start', data.cycleStart)
      .eq('cycle_end', data.cycleEnd)
      .single();

    if (existing) {
      const { data: updated, error } = await supabaseAdmin
        .from('financial_cycles')
        .update({
          deliveries_count: data.deliveriesCount,
          base_earnings: data.baseEarnings,
          bonus_earnings: data.bonusEarnings,
          other_incomes: data.otherIncomes,
          total_earnings: data.totalEarnings,
          total_expenses: data.totalExpenses,
          net_profit: data.netProfit,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error || !updated) throw new Error('Failed to update cycle');

      return {
        id: updated.id,
        userId: updated.user_id,
        accountId: updated.account_id,
        cycleStart: updated.cycle_start,
        cycleEnd: updated.cycle_end,
        deliveriesCount: updated.deliveries_count,
        baseEarnings: parseFloat(updated.base_earnings),
        bonusEarnings: parseFloat(updated.bonus_earnings),
        otherIncomes: parseFloat(updated.other_incomes),
        totalEarnings: parseFloat(updated.total_earnings),
        totalExpenses: parseFloat(updated.total_expenses),
        netProfit: parseFloat(updated.net_profit),
        status: updated.status as FinancialCycleStatus,
        paidAt: updated.paid_at,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      };
    }

    const { data: created, error } = await supabaseAdmin
      .from('financial_cycles')
      .insert({
        account_id: data.accountId,
        user_id: data.userId,
        cycle_start: data.cycleStart,
        cycle_end: data.cycleEnd,
        deliveries_count: data.deliveriesCount,
        base_earnings: data.baseEarnings,
        bonus_earnings: data.bonusEarnings,
        other_incomes: data.otherIncomes,
        total_earnings: data.totalEarnings,
        total_expenses: data.totalExpenses,
        net_profit: data.netProfit,
        status: data.status,
      })
      .select()
      .single();

    if (error || !created) throw new Error('Failed to create cycle');

    return {
      id: created.id,
      userId: created.user_id,
      accountId: created.account_id,
      cycleStart: created.cycle_start,
      cycleEnd: created.cycle_end,
      deliveriesCount: created.deliveries_count,
      baseEarnings: parseFloat(created.base_earnings),
      bonusEarnings: parseFloat(created.bonus_earnings),
      otherIncomes: parseFloat(created.other_incomes),
      totalEarnings: parseFloat(created.total_earnings),
      totalExpenses: parseFloat(created.total_expenses),
      netProfit: parseFloat(created.net_profit),
      status: created.status as FinancialCycleStatus,
      paidAt: created.paid_at,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };
  }

  async updateFinancialCycleStatus(id: string, status: FinancialCycleStatus): Promise<FinancialCycle | undefined> {
    if (!supabaseAdmin) return undefined;

    const updateData: Record<string, unknown> = { 
      status, 
      updated_at: new Date().toISOString() 
    };
    
    if (status === 'paid') {
      updateData.paid_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('financial_cycles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return undefined;

    return {
      id: data.id,
      userId: data.user_id,
      accountId: data.account_id,
      cycleStart: data.cycle_start,
      cycleEnd: data.cycle_end,
      deliveriesCount: data.deliveries_count,
      baseEarnings: parseFloat(data.base_earnings),
      bonusEarnings: parseFloat(data.bonus_earnings),
      otherIncomes: parseFloat(data.other_incomes),
      totalEarnings: parseFloat(data.total_earnings),
      totalExpenses: parseFloat(data.total_expenses),
      netProfit: parseFloat(data.net_profit),
      status: data.status as FinancialCycleStatus,
      paidAt: data.paid_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  // =====================================================
  // MÉTODOS DE ADMINISTRADOR
  // =====================================================

  async createAdmin(email: string, name: string, password: string): Promise<{ id: string; email: string; name: string } | { error: string }> {
    if (!supabaseAdmin) return { error: 'Supabase não configurado' };

    const { data: existing, error: checkError } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('email', email)
      .single();

    if (checkError && checkError.code === '42501') {
      console.error('Create admin permission error:', checkError);
      return { error: 'Permissão negada. Desabilite RLS na tabela admins no Supabase ou adicione políticas adequadas.' };
    }

    if (existing) return { error: 'Este email já está cadastrado' };

    const passwordHash = await bcrypt.hash(password, 10);

    const { data, error } = await supabaseAdmin
      .from('admins')
      .insert({
        email,
        name,
        password_hash: passwordHash,
      })
      .select()
      .single();

    if (error) {
      console.error('Create admin error:', error);
      if (error.code === '42501') {
        return { error: 'Permissão negada. Desabilite RLS na tabela admins no Supabase ou adicione políticas adequadas.' };
      }
      return { error: 'Erro ao criar administrador' };
    }

    if (!data) return { error: 'Erro ao criar administrador' };

    return { id: data.id, email: data.email, name: data.name };
  }

  async validateAdminPassword(email: string, password: string): Promise<{ id: string; email: string; name: string } | null> {
    if (!supabaseAdmin) return null;

    const { data, error } = await supabaseAdmin
      .from('admins')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;

    const isValid = await bcrypt.compare(password, data.password_hash);
    if (!isValid) return null;

    return { id: data.id, email: data.email, name: data.name };
  }

  async getAdmin(id: string): Promise<{ id: string; email: string; name: string } | null> {
    if (!supabaseAdmin) return null;

    const { data, error } = await supabaseAdmin
      .from('admins')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error || !data) return null;

    return { id: data.id, email: data.email, name: data.name };
  }

  async getAdminSettings(): Promise<{ subscriptionPrice: number }> {
    if (!supabaseAdmin) return { subscriptionPrice: 29.90 };

    const { data, error } = await supabaseAdmin
      .from('admin_settings')
      .select('*')
      .eq('key', 'global')
      .single();

    if (error || !data) {
      return { subscriptionPrice: 29.90 };
    }

    return { subscriptionPrice: data.subscription_price || 29.90 };
  }

  async updateAdminSettings(settings: { subscriptionPrice: number }): Promise<{ subscriptionPrice: number }> {
    if (!supabaseAdmin) return settings;

    const { data, error } = await supabaseAdmin
      .from('admin_settings')
      .upsert({
        key: 'global',
        subscription_price: settings.subscriptionPrice,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
      .select()
      .single();

    if (error) {
      console.error('Error updating admin settings:', error);
      return settings;
    }

    return { subscriptionPrice: data?.subscription_price || settings.subscriptionPrice };
  }

  async getAllAccountsWithSubscriptions(): Promise<any[]> {
    if (!supabaseAdmin) return [];

    const { data: accounts, error } = await supabaseAdmin
      .from('accounts')
      .select(`
        id,
        name,
        email,
        created_at,
        subscriptions (
          id,
          plan,
          status,
          trial_start_date,
          trial_end_date,
          paid_start_date,
          paid_end_date
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ADMIN] Error fetching accounts:', error);
      return [];
    }
    
    if (!accounts) return [];

    console.log('[ADMIN] Raw accounts data:', JSON.stringify(accounts, null, 2));

    return accounts.map((acc: any) => {
      const subscriptionData = Array.isArray(acc.subscriptions) ? acc.subscriptions[0] : acc.subscriptions;
      console.log(`[ADMIN] Account ${acc.email} subscription:`, subscriptionData);
      
      return {
        id: acc.id,
        name: acc.name,
        email: acc.email,
        createdAt: acc.created_at,
        subscription: subscriptionData ? {
          id: subscriptionData.id,
          plan: subscriptionData.plan,
          status: subscriptionData.status,
          trialStartDate: subscriptionData.trial_start_date,
          trialEndDate: subscriptionData.trial_end_date,
          paidStartDate: subscriptionData.paid_start_date,
          paidEndDate: subscriptionData.paid_end_date,
        } : null,
      };
    });
  }

  async updateAccountTrial(accountId: string, trialDays: number): Promise<any> {
    if (!supabaseAdmin) return null;

    const newTrialEnd = new Date();
    newTrialEnd.setDate(newTrialEnd.getDate() + trialDays);

    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .update({
        trial_end_date: newTrialEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', accountId)
      .select()
      .single();

    if (error || !data) return null;

    return data;
  }

  async updateAccountSubscription(accountId: string, plan: string, daysToAdd?: number): Promise<any> {
    if (!supabaseAdmin) return null;

    const updateData: Record<string, unknown> = {
      plan,
      status: 'active',
      updated_at: new Date().toISOString(),
    };

    if (daysToAdd) {
      const now = new Date();
      updateData.paid_start_date = now.toISOString();
      now.setDate(now.getDate() + daysToAdd);
      updateData.paid_end_date = now.toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .update(updateData)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error || !data) return null;

    return data;
  }

  // =====================================================
  // MÉTODOS DE PAGAMENTO
  // =====================================================

  async createPayment(paymentData: {
    accountId: string;
    stripePaymentIntentId: string;
    amount: number;
    currency: string;
    status: string;
    pixQrCode?: string | null;
    pixCode?: string | null;
    expiresAt?: string | null;
  }): Promise<any> {
    if (!supabaseAdmin) return null;

    const { data, error } = await supabaseAdmin
      .from('payments')
      .insert({
        account_id: paymentData.accountId,
        stripe_payment_intent_id: paymentData.stripePaymentIntentId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        status: paymentData.status,
        pix_qr_code: paymentData.pixQrCode || null,
        pix_code: paymentData.pixCode || null,
        expires_at: paymentData.expiresAt || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Create payment error:', error);
      return null;
    }

    return data;
  }

  async updatePaymentStatus(stripePaymentIntentId: string, status: string): Promise<boolean> {
    if (!supabaseAdmin) return false;

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'succeeded') {
      updateData.paid_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
      .from('payments')
      .update(updateData)
      .eq('stripe_payment_intent_id', stripePaymentIntentId);

    return !error;
  }

  async activateSubscription(accountId: string, days: number): Promise<boolean> {
    if (!supabaseAdmin) return false;

    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({
        plan: 'basic',
        status: 'active',
        paid_start_date: now.toISOString(),
        paid_end_date: endDate.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('account_id', accountId);

    return !error;
  }
}

export const supabaseStorage = new SupabaseStorage();
