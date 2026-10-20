import React, { createContext, useContext, useState, useEffect } from 'react';

const StoreContext = createContext();

const INITIAL_PRODUCTS = [
  { id: 101, name: 'Fresh Whole Milk', category: 'Milk', subcategory: 'Open', unit: 'Liters', price: 65, cost: 50, stock: 48 },
  { id: 102, name: 'Organic Mustard Oil', category: 'Oil Products', subcategory: 'Packing', unit: 'Liters', price: 180, cost: 140, stock: 30 },
  { id: 103, name: 'Sharbati Wheat Grain', category: 'Cereals', subcategory: 'Open', unit: 'kg', price: 45, cost: 34, stock: 120 },
  { id: 104, name: 'Premium Basmati Rice', category: 'Cereals', subcategory: 'Packing', unit: 'kg', price: 110, cost: 85, stock: 80 },
  { id: 105, name: 'Toor Dal Pulses', category: 'Pulses', subcategory: 'Open', unit: 'kg', price: 140, cost: 115, stock: 4 }, // low stock
  { id: 106, name: 'Farm Fresh Apples', category: 'Fruits', subcategory: 'Open', unit: 'kg', price: 160, cost: 120, stock: 25 },
  { id: 107, name: 'Assam Gold Tea', category: 'tea', subcategory: 'Packing', unit: 'pcs', price: 290, cost: 230, stock: 3 }, // low stock
  { id: 108, name: 'Cashew Nuts 500g', category: 'Dry Fruits', subcategory: 'Packing', unit: 'pcs', price: 450, cost: 370, stock: 18 },
  { id: 109, name: 'Digestive Biscuits 1kg', category: 'Package Food', subcategory: 'Packing', unit: 'pcs', price: 120, cost: 95, stock: 40 },
  { id: 110, name: 'Wireless Bluetooth Earbuds', category: 'Electronics', subcategory: 'Packing', unit: 'pcs', price: 1499, cost: 950, stock: 12 },
  { id: 111, name: 'Mineral Water Can', category: 'Beverages', subcategory: 'Open', unit: 'Liters', price: 40, cost: 20, stock: 65 },
  { id: 112, name: 'Chana Sattu Flour', category: 'Cereals', subcategory: 'Open', unit: 'kg', price: 90, cost: 70, stock: 2 } // low stock
];

const INITIAL_CUSTOMERS = [
  { id: 1, name: 'Rahul Sharma', email: 'rahul.sharma@example.com', region: 'Mumbai', totalVisits: 14, totalSpent: 12450 },
  { id: 2, name: 'Priya Patel', email: 'priya.patel@example.com', region: 'Ahmedabad', totalVisits: 8, totalSpent: 7890 },
  { id: 3, name: 'Amit Verma', email: 'amit.verma@example.com', region: 'Delhi NCR', totalVisits: 19, totalSpent: 24300 },
  { id: 4, name: 'Sneha Kulkarni', email: 'sneha.k@example.com', region: 'Pune', totalVisits: 5, totalSpent: 3410 },
  { id: 5, name: 'Vikram Singh', email: 'vikram.singh@example.com', region: 'Jaipur', totalVisits: 11, totalSpent: 16750 }
];

