import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { productsAPI, customersAPI, posAPI, ordersAPI } from '../services/api';

const StoreContext = createContext();

const GST_CATEGORIES = {
  0: ['Fruits', 'Vegetables', 'Milk', 'Pulses', 'Stationery', 'Grocery', 'Groceries', 'Cereals'],
  10: ['Package Food', 'Oil Products', 'Dry Fruits', 'Spices', 'tea', 'coffee', 'Beverages', 'Sports', 'PersonalCare', 'Personal Care', 'Snacks', 'Home Care'],
  18: ['Electronics', 'Furniture', 'Fashion', 'Accessories', 'Apparel']
};

export function getGstRate(category) {
  const cat = (category || '').toLowerCase();
  for (const [rate, list] of Object.entries(GST_CATEGORIES)) {
    if (list.some((item) => item.toLowerCase() === cat)) {
      return parseFloat(rate) / 100.0;
    }
  }
  return 0.05; // 5% default
}

export function StoreProvider({ children }) {
  const [products, setProducts] = useState(() => {
    try {
      const saved = localStorage.getItem('retailsphere_products');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customers, setCustomers] = useState(() => {
    try {
      const saved = localStorage.getItem('retailsphere_customers');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [orders, setOrders] = useState(() => {
    try {
      const saved = localStorage.getItem('retailsphere_orders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync to localStorage as an offline cache
  useEffect(() => {
    if (products.length > 0) {
      localStorage.setItem('retailsphere_products', JSON.stringify(products));
    }
  }, [products]);

  useEffect(() => {
    if (customers.length > 0) {
      localStorage.setItem('retailsphere_customers', JSON.stringify(customers));
    }
  }, [customers]);

  useEffect(() => {
    if (orders.length > 0) {
      localStorage.setItem('retailsphere_orders', JSON.stringify(orders));
    }
  }, [orders]);

  // Fetch live data from backend API
  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodsRes, custsRes, ordsRes] = await Promise.allSettled([
        productsAPI.getProducts(),
        customersAPI.getCustomers(),
        ordersAPI.getOrders()
      ]);

      if (prodsRes.status === 'fulfilled' && Array.isArray(prodsRes.value)) {
        setProducts(prodsRes.value);
      }
      if (custsRes.status === 'fulfilled' && Array.isArray(custsRes.value)) {
        setCustomers(custsRes.value);
      }
      if (ordsRes.status === 'fulfilled' && Array.isArray(ordsRes.value)) {
        setOrders(ordsRes.value);
      }
    } catch (err) {
      console.warn('[StoreContext] Could not fetch remote data:', err);
      setError(err.message || 'Failed to load data from server');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const addProduct = async (p) => {
    try {
      const res = await productsAPI.addProduct(p);
      const newProd = res.product;
      setProducts((prev) => [newProd, ...prev]);
      return newProd;
    } catch (err) {
      console.error('[StoreContext] addProduct error:', err);
      throw err;
    }
  };

  const updateProduct = async (id, updated) => {
    try {
      if (updated.price !== undefined) {
        await productsAPI.updatePrice(id, updated.price);
      }
      if (updated.addStock !== undefined) {
        await productsAPI.restock(id, updated.addStock);
      }
      setProducts((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updated } : item))
      );
    } catch (err) {
      console.error('[StoreContext] updateProduct error:', err);
      throw err;
    }
  };

  const deleteProduct = async (id) => {
    try {
      await productsAPI.deleteProduct(id);
      setProducts((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('[StoreContext] deleteProduct error:', err);
      throw err;
    }
  };

  const addCustomer = async (c) => {
    try {
      const res = await customersAPI.addCustomer(c);
      const newCust = res.customer;
      setCustomers((prev) => [newCust, ...prev]);
      return newCust;
    } catch (err) {
      console.error('[StoreContext] addCustomer error:', err);
      throw err;
    }
  };

  const recordSale = async ({ customer, items, subtotal, gstTotal, grandTotal }) => {
    try {
      const res = await posAPI.checkout({ customer, items, subtotal, gstTotal, grandTotal });
      const newOrder = res.invoice;

      setOrders((prev) => [newOrder, ...prev]);

      // Deduct stock locally
      setProducts((prev) =>
        prev.map((prod) => {
          const cartItem = items.find((i) => i.id === prod.id || i.id === prod.product_id);
          if (cartItem) {
            return { ...prod, stock: Math.max(0, prod.stock - (cartItem.qty || cartItem.quantity)) };
          }
          return prod;
        })
      );

      // Refresh customers to get updated totalSpent / totalVisits
      customersAPI.getCustomers().then((custs) => {
        if (Array.isArray(custs)) setCustomers(custs);
      }).catch(() => {});

      return newOrder;
    } catch (err) {
      console.error('[StoreContext] recordSale error:', err);
      throw err;
    }
  };

  // Distinct categories list sorted alphabetically
  const categories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean))
  ).sort();

  return (
    <StoreContext.Provider
      value={{
        products,
        customers,
        orders,
        categories,
        loading,
        error,
        refreshData,
        addProduct,
        updateProduct,
        deleteProduct,
        addCustomer,
        recordSale
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
