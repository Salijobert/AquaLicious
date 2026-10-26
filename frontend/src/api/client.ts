import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resolver } from './multiServerResolver.js';

// Products
export function useProducts(includeInactive = false) {
  return useQuery({
    queryKey: ['products', includeInactive],
    queryFn: () => resolver.request<any[]>(`/api/products${includeInactive ? '?include_inactive=1' : ''}`),
    refetchInterval: 5000
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => resolver.request('/api/products', { method: 'POST', data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    }
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => resolver.request('/api/products', { method: 'PATCH', data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    }
  });
}

// Inventory
export function useInventory(ledger = false) {
  return useQuery({
    queryKey: ['inventory', ledger],
    queryFn: () => resolver.request<any[]>(`/api/inventory${ledger ? '?ledger=1' : ''}`),
    refetchInterval: 5000
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { product_id: number; type: 'RESTOCK' | 'ADJUSTMENT'; quantity: number; notes?: string }) =>
      resolver.request('/api/inventory', { method: 'POST', data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    }
  });
}

// Sales
export function useSales(id?: number) {
  return useQuery({
    queryKey: ['sales', id],
    queryFn: () => resolver.request<any>(`/api/sales${id ? `?id=${id}` : ''}`),
    refetchInterval: 5000
  });
}

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      items: Array<{ product_id: number; qty: number }>;
      cash_tendered: number | string;
      expected_total?: number | string;
      request_key: string;
    }) =>
      resolver.request('/api/sales', {
        method: 'POST',
        data,
        idempotencyKey: data.request_key
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    }
  });
}

export function useVoidSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number; admin_token?: string; admin_username?: string; admin_password?: string; reason: string }) =>
      resolver.request('/api/sales', { method: 'PATCH', data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    }
  });
}

// Orders
export function useOrders(id?: number) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: () => resolver.request<any>(`/api/orders${id ? `?id=${id}` : ''}`),
    refetchInterval: 5000
  });
}

export function useOrderProof(proofId?: number) {
  return useQuery({
    queryKey: ['order-proof', proofId],
    queryFn: () => resolver.request<any>(`/api/orders?proof=${proofId}`),
    enabled: !!proofId
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      items: Array<{ product_id: number; qty: number }>;
      fulfillment: 'PICKUP' | 'DELIVERY';
      address?: string;
      method: 'CASH' | 'GCASH_QR' | 'MAYA_QR';
      expected_total?: number | string;
      request_key: string;
    }) =>
      resolver.request('/api/orders', {
        method: 'POST',
        data,
        idempotencyKey: data.request_key
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });
}

export function usePatchOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number; action: string; [key: string]: any }) =>
      resolver.request('/api/orders', { method: 'PATCH', data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    }
  });
}

// Reports
export function useReports(days = 30) {
  return useQuery({
    queryKey: ['reports', days],
    queryFn: () => resolver.request<any>(`/api/reports?days=${days}`),
    refetchInterval: 10000
  });
}

// Users
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => resolver.request<any[]>('/api/users'),
    refetchInterval: 10000
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; username: string; role: string; active?: boolean }) =>
      resolver.request('/api/users', { method: 'POST', data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] })
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number; name?: string; role?: string; active?: boolean | number }) =>
      resolver.request('/api/users', { method: 'PATCH', data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] })
  });
}

// Config
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => resolver.request<any>('/api/config')
  });
}