const GST_CATEGORIES = {
  0: ['Fruits', 'Vegetables', 'Milk', 'Pulses', 'Stationery', 'Grocery', 'Cereals'],
  10: ['Package Food', 'Oil Products', 'Dry Fruits', 'Spices', 'tea', 'coffee', 'Beverages', 'Sports', 'PersonalCare'],
  18: ['Electronics', 'Furniture', 'Fashion', 'Accessories']
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
    const saved = localStorage.getItem('retailsphere_products');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });

  const [customers, setCustomers] = useState(() => {
    const saved = localStorage.getItem('retailsphere_customers');
    return saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
  });

  const [orders, setOrders] = useState(() => {
    const saved = localStorage.getItem('retailsphere_orders');
    return saved ? JSON.parse(saved) : [
      {
        billNumber: 1001,
        customerId: 1,
        customerName: 'Rahul Sharma',
        customerRegion: 'Mumbai',
        date: new Date(Date.now() - 3600000 * 2).toISOString(),
        items: [
          { id: 101, name: 'Fresh Whole Milk', category: 'Milk', price: 65, qty: 2, unit: 'Liters', subtotal: 130, gst: 0, total: 130 },
          { id: 103, name: 'Sharbati Wheat Grain', category: 'Cereals', price: 45, qty: 5, unit: 'kg', subtotal: 225, gst: 0, total: 225 }
        ],
        subtotal: 355,
        gstTotal: 0,
        grandTotal: 355
      },
      {
        billNumber: 1002,
        customerId: 2,
        customerName: 'Priya Patel',
        customerRegion: 'Ahmedabad',
        date: new Date(Date.now() - 3600000 * 5).toISOString(),
        items: [
          { id: 102, name: 'Organic Mustard Oil', category: 'Oil Products', price: 180, qty: 2, unit: 'Liters', subtotal: 360, gst: 36, total: 396 },
          { id: 108, name: 'Cashew Nuts 500g', category: 'Dry Fruits', price: 450, qty: 1, unit: 'pcs', subtotal: 450, gst: 45, total: 495 }
        ],
        subtotal: 810,
        gstTotal: 81,
        grandTotal: 891
      }
    ];
  });

  useEffect(() => {
    localStorage.setItem('retailsphere_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('retailsphere_customers', JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem('retailsphere_orders', JSON.stringify(orders));
  }, [orders]);

  const addProduct = (p) => {
    const id = p.id ? Number(p.id) : (products.length ? Math.max(...products.map((x) => x.id)) + 1 : 101);
    const newProd = {
      id,
      name: p.name,
      category: p.category || 'General',
      subcategory: p.subcategory || 'Packing',
      unit: p.unit || (p.subcategory === 'Open' ? (p.category === 'Milk' || p.category === 'Beverages' ? 'Liters' : 'kg') : 'pcs'),
      price: Number(p.price) || 0,
      cost: Number(p.cost) || 0,
      stock: Number(p.stock) || 0
    };
    setProducts((prev) => [newProd, ...prev]);
    return newProd;
  };

  const updateProduct = (id, updated) => {
    setProducts((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updated } : item))
    );
  };

  const deleteProduct = (id) => {
    setProducts((prev) => prev.filter((item) => item.id !== id));
  };

  const addCustomer = (c) => {
    const id = c.id ? Number(c.id) : (customers.length ? Math.max(...customers.map((x) => x.id)) + 1 : 1);
    const newCust = {
      id,
      name: c.name,
      email: c.email || `${c.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      region: c.region || 'Local',
      totalVisits: c.totalVisits || 1,
      totalSpent: c.totalSpent || 0
    };
    setCustomers((prev) => [newCust, ...prev]);
    return newCust;
  };

  const recordSale = ({ customer, items, subtotal, gstTotal, grandTotal }) => {
    const billNumber = orders.length ? Math.max(...orders.map((o) => o.billNumber)) + 1 : 1001;
    const newOrder = {
      billNumber,
      customerId: customer.id,
      customerName: customer.name,
      customerRegion: customer.region,
      date: new Date().toISOString(),
      items,
      subtotal,
      gstTotal,
      grandTotal
    };

    // Deduct stock
    setProducts((prev) =>
      prev.map((prod) => {
        const cartItem = items.find((i) => i.id === prod.id);
        if (cartItem) {
          return { ...prod, stock: Math.max(0, prod.stock - cartItem.qty) };
        }
        return prod;
      })
    );

    // Update customer visits & spend
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id === customer.id) {
          return {
            ...c,
            totalVisits: (c.totalVisits || 0) + 1,
            totalSpent: (c.totalSpent || 0) + grandTotal
          };
        }
        return c;
      })
    );

    setOrders((prev) => [newOrder, ...prev]);
    return newOrder;
  };

  // Categories list
  const categories = Array.from(new Set(products.map((p) => p.category))).sort();

  return (
    <StoreContext.Provider
      value={{
        products,
        customers,
        orders,
        categories,
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
