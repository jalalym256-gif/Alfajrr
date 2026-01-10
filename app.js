// ========== ALFAJR TAILORING MANAGEMENT SYSTEM ==========
// Version 4.0 - Professional Complete Edition
// Author: ALFAJR Team
// Phone: 0799799009
// Last Updated: 2024

// ========== CONFIGURATION ==========
const AppConfig = {
    DATABASE_NAME: 'ALFAJR_DB_V4',
    DATABASE_VERSION: 4,
    STORES: {
        CUSTOMERS: 'customers',
        SETTINGS: 'settings',
        BACKUP: 'backups'
    },
    
    // فیلدهای اندازه‌گیری - تماماً عددی
    MEASUREMENT_FIELDS: [
        "قد", "شانه_یک", "شانه_دو", "آستین_یک", "آستین_دو", "آستین_سه",
        "بغل", "دامن", "گردن", "دور_سینه", "شلوار", "دم_پاچه",
        "بر_تمبان", "خشتک", "چاک_پتی", "تعداد_سفارش", "مقدار_تکه"
    ],
    
    // مدل‌های یخن - متن
    YAKHUN_MODELS: ["آف دار", "چپه یخن", "پاکستانی", "ملی", "شهبازی", "خامک", "قاسمی"],
    
    // مدل‌های آستین - متن
    SLEEVE_MODELS: ["کفک", "ساده شیش بخیه", "بندک", "پر بخیه", "آف دار", "لایی یک انچ"],
    
    // مدل‌های دامن - متن
    SKIRT_MODELS: ["دامن یک بخیه", "دامن دوبخیه", "دامن چهارکنج", "دامن ترخیز", "دامن گاوی"],
    
    // ویژگی‌ها - متن
    FEATURES_LIST: ["جیب رو", "جیب شلوار", "یک بخیه سند", "دو بخیه سند", "مکمل دو بخیه"],
    
    // روزهای هفته - متن
    DAYS_OF_WEEK: ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"],
    
    // تنظیمات پیش‌فرض
    DEFAULT_SETTINGS: {
        theme: 'dark',
        printFormat: 'thermal',
        currency: 'افغانی',
        autoSave: true,
        backupInterval: 24 // ساعت
    }
};

// ========== GLOBAL VARIABLES ==========
let customers = [];
let currentCustomerIndex = null;
let dbManager = null;
let currentTheme = 'dark';
let saveTimeout = null;
let isInitialized = false;

// ========== CUSTOMER CLASS ==========
class Customer {
    constructor(name, phone) {
        this.id = this.generateUniqueId();
        this.name = name || '';
        this.phone = phone || '';
        this.notes = ''; // متن - نه عددی
        this.measurements = this.createEmptyMeasurements(); // تماماً عددی
        this.models = {
            yakhun: '',
            sleeve: '',
            skirt: [], // آرایه متن
            features: [] // آرایه متن
        };
        this.sewingPriceAfghani = null; // عددی
        this.deliveryDay = ''; // متن
        this.paymentReceived = false; // بولین
        this.paymentDate = null; // تاریخ
        this.orders = []; // آرایه اشیاء
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
        this.deleted = false;
        this.version = 1;
    }

    generateUniqueId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 9);
        return `CUST_${timestamp}_${random}`.toUpperCase();
    }

    // ایجاد اندازه‌گیری‌های خالی - تماماً عددی
    createEmptyMeasurements() {
        const measurements = {};
        AppConfig.MEASUREMENT_FIELDS.forEach(field => {
            measurements[field] = ''; // مقادیر خالی، بعداً عدد می‌شوند
        });
        return measurements;
    }

    // اعتبارسنجی ورودی‌ها
    validate() {
        const errors = [];
        
        // نام مشتری - متن
        if (!this.name || this.name.trim().length < 2) {
            errors.push('نام مشتری باید حداقل ۲ کاراکتر باشد');
        }
        
        // شماره تلفن - متن (می‌تواند عددی هم باشد)
        if (!this.phone || this.phone.trim().length < 10) {
            errors.push('شماره تلفن باید حداقل ۱۰ رقم باشد');
        }
        
        // اعتبارسنجی اندازه‌گیری‌های عددی
        AppConfig.MEASUREMENT_FIELDS.forEach(field => {
            const value = this.measurements[field];
            if (value && isNaN(parseFloat(value))) {
                errors.push(`فیلد ${field} باید عددی باشد`);
            }
        });
        
        // اعتبارسنجی قیمت عددی
        if (this.sewingPriceAfghani && isNaN(parseInt(this.sewingPriceAfghani))) {
            errors.push('قیمت باید عددی باشد');
        }
        
        return errors;
    }

    // تبدیل به آبجکت ساده برای ذخیره در دیتابیس
    toObject() {
        return {
            id: this.id,
            name: this.name,
            phone: this.phone,
            notes: this.notes, // متن
            measurements: this.measurements, // آبجکت با مقادیر عددی
            models: this.models, // آبجکت با مقادیر متن
            sewingPriceAfghani: this.sewingPriceAfghani, // عدد
            deliveryDay: this.deliveryDay, // متن
            paymentReceived: this.paymentReceived, // بولین
            paymentDate: this.paymentDate, // تاریخ
            orders: this.orders, // آرایه
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            deleted: this.deleted,
            version: this.version
        };
    }

    // ایجاد مشتری از آبجکت
    static fromObject(obj) {
        if (!obj || typeof obj !== 'object') {
            console.warn('Invalid customer data:', obj);
            return new Customer('', '');
        }
        
        const customer = new Customer(obj.name || '', obj.phone || '');
        
        // کپی تمام خصوصیات
        Object.keys(obj).forEach(key => {
            if (key !== 'id' && key !== 'name' && key !== 'phone') {
                try {
                    customer[key] = obj[key];
                } catch (e) {
                    console.warn(`Error copying property ${key}:`, e);
                }
            }
        });
        
        // اطمینان از وجود آرایه‌ها
        if (!Array.isArray(customer.orders)) customer.orders = [];
        if (!customer.models) customer.models = { yakhun: "", sleeve: "", skirt: [], features: [] };
        if (!Array.isArray(customer.models.skirt)) customer.models.skirt = [];
        if (!Array.isArray(customer.models.features)) customer.models.features = [];
        if (!customer.measurements) customer.measurements = customer.createEmptyMeasurements();
        
        // تبدیل مقادیر رشته‌ای به عدد برای اندازه‌گیری‌ها
        AppConfig.MEASUREMENT_FIELDS.forEach(field => {
            if (customer.measurements[field] && typeof customer.measurements[field] === 'string') {
                const numValue = parseFloat(customer.measurements[field]);
                if (!isNaN(numValue)) {
                    customer.measurements[field] = numValue;
                }
            }
        });
        
        // تبدیل قیمت به عدد
        if (customer.sewingPriceAfghani && typeof customer.sewingPriceAfghani === 'string') {
            const priceValue = parseInt(customer.sewingPriceAfghani);
            if (!isNaN(priceValue)) {
                customer.sewingPriceAfghani = priceValue;
            }
        }
        
        return customer;
    }
}

// ========== DATABASE MANAGER ==========
class DatabaseManager {
    constructor() {
        this.db = null;
        this.isInitialized = false;
        this.onUpdateCallbacks = [];
    }

    async init() {
        return new Promise((resolve, reject) => {
            if (this.isInitialized && this.db) {
                resolve(this.db);
                return;
            }

            const request = indexedDB.open(AppConfig.DATABASE_NAME, AppConfig.DATABASE_VERSION);
            
            request.onerror = (event) => {
                console.error('Database open error:', event.target.error);
                reject(event.target.error);
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isInitialized = true;
                
                // اضافه کردن هندلر خطا
                this.db.onerror = (event) => {
                    console.error('Database error:', event.target.error);
                    showNotification('خطا در پایگاه داده', 'error');
                };
                
                // اضافه کردن هندلر version change
                this.db.onversionchange = (event) => {
                    console.log('Database version changed:', event.oldVersion, '→', event.newVersion);
                    this.db.close();
                };
                
                console.log('Database initialized successfully');
                this.updateDatabaseStatus(true);
                this.initializeSettings();
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('Database upgrade needed:', event.oldVersion, '→', event.newVersion);
                
                // ایجاد/ارتقاء stores
                if (!db.objectStoreNames.contains(AppConfig.STORES.CUSTOMERS)) {
                    const store = db.createObjectStore(AppConfig.STORES.CUSTOMERS, { keyPath: 'id' });
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('phone', 'phone', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('deleted', 'deleted', { unique: false });
                    store.createIndex('deliveryDay', 'deliveryDay', { unique: false });
                    store.createIndex('paymentReceived', 'paymentReceived', { unique: false });
                    console.log('Customers store created');
                } else {
                    // ارتقاء store مشتریان
                    const transaction = event.currentTarget.transaction;
                    const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
                    
                    // اضافه کردن ایندکس‌های جدید اگر وجود ندارند
                    if (!store.indexNames.contains('deliveryDay')) {
                        store.createIndex('deliveryDay', 'deliveryDay', { unique: false });
                    }
                    if (!store.indexNames.contains('paymentReceived')) {
                        store.createIndex('paymentReceived', 'paymentReceived', { unique: false });
                    }
                }
                
                if (!db.objectStoreNames.contains(AppConfig.STORES.SETTINGS)) {
                    db.createObjectStore(AppConfig.STORES.SETTINGS, { keyPath: 'key' });
                    console.log('Settings store created');
                }
                
                if (!db.objectStoreNames.contains(AppConfig.STORES.BACKUP)) {
                    const backupStore = db.createObjectStore(AppConfig.STORES.BACKUP, { keyPath: 'id', autoIncrement: true });
                    backupStore.createIndex('date', 'date', { unique: false });
                    console.log('Backup store created');
                }
            };
            
            request.onblocked = () => {
                console.error('Database blocked by other tab');
                showNotification('دیتابیس توسط تب دیگری قفل شده است. لطفاً سایر تب‌ها را ببندید.', 'error');
                reject(new Error('Database blocked'));
            };
        });
    }

    // ثبت callback برای تغییرات
    onUpdate(callback) {
        this.onUpdateCallbacks.push(callback);
    }

    // اطلاع‌رسانی تغییرات
    notifyUpdate(type, data) {
        this.onUpdateCallbacks.forEach(callback => {
            try {
                callback(type, data);
            } catch (error) {
                console.error('Error in update callback:', error);
            }
        });
    }

    updateDatabaseStatus(connected) {
        const statusElement = document.getElementById('dbStatus');
        if (statusElement) {
            if (connected) {
                statusElement.innerHTML = '<i class="fas fa-database"></i> <span>متصل</span>';
                statusElement.className = 'db-status connected';
            } else {
                statusElement.innerHTML = '<i class="fas fa-database"></i> <span>قطع</span>';
                statusElement.className = 'db-status disconnected';
            }
        }
    }

    async initializeSettings() {
        try {
            for (const [key, value] of Object.entries(AppConfig.DEFAULT_SETTINGS)) {
                const existing = await this.getSettings(key);
                if (existing === null) {
                    await this.saveSettings(key, value);
                }
            }
            console.log('Settings initialized');
        } catch (error) {
            console.error('Error initializing settings:', error);
        }
    }

    async saveCustomer(customer) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            if (!customer || !customer.id) {
                reject(new Error('Invalid customer data'));
                return;
            }
            
            // اعتبارسنجی مشتری
            const errors = customer.validate();
            if (errors.length > 0) {
                reject(new Error(errors.join('\n')));
                return;
            }
            
            customer.updatedAt = new Date().toISOString();
            const customerData = customer.toObject();
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            
            const request = store.put(customerData);
            
            request.onsuccess = () => {
                console.log('Customer saved:', customer.name, customer.id);
                this.notifyUpdate('customer_saved', customer);
                resolve(customer);
            };
            
            request.onerror = (event) => {
                console.error('Error saving customer:', event.target.error);
                reject(event.target.error);
            };
            
            transaction.oncomplete = () => {
                console.log('Customer save transaction completed');
            };
        });
    }

    async getAllCustomers(includeDeleted = false) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                let customers = request.result || [];
                
                if (!includeDeleted) {
                    customers = customers.filter(c => !c.deleted);
                }
                
                // تبدیل به Customer objects
                const customerObjects = customers.map(c => {
                    try {
                        return Customer.fromObject(c);
                    } catch (error) {
                        console.error('Error converting customer:', error, c);
                        return null;
                    }
                }).filter(c => c !== null);
                
                // مرتب‌سازی بر اساس تاریخ ایجاد (جدیدترین اول)
                customerObjects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                
                resolve(customerObjects);
            };
            
            request.onerror = (event) => {
                console.error('Error getting customers:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getCustomer(id) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const request = store.get(id);
            
            request.onsuccess = () => {
                if (request.result) {
                    resolve(Customer.fromObject(request.result));
                } else {
                    resolve(null);
                }
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async deleteCustomer(id) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const customer = getRequest.result;
                if (customer) {
                    customer.deleted = true;
                    customer.updatedAt = new Date().toISOString();
                    
                    const putRequest = store.put(customer);
                    putRequest.onsuccess = () => {
                        this.notifyUpdate('customer_deleted', { id });
                        resolve(true);
                    };
                    putRequest.onerror = (event) => reject(event.target.error);
                } else {
                    reject(new Error('Customer not found'));
                }
            };
            
            getRequest.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async searchCustomers(query) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            if (!query || query.trim() === '') {
                resolve([]);
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const allCustomers = request.result || [];
                const searchTerm = query.toLowerCase().trim();
                
                const results = allCustomers.filter(customer => {
                    if (customer.deleted) return false;
                    
                    // جستجو در فیلدهای مختلف
                    const searchFields = [
                        customer.name,
                        customer.phone,
                        customer.notes,
                        customer.id,
                        customer.models?.yakhun,
                        customer.models?.sleeve,
                        customer.deliveryDay,
                        customer.sewingPriceAfghani?.toString()
                    ];
                    
                    return searchFields.some(field => 
                        field && field.toString().toLowerCase().includes(searchTerm)
                    );
                }).map(c => Customer.fromObject(c));
                
                resolve(results);
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async advancedSearch(filters) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const allCustomers = request.result || [];
                
                const results = allCustomers.filter(customer => {
                    if (customer.deleted) return false;
                    
                    // اعمال فیلترها
                    let matches = true;
                    
                    if (filters.name) {
                        matches = matches && customer.name.toLowerCase().includes(filters.name.toLowerCase());
                    }
                    
                    if (filters.phone) {
                        matches = matches && customer.phone.includes(filters.phone);
                    }
                    
                    if (filters.deliveryDay) {
                        matches = matches && customer.deliveryDay === filters.deliveryDay;
                    }
                    
                    if (filters.paymentStatus !== undefined) {
                        matches = matches && customer.paymentReceived === filters.paymentStatus;
                    }
                    
                    if (filters.minPrice) {
                        matches = matches && customer.sewingPriceAfghani >= filters.minPrice;
                    }
                    
                    if (filters.maxPrice) {
                        matches = matches && customer.sewingPriceAfghani <= filters.maxPrice;
                    }
                    
                    return matches;
                }).map(c => Customer.fromObject(c));
                
                resolve(results);
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async getSettings(key) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.SETTINGS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.SETTINGS);
            const request = store.get(key);
            
            request.onsuccess = () => {
                resolve(request.result ? request.result.value : null);
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async saveSettings(key, value) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.SETTINGS], 'readwrite');
            const store = transaction.objectStore(AppConfig.STORES.SETTINGS);
            
            const settings = {
                key: key,
                value: value,
                updatedAt: new Date().toISOString()
            };
            
            const request = store.put(settings);
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async createBackup() {
        try {
            const allCustomers = await this.getAllCustomers(true);
            const backupData = {
                customers: allCustomers.map(c => c.toObject()),
                timestamp: new Date().toISOString(),
                version: AppConfig.DATABASE_VERSION,
                totalCustomers: allCustomers.length
            };
            
            const transaction = this.db.transaction([AppConfig.STORES.BACKUP], 'readwrite');
            const store = transaction.objectStore(AppConfig.STORES.BACKUP);
            
            const backup = {
                date: new Date().toISOString(),
                data: backupData,
                size: JSON.stringify(backupData).length
            };
            
            await new Promise((resolve, reject) => {
                const request = store.add(backup);
                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            });
            
            console.log('Backup created successfully');
            return backupData;
        } catch (error) {
            console.error('Error creating backup:', error);
            throw error;
        }
    }

    async getBackups() {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.BACKUP], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.BACKUP);
            const index = store.index('date');
            const request = index.getAll();
            
            request.onsuccess = () => {
                resolve(request.result || []);
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async restoreBackup(backupId) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.BACKUP], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.BACKUP);
            const request = store.get(backupId);
            
            request.onsuccess = async () => {
                const backup = request.result;
                if (!backup) {
                    reject(new Error('Backup not found'));
                    return;
                }
                
                try {
                    // پاک‌سازی مشتریان فعلی
                    await this.clearAllData();
                    
                    // بازیابی مشتریان
                    for (const customerData of backup.data.customers) {
                        const customer = Customer.fromObject(customerData);
                        await this.saveCustomer(customer);
                    }
                    
                    resolve(backup);
                } catch (error) {
                    reject(error);
                }
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async clearAllData() {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const request = store.clear();
            
            request.onsuccess = () => {
                console.log('All data cleared');
                this.notifyUpdate('data_cleared', null);
                resolve();
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async getDatabaseSize() {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            let totalSize = 0;
            
            const stores = Array.from(this.db.objectStoreNames);
            let processedStores = 0;
            
            stores.forEach(storeName => {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();
                
                request.onsuccess = () => {
                    const data = request.result;
                    const dataSize = JSON.stringify(data).length;
                    totalSize += dataSize;
                    processedStores++;
                    
                    if (processedStores === stores.length) {
                        resolve(totalSize);
                    }
                };
                
                request.onerror = () => {
                    processedStores++;
                    if (processedStores === stores.length) {
                        resolve(totalSize);
                    }
                };
            });
        });
    }
}

// ========== UI HELPER FUNCTIONS ==========
function showNotification(message, type = 'info', duration = 4000) {
    const existingNotification = document.getElementById('globalNotification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.id = 'globalNotification';
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 30px;
        right: 30px;
        padding: 20px 30px;
        border-radius: 12px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        max-width: 500px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.3);
        font-size: 15px;
        transition: all 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55);
        display: flex;
        align-items: center;
        gap: 15px;
        backdrop-filter: blur(10px);
        border-left: 5px solid;
        opacity: 0;
        transform: translateX(100px);
    `;
    
    const colors = {
        success: { bg: '#28a745', border: '#28a745' },
        error: { bg: '#dc3545', border: '#dc3545' },
        warning: { bg: '#ffc107', border: '#ffc107', text: '#333' },
        info: { bg: '#17a2b8', border: '#17a2b8' }
    };
    
    const color = colors[type] || colors.info;
    notification.style.backgroundColor = color.bg;
    notification.style.borderLeftColor = color.border;
    if (color.text) {
        notification.style.color = color.text;
    }
    
    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ'
    };
    
    notification.innerHTML = `
        <span style="font-size: 20px; font-weight: bold;">${icons[type] || 'ℹ'}</span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // نمایش با انیمیشن
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 10);
    
    // مخفی کردن خودکار
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100px)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, duration);
}

function showLoading(message = 'در حال بارگذاری...') {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.92);
            display: none;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            color: white;
            font-family: Tahoma, Arial, sans-serif;
            backdrop-filter: blur(10px);
        `;

        const spinner = document.createElement('div');
        spinner.style.cssText = `
            width: 70px;
            height: 70px;
            border: 5px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            border-top-color: #D4AF37;
            animation: spin 1s linear infinite;
            margin-bottom: 30px;
        `;

        const text = document.createElement('div');
        text.id = 'loadingText';
        text.style.cssText = `
            font-size: 18px;
            text-align: center;
            max-width: 400px;
            line-height: 1.8;
            color: #D4AF37;
        `;
        text.textContent = message;

        if (!document.getElementById('spinAnimation')) {
            const style = document.createElement('style');
            style.id = 'spinAnimation';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        overlay.appendChild(spinner);
        overlay.appendChild(text);
        document.body.appendChild(overlay);
    }
    
    overlay.style.display = 'flex';
    document.getElementById('loadingText').textContent = message;
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function formatPrice(price) {
    if (!price && price !== 0) return '۰';
    return new Intl.NumberFormat('fa-IR').format(price);
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '۰ بایت';
    const k = 1024;
    const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i)) + ' ' + sizes[i];
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ========== INITIALIZATION ==========
async function initializeApp() {
    try {
        showLoading('در حال راه‌اندازی سیستم ALFAJR...');
        
        // بررسی پشتیبانی مرورگر
        if (!window.indexedDB) {
            throw new Error('مرورگر شما از IndexedDB پشتیبانی نمی‌کند');
        }
        
        // مقداردهی اولیه دیتابیس
        dbManager = new DatabaseManager();
        await dbManager.init();
        
        // ثبت callback برای تغییرات
        dbManager.onUpdate((type, data) => {
            console.log('Database update:', type, data);
            
            switch (type) {
                case 'customer_saved':
                    updateStats();
                    break;
                case 'customer_deleted':
                    updateStats();
                    break;
                case 'data_cleared':
                    customers = [];
                    renderCustomerList();
                    updateStats();
                    break;
            }
        });
        
        // بارگذاری مشتریان
        await loadCustomers();
        
        // بارگذاری تنظیمات
        await loadSettings();
        
        // تنظیم تم
        const savedTheme = await dbManager.getSettings('theme') || 'dark';
        if (savedTheme === 'light') window.toggleLightMode();
        else if (savedTheme === 'vivid') window.toggleVividMode();
        else window.toggleDarkMode();
        
        // راه‌اندازی event listeners
        setupEventListeners();
        
        hideLoading();
        showNotification('سیستم ALFAJR با موفقیت راه‌اندازی شد', 'success');
        isInitialized = true;
        
    } catch (error) {
        hideLoading();
        console.error('Initialization error:', error);
        showNotification('خطا در راه‌اندازی سیستم: ' + error.message, 'error');
        
        // نمایش خطا در UI
        const listElement = document.getElementById('customerList');
        if (listElement) {
            listElement.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>خطا در راه‌اندازی</h3>
                    <p>${error.message}</p>
                    <p>لطفاً صفحه را رفرش کنید یا از مرورگر دیگری استفاده نمایید.</p>
                    <button class="btn-primary" onclick="location.reload()" style="margin-top: 20px;">
                        <i class="fas fa-redo"></i> رفرش صفحه
                    </button>
                </div>
            `;
        }
    }
}

async function loadSettings() {
    try {
        const autoSave = await dbManager.getSettings('autoSave');
        if (autoSave === null) {
            await dbManager.saveSettings('autoSave', true);
        }
        
        const printFormat = await dbManager.getSettings('printFormat');
        if (printFormat === null) {
            await dbManager.saveSettings('printFormat', 'thermal');
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function setupEventListeners() {
    // جستجو
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const debouncedSearch = debounce(searchCustomer, 500);
        searchInput.addEventListener('input', debouncedSearch);
        
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') searchCustomer();
        });
    }
    
    // فایل input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', loadDataFromFile);
    }
    
    // توضیحات
    const notesTextarea = document.getElementById('customerNotes');
    if (notesTextarea) {
        notesTextarea.addEventListener('input', updateNotes);
    }
    
    // میانبرهای صفحه کلید
    document.addEventListener('keydown', function(e) {
        // Ctrl+S برای ذخیره
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (currentCustomerIndex !== null) {
                saveCustomer();
                showNotification('تغییرات ذخیره شد', 'success');
            }
        }
        
        // Escape برای بازگشت
        if (e.key === 'Escape') {
            const profilePage = document.getElementById('profilePage');
            if (profilePage && profilePage.style.display !== 'none') {
                backHome();
            }
        }
        
        // Ctrl+F برای جستجو
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
        
        // Ctrl+N برای مشتری جدید
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            addCustomer();
        }
        
        // Ctrl+P برای چاپ
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            if (currentCustomerIndex !== null) {
                printThermalLabel();
            }
        }
    });
    
    // بستن منوی تنظیمات با کلیک خارج
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('settingsDropdown');
        const settingsBtn = document.querySelector('.settings-btn');
        
        if (dropdown && dropdown.classList.contains('show') && 
            !dropdown.contains(event.target) && 
            !settingsBtn.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    });
}

// ========== CUSTOMER MANAGEMENT ==========
async function addCustomer() {
    const name = prompt('نام کامل مشتری را وارد کنید:');
    if (!name || name.trim() === '') {
        showNotification('نام مشتری الزامی است', 'warning');
        return;
    }

    const phone = prompt('شماره تلفن مشتری را وارد کنید:');
    if (!phone || phone.trim() === '') {
        showNotification('شماره تلفن الزامی است', 'warning');
        return;
    }

    try {
        showLoading('در حال اضافه کردن مشتری جدید...');
        const customer = new Customer(name.trim(), phone.trim());
        await dbManager.saveCustomer(customer);
        
        // بارگذاری مجدد لیست مشتریان
        await loadCustomers();
        
        // پیدا کردن و باز کردن مشتری جدید
        const index = customers.findIndex(c => c.id === customer.id);
        if (index !== -1) {
            openProfile(index);
        }
        
        hideLoading();
        showNotification(`مشتری "${name}" با موفقیت اضافه شد`, 'success');
    } catch (error) {
        hideLoading();
        console.error('Error adding customer:', error);
        showNotification('خطا در اضافه کردن مشتری: ' + error.message, 'error');
    }
}

async function loadCustomers() {
    try {
        showLoading('در حال بارگذاری مشتریان...');
        customers = await dbManager.getAllCustomers();
        renderCustomerList();
        updateStats();
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading customers:', error);
        showNotification('خطا در بارگذاری مشتریان', 'error');
        renderCustomerList(); // نمایش لیست خالی در صورت خطا
    }
}

function renderCustomerList() {
    const listElement = document.getElementById('customerList');
    if (!listElement) {
        console.error('Customer list element not found');
        return;
    }

    if (!customers || customers.length === 0) {
        listElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <h3>هنوز مشتری ثبت نشده است</h3>
                <p>برای شروع، روی دکمه "مشتری جدید" کلیک کنید</p>
                <button class="btn-primary" onclick="addCustomer()" style="margin-top: 20px;">
                    <i class="fas fa-user-plus"></i> افزودن اولین مشتری
                </button>
            </div>
        `;
        return;
    }

    let html = '';
    customers.forEach((customer, index) => {
        const hasPrice = customer.sewingPriceAfghani && customer.sewingPriceAfghani > 0;
        const isPaid = customer.paymentReceived;
        const deliveryDay = customer.deliveryDay;
        const date = new Date(customer.createdAt);
        const formattedDate = date.toLocaleDateString('fa-IR');
        const hasNotes = customer.notes && customer.notes.trim().length > 0;
        
        html += `
            <div class="customer-card" onclick="openProfile(${index})">
                <div class="customer-header">
                    <span class="customer-id">${customer.id.substring(0, 8)}</span>
                    <span class="customer-date">${formattedDate}</span>
                </div>
                <div class="customer-name">${customer.name || 'بدون نام'}</div>
                <div class="customer-phone">
                    <i class="fas fa-phone"></i>
                    ${customer.phone || 'بدون شماره'}
                </div>
                ${hasNotes ? `
                    <div class="customer-notes">
                        <i class="fas fa-sticky-note"></i>
                        ${customer.notes.substring(0, 80)}${customer.notes.length > 80 ? '...' : ''}
                    </div>
                ` : ''}
                <div class="customer-footer">
                    <div class="customer-badges">
                        ${hasPrice ? `<span class="badge price">${formatPrice(customer.sewingPriceAfghani)} افغانی</span>` : ''}
                        ${isPaid ? '<span class="badge paid">پرداخت شده</span>' : ''}
                        ${deliveryDay ? `<span class="badge delivery">${deliveryDay}</span>` : ''}
                    </div>
                    <button class="delete-btn-small" onclick="event.stopPropagation(); deleteCustomer(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });

    listElement.innerHTML = html;
}

async function searchCustomer() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    const query = searchInput.value.trim();
    if (!query) {
        await loadCustomers();
        return;
    }

    try {
        showLoading('در حال جستجو...');
        const results = await dbManager.searchCustomers(query);
        
        const listElement = document.getElementById('customerList');
        if (!listElement) return;

        if (results.length === 0) {
            listElement.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>مشتری یافت نشد</h3>
                    <p>هیچ مشتری با مشخصات "${query}" پیدا نشد</p>
                    <button class="btn-secondary" onclick="document.getElementById('searchInput').value = ''; loadCustomers();" style="margin-top: 20px;">
                        <i class="fas fa-times"></i> پاک کردن جستجو
                    </button>
                </div>
            `;
            hideLoading();
            return;
        }

        let html = '';
        results.forEach((customer, index) => {
            const realIndex = customers.findIndex(c => c.id === customer.id);
            const hasPrice = customer.sewingPriceAfghani && customer.sewingPriceAfghani > 0;
            const isPaid = customer.paymentReceived;
            const deliveryDay = customer.deliveryDay;
            
            html += `
                <div class="customer-card search-result" onclick="openProfile(${realIndex})" style="border: 2px solid #D4AF37;">
                    <div style="background: rgba(212, 175, 55, 0.1); padding: 5px 10px; border-radius: 20px; font-size: 12px; color: #D4AF37; margin-bottom: 10px; display: inline-block;">
                        <i class="fas fa-search"></i> نتیجه جستجو
                    </div>
                    <div class="customer-name">${customer.name || 'بدون نام'}</div>
                    <div class="customer-phone">
                        <i class="fas fa-phone"></i>
                        ${customer.phone || 'بدون شماره'}
                    </div>
                    <div class="customer-footer">
                        <div class="customer-badges">
                            ${hasPrice ? `<span class="badge price">${formatPrice(customer.sewingPriceAfghani)} افغانی</span>` : ''}
                            ${isPaid ? '<span class="badge paid">پرداخت شده</span>' : ''}
                            ${deliveryDay ? `<span class="badge delivery">${deliveryDay}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });

        listElement.innerHTML = html;
        hideLoading();
        showNotification(`${results.length} مشتری یافت شد`, 'success');
    } catch (error) {
        hideLoading();
        console.error('Error searching:', error);
        showNotification('خطا در جستجو', 'error');
    }
}

async function deleteCustomer(index) {
    if (index < 0 || index >= customers.length) return;
    
    const customer = customers[index];
    if (!customer) return;
    
    const customerName = customer.name || 'این مشتری';
    if (!confirm(`آیا از حذف "${customerName}" مطمئن هستید؟\nاین عمل قابل بازگشت نیست.`)) return;
    
    try {
        showLoading('در حال حذف مشتری...');
        await dbManager.deleteCustomer(customer.id);
        await loadCustomers();
        
        // اگر در صفحه پروفایل هستیم، به خانه بازگردیم
        if (document.getElementById('profilePage').style.display !== 'none') {
            backHome();
        }
        
        hideLoading();
        showNotification('مشتری با موفقیت حذف شد', 'success');
    } catch (error) {
        hideLoading();
        console.error('Error deleting customer:', error);
        showNotification('خطا در حذف مشتری', 'error');
    }
}

// ========== PROFILE MANAGEMENT ==========
function openProfile(index) {
    if (index < 0 || index >= customers.length) {
        showNotification('مشتری یافت نشد', 'error');
        return;
    }

    currentCustomerIndex = index;
    const customer = customers[index];

    // به‌روزرسانی اطلاعات اصلی
    document.getElementById('profileName').textContent = customer.name || 'بدون نام';
    document.getElementById('profilePhoneText').textContent = customer.phone || 'بدون شماره';
    document.getElementById('profileId').textContent = `کد: ${customer.id}`;
    
    // به‌روزرسانی توضیحات (متن)
    const notesElement = document.getElementById('customerNotes');
    if (notesElement) {
        notesElement.value = customer.notes || '';
    }

    // رندر تمام بخش‌ها
    renderMeasurements();
    renderModels();
    renderOrders();
    renderPriceDelivery();
    
    // اضافه کردن دکمه‌های چاپ
    addPrintButtons();

    // نمایش صفحه پروفایل
    document.getElementById('homePage').style.display = 'none';
    document.getElementById('profilePage').style.display = 'block';

    // اسکرول به بالا
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backHome() {
    document.getElementById('homePage').style.display = 'block';
    document.getElementById('profilePage').style.display = 'none';
    currentCustomerIndex = null;
    loadCustomers();
}

function updateNotes() {
    if (currentCustomerIndex === null) return;
    
    const notesElement = document.getElementById('customerNotes');
    if (!notesElement) return;
    
    const customer = customers[currentCustomerIndex];
    customer.notes = notesElement.value; // ذخیره به عنوان متن
    saveCustomer();
}

function saveCustomer() {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    if (!customer) return;
    
    // به‌روزرسانی از المان‌های UI
    const notesElement = document.getElementById('customerNotes');
    if (notesElement) {
        customer.notes = notesElement.value; // متن
    }
    
    // به‌روزرسانی اندازه‌گیری‌ها از ورودی‌ها (اعداد)
    const measurementInputs = document.querySelectorAll('.measurement-input');
    measurementInputs.forEach(input => {
        const field = input.dataset.field;
        if (field) {
            const value = input.value;
            // تبدیل به عدد اگر ممکن باشد
            customer.measurements[field] = value ? parseFloat(value) : '';
        }
    });
    
    // به‌روزرسانی قیمت (عدد)
    const priceInput = document.getElementById('sewingPrice');
    if (priceInput) {
        const priceValue = priceInput.value;
        customer.sewingPriceAfghani = priceValue ? parseInt(priceValue) : null;
    }
    
    // ذخیره خودکار با debounce
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await dbManager.saveCustomer(customer);
            console.log('Auto-saved customer:', customer.name);
            // نمایش نوتیفیکیشن کوچک
            const saveIndicator = document.createElement('div');
            saveIndicator.textContent = '✓ ذخیره شد';
            saveIndicator.style.cssText = `
                position: fixed;
                bottom: 80px;
                left: 30px;
                background: #28a745;
                color: white;
                padding: 8px 15px;
                border-radius: 20px;
                font-size: 12px;
                z-index: 1000;
                animation: fadeInOut 2s;
            `;
            document.body.appendChild(saveIndicator);
            setTimeout(() => {
                if (saveIndicator.parentNode) {
                    saveIndicator.parentNode.removeChild(saveIndicator);
                }
            }, 2000);
        } catch (error) {
            console.error('Error auto-saving:', error);
        }
    }, 1500);
}

// ========== MEASUREMENTS SECTION ==========
function renderMeasurements() {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    const container = document.getElementById('measurementsContainer');
    if (!container) return;

    let html = `
        <div class="section-header">
            <h3><i class="fas fa-ruler-combined"></i> اندازه‌گیری‌ها (سانتی‌متر)</h3>
        </div>
        <div class="measurements-grid">
    `;

    // تعریف گروه‌های اندازه‌گیری
    const groups = [
        {
            title: 'قد',
            fields: [{key: 'قد', label: 'قد (سانتی‌متر)', placeholder: '170', icon: 'fas fa-user-alt'}]
        },
        {
            title: 'شانه',
            fields: [
                {key: 'شانه_یک', label: 'شانه یک', placeholder: '45', icon: 'fas fa-arrows-alt-h'},
                {key: 'شانه_دو', label: 'شانه دو', placeholder: '45', icon: 'fas fa-arrows-alt-h'}
            ]
        },
        {
            title: 'آستین',
            fields: [
                {key: 'آستین_یک', label: 'آستین یک', placeholder: '60', icon: 'fas fa-hand-paper'},
                {key: 'آستین_دو', label: 'آستین دو', placeholder: '25', icon: 'fas fa-arrows-alt-v'},
                {key: 'آستین_سه', label: 'آستین سه', placeholder: '15', icon: 'fas fa-ruler-vertical'}
            ]
        },
        {
            title: 'بدنه',
            fields: [
                {key: 'بغل', label: 'بغل', placeholder: '50', icon: 'fas fa-tshirt'},
                {key: 'دامن', label: 'دامن', placeholder: '100', icon: 'fas fa-venus'},
                {key: 'گردن', label: 'گردن', placeholder: '40', icon: 'fas fa-circle'},
                {key: 'دور_سینه', label: 'دور سینه', placeholder: '100', icon: 'fas fa-arrows-alt'}
            ]
        },
        {
            title: 'شلوار',
            fields: [
                {key: 'شلوار', label: 'شلوار', placeholder: '110', icon: 'fas fa-male'},
                {key: 'دم_پاچه', label: 'دم پاچه', placeholder: '22', icon: 'fas fa-shoe-prints'}
            ]
        },
        {
            title: 'سایر',
            fields: [
                {key: 'بر_تمبان', label: 'بر تهمان (ب)', placeholder: '40', icon: 'fas fa-ruler'},
                {key: 'خشتک', label: 'خشتک (خ)', placeholder: '25', icon: 'fas fa-shoe-prints'},
                {key: 'چاک_پتی', label: 'چاک پتی', placeholder: '30', icon: 'fas fa-cut'}
            ]
        },
        {
            title: 'سفارش',
            fields: [
                {key: 'تعداد_سفارش', label: 'تعداد سفارش', placeholder: '1', icon: 'fas fa-clipboard-list'},
                {key: 'مقدار_تکه', label: 'مقدار تکه', placeholder: '2', icon: 'fas fa-layer-group'}
            ]
        }
    ];

    groups.forEach(group => {
        html += `<div class="measurement-group">`;
        html += `<h4><i class="fas fa-cube"></i> ${group.title}</h4>`;
        html += `<div class="measurement-fields">`;
        
        group.fields.forEach(field => {
            const value = customer.measurements[field.key] || '';
            html += `
                <div class="measurement-field">
                    <label><i class="${field.icon}"></i> ${field.label}</label>
                    <input type="number" 
                           class="measurement-input" 
                           data-field="${field.key}"
                           value="${value}"
                           placeholder="${field.placeholder}"
                           oninput="updateMeasurement('${field.key}', this.value)"
                           step="0.5"
                           min="0">
                    <div class="unit">سانتی‌متر</div>
                </div>
            `;
        });
        
        html += `</div></div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
}

function updateMeasurement(field, value) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    if (!customer.measurements) {
        customer.measurements = {};
    }
    
    // تبدیل به عدد
    customer.measurements[field] = value ? parseFloat(value) : '';
    saveCustomer();
}

// ========== MODELS SECTION ==========
function renderModels() {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    const container = document.getElementById('modelsContainer');
    if (!container) return;

    let html = `
        <div class="section-header">
            <h3><i class="fas fa-tshirt"></i> مدل‌ها و ویژگی‌ها</h3>
        </div>
        <div class="models-grid">
    `;

    // مدل‌های یخن
    html += `
        <div class="model-category">
            <h4><i class="fas fa-snowflake"></i> مدل یخن</h4>
            <div class="model-options">
    `;
    
    AppConfig.YAKHUN_MODELS.forEach(model => {
        const isSelected = customer.models.yakhun === model;
        html += `
            <div class="model-option ${isSelected ? 'selected' : ''}" 
                 onclick="selectModel('yakhun', '${model}')">
                ${model}
            </div>
        `;
    });
    
    html += `</div></div>`;

    // مدل‌های آستین
    html += `
        <div class="model-category">
            <h4><i class="fas fa-hand-paper"></i> مدل آستین</h4>
            <div class="model-options">
    `;
    
    AppConfig.SLEEVE_MODELS.forEach(model => {
        const isSelected = customer.models.sleeve === model;
        html += `
            <div class="model-option ${isSelected ? 'selected' : ''}" 
                 onclick="selectModel('sleeve', '${model}')">
                ${model}
            </div>
        `;
    });
    
    html += `</div></div>`;

    // مدل‌های دامن (انتخاب چندگانه)
    html += `
        <div class="model-category">
            <h4><i class="fas fa-venus"></i> مدل دامن</h4>
            <div class="model-options">
    `;
    
    AppConfig.SKIRT_MODELS.forEach(model => {
        const isSelected = customer.models.skirt && customer.models.skirt.includes(model);
        html += `
            <div class="model-option multi-select ${isSelected ? 'selected' : ''}" 
                 onclick="toggleMultiSelect('skirt', '${model}')">
                ${model}
                <span class="checkmark">${isSelected ? '✓' : ''}</span>
            </div>
        `;
    });
    
    html += `</div></div>`;

    // ویژگی‌ها (انتخاب چندگانه)
    html += `
        <div class="model-category">
            <h4><i class="fas fa-star"></i> ویژگی‌ها</h4>
            <div class="model-options">
    `;
    
    AppConfig.FEATURES_LIST.forEach(feature => {
        const isSelected = customer.models.features && customer.models.features.includes(feature);
        html += `
            <div class="model-option multi-select ${isSelected ? 'selected' : ''}" 
                 onclick="toggleMultiSelect('features', '${feature}')">
                ${feature}
                <span class="checkmark">${isSelected ? '✓' : ''}</span>
            </div>
        `;
    });
    
    html += `</div></div></div>`;
    container.innerHTML = html;
}

function selectModel(type, model) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    customer.models[type] = model; // ذخیره به عنوان متن
    renderModels(); // رندر مجدد بخش
    saveCustomer();
    showNotification(`مدل ${type === 'yakhun' ? 'یخن' : 'آستین'} به "${model}" تغییر کرد`, 'success');
}

function toggleMultiSelect(type, value) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    if (!customer.models[type]) {
        customer.models[type] = [];
    }
    
    const index = customer.models[type].indexOf(value);
    if (index > -1) {
        customer.models[type].splice(index, 1);
        showNotification(`"${value}" حذف شد`, 'info');
    } else {
        customer.models[type].push(value); // افزودن متن به آرایه
        showNotification(`"${value}" اضافه شد`, 'success');
    }
    
    // رندر مجدد بخش
    renderModels();
    saveCustomer();
}

// ========== PRICE & DELIVERY SECTION ==========
function renderPriceDelivery() {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    const container = document.getElementById('priceDeliveryContainer');
    if (!container) return;

    let html = `
        <div class="section-header">
            <h3><i class="fas fa-money-bill-wave"></i> قیمت و تحویل</h3>
        </div>
        <div class="price-delivery-grid">
            <div class="price-section">
                <h4><i class="fas fa-money-bill"></i> قیمت دوخت</h4>
                <div class="price-input-group">
                    <input type="number" 
                           id="sewingPrice"
                           value="${customer.sewingPriceAfghani || ''}"
                           placeholder="مبلغ به افغانی"
                           oninput="updatePrice(this.value)"
                           min="0">
                    <span class="currency">افغانی</span>
                </div>
                <p style="color: #888; margin-top: 10px; font-size: 14px;">مبلغ را به عدد وارد کنید</p>
            </div>
            
            <div class="payment-section">
                <h4><i class="fas fa-check-circle"></i> وضعیت پرداخت</h4>
                <div class="payment-toggle" onclick="togglePayment()">
                    <div class="payment-checkbox ${customer.paymentReceived ? 'checked' : ''}">
                        <div class="checkbox-icon">${customer.paymentReceived ? '✓' : ''}</div>
                        <span>${customer.paymentReceived ? 'پرداخت شده' : 'پرداخت نشده'}</span>
                    </div>
                    ${customer.paymentReceived && customer.paymentDate ? 
                        `<div class="payment-date">تاریخ پرداخت: ${new Date(customer.paymentDate).toLocaleDateString('fa-IR')}</div>` : ''}
                </div>
            </div>
            
            <div class="delivery-section">
                <h4><i class="fas fa-calendar-check"></i> روز تحویل</h4>
                <div class="delivery-days">
    `;
    
    AppConfig.DAYS_OF_WEEK.forEach(day => {
        const isSelected = customer.deliveryDay === day;
        html += `
            <div class="day-button ${isSelected ? 'selected' : ''}" 
                 onclick="setDeliveryDay('${day}')">
                ${day}
            </div>
        `;
    });
    
    html += `
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

function updatePrice(price) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    // تبدیل به عدد
    customer.sewingPriceAfghani = price ? parseInt(price) : null;
    saveCustomer();
}

function togglePayment() {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    customer.paymentReceived = !customer.paymentReceived;
    
    if (customer.paymentReceived && !customer.paymentDate) {
        customer.paymentDate = new Date().toISOString();
    } else if (!customer.paymentReceived) {
        customer.paymentDate = null;
    }
    
    renderPriceDelivery();
    saveCustomer();
    showNotification(`وضعیت پرداخت تغییر کرد به: ${customer.paymentReceived ? 'پرداخت شده' : 'پرداخت نشده'}`, 'success');
}

function setDeliveryDay(day) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    customer.deliveryDay = day; // ذخیره به عنوان متن
    renderPriceDelivery();
    saveCustomer();
    showNotification(`روز تحویل به ${day} تنظیم شد`, 'success');
}

// ========== ORDERS SECTION ==========
function renderOrders() {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    const container = document.getElementById('ordersContainer');
    if (!container) return;

    let html = `
        <div class="section-header">
            <h3><i class="fas fa-clipboard-list"></i> سفارشات</h3>
            <button class="btn-add-order" onclick="addOrder()">
                <i class="fas fa-plus"></i> سفارش جدید
            </button>
        </div>
    `;
    
    if (!customer.orders || customer.orders.length === 0) {
        html += `
            <div class="empty-orders">
                <i class="fas fa-clipboard"></i>
                <p>هنوز سفارشی ثبت نشده است</p>
            </div>
        `;
    } else {
        html += `<div class="orders-list">`;
        customer.orders.forEach((order, index) => {
            const date = new Date(order.date || order.createdAt);
            html += `
                <div class="order-item">
                    <div class="order-content">
                        <div class="order-header">
                            <span class="order-number">سفارش #${index + 1}</span>
                            <span class="order-date">${date.toLocaleDateString('fa-IR')}</span>
                        </div>
                        <div class="order-details">${order.details || 'بدون توضیحات'}</div>
                    </div>
                    <button class="btn-delete-order" onclick="deleteOrder(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        });
        html += `</div>`;
    }
    
    container.innerHTML = html;
}

function addOrder() {
    if (currentCustomerIndex === null) return;
    
    const details = prompt('جزئیات سفارش جدید را وارد کنید (متن):');
    if (!details || details.trim() === '') {
        showNotification('لطفاً جزئیات سفارش را وارد کنید', 'warning');
        return;
    }
    
    const customer = customers[currentCustomerIndex];
    if (!customer.orders) {
        customer.orders = [];
    }
    
    customer.orders.push({
        id: Date.now().toString(),
        details: details.trim(), // ذخیره به عنوان متن
        date: new Date().toISOString(),
        status: 'pending'
    });
    
    renderOrders();
    saveCustomer();
    showNotification('سفارش جدید اضافه شد', 'success');
}

function deleteOrder(index) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    if (!customer.orders || index >= customer.orders.length) return;
    
    if (confirm('آیا از حذف این سفارش مطمئن هستید؟')) {
        customer.orders.splice(index, 1);
        renderOrders();
        saveCustomer();
        showNotification('سفارش حذف شد', 'success');
    }
}

// ========== PRINT FUNCTIONS ==========
function printThermalLabel() {
    if (currentCustomerIndex === null) {
        showNotification('لطفاً ابتدا یک مشتری انتخاب کنید', 'warning');
        return;
    }

    const customer = customers[currentCustomerIndex];
    const today = new Date();
    const persianDate = today.toLocaleDateString('fa-IR');
    const time = today.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    
    const printContent = `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
    <meta charset="UTF-8">
    <title>لیبل اندازه‌گیری ALFAJR</title>
    <style>
        @page { 
            size: 80mm auto; 
            margin: 0; 
            padding: 0;
        }
        body { 
            width: 78mm; 
            padding: 1mm; 
            font-family: 'B Nazanin', Tahoma, Arial, sans-serif; 
            font-size: 9px; 
            margin: 0;
            background: white;
            color: black;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        .label {
            border: 2px solid #000;
            padding: 2mm;
            border-radius: 2px;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .header {
            text-align: center;
            border-bottom: 1px dashed #000;
            padding-bottom: 1mm;
            margin-bottom: 2mm;
        }
        .shop-name {
            font-size: 11px;
            font-weight: bold;
            margin-bottom: 1mm;
        }
        .contact {
            font-size: 8px;
            margin-bottom: 1mm;
        }
        .customer-info {
            text-align: center;
            margin: 2mm 0;
            padding: 1mm;
            background: #f0f0f0;
            border-radius: 1px;
        }
        .customer-name {
            font-size: 10px;
            font-weight: bold;
            margin-bottom: 0.5mm;
        }
        .customer-phone {
            font-size: 9px;
        }
        .customer-id {
            font-size: 8px;
            color: #666;
            margin-top: 0.5mm;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8px;
            margin: 2mm 0;
        }
        td {
            border: 0.5px solid #000;
            padding: 1mm;
            text-align: center;
            vertical-align: middle;
        }
        .label-cell {
            font-weight: bold;
            background: #f8f8f8;
            width: 40%;
        }
        .value-cell {
            width: 60%;
        }
        .measurement-row {
            height: 5mm;
        }
        .models-section {
            margin-top: 2mm;
            padding-top: 1mm;
            border-top: 0.5px dashed #000;
        }
        .model-item {
            margin-bottom: 0.5mm;
            font-size: 8px;
        }
        .model-label {
            font-weight: bold;
            display: inline-block;
            width: 25mm;
        }
        .footer {
            text-align: center;
            margin-top: 2mm;
            padding-top: 1mm;
            border-top: 0.5px solid #ccc;
            font-size: 7px;
            color: #666;
        }
        .print-date {
            margin-bottom: 0.5mm;
        }
        .barcode-area {
            text-align: center;
            margin: 1mm 0;
            padding: 1mm;
            border: 0.5px dashed #ccc;
            font-family: monospace;
            font-size: 7px;
            letter-spacing: 1px;
        }
        @media print {
            body {
                margin: 0;
                padding: 0;
            }
            .label {
                border: 1px solid #000;
            }
            .no-print {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    <div class="label">
        <div class="header">
            <div class="shop-name">ALFAJR خیاطی</div>
            <div class="contact">تلفن: ۰۷۹۹۷۹۹۰۰۹</div>
        </div>
        
        <div class="customer-info">
            <div class="customer-name">${customer.name || 'بدون نام'}</div>
            <div class="customer-phone">${customer.phone || 'بدون شماره'}</div>
            <div class="customer-id">${customer.id.substring(0, 12)}</div>
        </div>
        
        <div class="barcode-area">
            ${customer.id}
        </div>
        
        <table>
            <tr class="measurement-row">
                <td class="label-cell">قد</td>
                <td class="value-cell">${customer.measurements.قد || '-'} سانت</td>
            </tr>
            <tr class="measurement-row">
                <td class="label-cell">شانه</td>
                <td class="value-cell">${customer.measurements.شانه_یک || '-'} / ${customer.measurements.شانه_دو || '-'}</td>
            </tr>
            <tr class="measurement-row">
                <td class="label-cell">آستین</td>
                <td class="value-cell">${customer.measurements.آستین_یک || '-'} / ${customer.measurements.آستین_دو || '-'} / ${customer.measurements.آستین_سه || '-'}</td>
            </tr>
            <tr class="measurement-row">
                <td class="label-cell">بغل</td>
                <td class="value-cell">${customer.measurements.بغل || '-'}</td>
            </tr>
            <tr class="measurement-row">
                <td class="label-cell">دامن</td>
                <td class="value-cell">${customer.measurements.دامن || '-'}</td>
            </tr>
            <tr class="measurement-row">
                <td class="label-cell">گردن</td>
                <td class="value-cell">${customer.measurements.گردن || '-'}</td>
            </tr>
            <tr class="measurement-row">
                <td class="label-cell">دور سینه</td>
                <td class="value-cell">${customer.measurements.dور_سینه || '-'}</td>
            </tr>
            <tr class="measurement-row">
                <td class="label-cell">شلوار</td>
                <td class="value-cell">${customer.measurements.شلوار || '-'}</td>
            </tr>
            <tr class="measurement-row">
                <td class="label-cell">دم پاچه</td>
                <td class="value-cell">${customer.measurements.دم_پاچه || '-'}</td>
            </tr>
            <tr class="measurement-row">
                <td class="label-cell">بر تهمان</td>
                <td class="value-cell">${customer.measurements.بر_تمبان || '-'}</td>
            </tr>
            <tr class="measurement-row">
                <td class="label-cell">خشتک</td>
                <td class="value-cell">${customer.measurements.خشتک || '-'}</td>
            </tr>
        </table>
        
        <div class="models-section">
            <div class="model-item">
                <span class="model-label">مدل یخن:</span>
                <span>${customer.models.yakhun || '-'}</span>
            </div>
            <div class="model-item">
                <span class="model-label">مدل آستین:</span>
                <span>${customer.models.sleeve || '-'}</span>
            </div>
            <div class="model-item">
                <span class="model-label">مدل دامن:</span>
                <span>${customer.models.skirt && customer.models.skirt.length > 0 ? customer.models.skirt.join('، ') : '-'}</span>
            </div>
            ${customer.deliveryDay ? `
            <div class="model-item">
                <span class="model-label">روز تحویل:</span>
                <span>${customer.deliveryDay}</span>
            </div>
            ` : ''}
            ${customer.sewingPriceAfghani ? `
            <div class="model-item">
                <span class="model-label">قیمت:</span>
                <span>${formatPrice(customer.sewingPriceAfghani)} افغانی</span>
            </div>
            ` : ''}
        </div>
        
        <div class="footer">
            <div class="print-date">${persianDate} - ${time}</div>
            <div>ALFAJR سیستم مدیریت خیاطی - نسخه ۴</div>
        </div>
    </div>
    
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(function() {
                    window.close();
                }, 500);
            }, 300);
        };
        
        // جلوگیری از نمایش دیالوگ ذخیره در Chrome
        window.onbeforeunload = null;
    </script>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=600,height=800,toolbar=no,scrollbars=no,status=no');
    if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        
        // جلوگیری از بلاک شدن popup
        printWindow.focus();
    } else {
        showNotification('لطفاً popup blocker را غیرفعال کنید یا اجازه بازشدن پنجره جدید را بدهید', 'error');
    }
}

function printThermalInvoice() {
    if (currentCustomerIndex === null) {
        showNotification('لطفاً ابتدا یک مشتری انتخاب کنید', 'warning');
        return;
    }

    const customer = customers[currentCustomerIndex];
    const today = new Date();
    const persianDate = today.toLocaleDateString('fa-IR');
    const time = today.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    
    // محاسبه جمع فاکتور
    const items = [];
    let total = 0;
    
    // آیتم اصلی
    if (customer.sewingPriceAfghani) {
        items.push({
            description: 'دست‌مزد دوخت',
            quantity: 1,
            unitPrice: customer.sewingPriceAfghani,
            total: customer.sewingPriceAfghani
        });
        total += customer.sewingPriceAfghani;
    }
    
    // ویژگی‌های اضافی
    if (customer.models.features && customer.models.features.length > 0) {
        customer.models.features.forEach(feature => {
            // قیمت فرضی برای هر ویژگی
            const featurePrice = 500;
            items.push({
                description: feature,
                quantity: 1,
                unitPrice: featurePrice,
                total: featurePrice
            });
            total += featurePrice;
        });
    }
    
    const printContent = `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
    <meta charset="UTF-8">
    <title>فاکتور ALFAJR</title>
    <style>
        @page { 
            size: 80mm auto; 
            margin: 0; 
            padding: 0;
        }
        body { 
            width: 78mm; 
            padding: 1mm; 
            font-family: 'B Nazanin', Tahoma, Arial, sans-serif; 
            font-size: 9px; 
            margin: 0;
            background: white;
            color: black;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        .invoice {
            border: 2px solid #000;
            padding: 2mm;
            border-radius: 2px;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .header {
            text-align: center;
            border-bottom: 1px dashed #000;
            padding-bottom: 1mm;
            margin-bottom: 2mm;
        }
        .title {
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 1mm;
        }
        .invoice-info {
            font-size: 8px;
            margin-bottom: 1mm;
        }
        .invoice-number {
            font-family: monospace;
            letter-spacing: 1px;
        }
        .customer-info {
            margin: 2mm 0;
            padding: 1mm;
            background: #f0f0f0;
            border-radius: 1px;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.5mm;
            font-size: 8px;
        }
        .info-label {
            font-weight: bold;
            min-width: 20mm;
        }
        .info-value {
            text-align: left;
        }
        .items-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8px;
            margin: 2mm 0;
        }
        .items-table th {
            border: 0.5px solid #000;
            padding: 1mm;
            background: #f8f8f8;
            font-weight: bold;
            text-align: center;
        }
        .items-table td {
            border: 0.5px solid #000;
            padding: 0.8mm;
            text-align: center;
            vertical-align: middle;
        }
        .col-desc {
            width: 40%;
            text-align: right;
        }
        .col-qty {
            width: 15%;
        }
        .col-price {
            width: 20%;
        }
        .col-total {
            width: 25%;
        }
        .total-section {
            margin-top: 2mm;
            padding-top: 1mm;
            border-top: 1px solid #000;
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.5mm;
            font-size: 9px;
        }
        .total-label {
            font-weight: bold;
        }
        .total-amount {
            font-weight: bold;
            font-size: 11px;
            color: #000;
        }
        .payment-status {
            text-align: center;
            margin: 2mm 0;
            padding: 1mm;
            border-radius: 1px;
            font-weight: bold;
            font-size: 10px;
        }
        .status-paid {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status-unpaid {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .delivery-info {
            text-align: center;
            margin: 1mm 0;
            padding: 1mm;
            background: #e3f2fd;
            border-radius: 1px;
            font-size: 8px;
            border: 0.5px solid #bbdefb;
        }
        .notes {
            margin-top: 2mm;
            padding: 1mm;
            border-top: 0.5px dashed #ccc;
            font-size: 8px;
            color: #666;
        }
        .footer {
            text-align: center;
            margin-top: 2mm;
            padding-top: 1mm;
            border-top: 0.5px solid #ccc;
            font-size: 7px;
            color: #666;
        }
        .signature-area {
            margin-top: 3mm;
            padding-top: 1mm;
            border-top: 0.5px dashed #000;
            text-align: center;
        }
        .signature-line {
            width: 40mm;
            border-top: 0.5px solid #000;
            margin: 2mm auto 0.5mm;
            display: inline-block;
        }
        .barcode {
            text-align: center;
            margin: 1mm 0;
            font-family: monospace;
            font-size: 7px;
            letter-spacing: 1px;
        }
        @media print {
            body {
                margin: 0;
                padding: 0;
            }
            .invoice {
                border: 1px solid #000;
            }
            .no-print {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    <div class="invoice">
        <div class="header">
            <div class="title">فاکتور فروش</div>
            <div class="invoice-info">
                <div>ALFAJR خیاطی</div>
                <div>تلفن: ۰۷۹۹۷۹۹۰۰۹</div>
                <div class="invoice-number">شماره: ${customer.id.substring(0, 8)}</div>
            </div>
        </div>
        
        <div class="barcode">
            ${customer.id}
        </div>
        
        <div class="customer-info">
            <div class="info-row">
                <span class="info-label">مشتری:</span>
                <span class="info-value">${customer.name || 'بدون نام'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">تلفن:</span>
                <span class="info-value">${customer.phone || 'بدون شماره'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">تاریخ:</span>
                <span class="info-value">${persianDate} - ${time}</span>
            </div>
        </div>
        
        <table class="items-table">
            <thead>
                <tr>
                    <th class="col-desc">شرح کالا/خدمت</th>
                    <th class="col-qty">تعداد</th>
                    <th class="col-price">فی (افغانی)</th>
                    <th class="col-total">مبلغ (افغانی)</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td class="col-desc">${item.description}</td>
                        <td class="col-qty">${item.quantity}</td>
                        <td class="col-price">${formatPrice(item.unitPrice)}</td>
                        <td class="col-total">${formatPrice(item.total)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        <div class="total-section">
            <div class="total-row">
                <span class="total-label">جمع کل:</span>
                <span class="total-amount">${formatPrice(total)} افغانی</span>
            </div>
        </div>
        
        <div class="payment-status ${customer.paymentReceived ? 'status-paid' : 'status-unpaid'}">
            ${customer.paymentReceived ? '✅ پرداخت شده' : '❌ پرداخت نشده'}
        </div>
        
        ${customer.deliveryDay ? `
        <div class="delivery-info">
            📅 تحویل: ${customer.deliveryDay}
        </div>
        ` : ''}
        
        ${customer.notes ? `
        <div class="notes">
            <strong>توضیحات:</strong> ${customer.notes.substring(0, 100)}${customer.notes.length > 100 ? '...' : ''}
        </div>
        ` : ''}
        
        <div class="signature-area">
            <div>امضا مشتری</div>
            <div class="signature-line"></div>
        </div>
        
        <div class="footer">
            <div>با تشکر از انتخاب شما</div>
            <div>ALFAJR خیاطی - ارائه دهنده خدمات دوخت با کیفیت</div>
            <div>تلفن: ۰۷۹۹۷۹۹۰۰۹ - نسخه ۴</div>
        </div>
    </div>
    
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(function() {
                    window.close();
                }, 500);
            }, 300);
        };
        
        // جلوگیری از نمایش دیالوگ ذخیره در Chrome
        window.onbeforeunload = null;
        
        // فرمت اعداد فارسی
        function formatPrice(price) {
            if (!price && price !== 0) return '۰';
            return new Intl.NumberFormat('fa-IR').format(price);
        }
    </script>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=600,height=800,toolbar=no,scrollbars=no,status=no');
    if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
    } else {
        showNotification('لطفاً popup blocker را غیرفعال کنید', 'error');
    }
}

function addPrintButtons() {
    const printContainer = document.getElementById('printButtonsContainer');
    if (printContainer) {
        printContainer.innerHTML = `
            <button class="btn-primary" onclick="printThermalLabel()">
                <i class="fas fa-print"></i>
                چاپ لیبل اندازه‌گیری
            </button>
            <button class="btn-secondary" onclick="printThermalInvoice()">
                <i class="fas fa-file-invoice"></i>
                چاپ فاکتور
            </button>
            <button class="btn-success" onclick="printCustomerReport()">
                <i class="fas fa-file-alt"></i>
                چاپ گزارش کامل
            </button>
        `;
    }
}

function printCustomerReport() {
    if (currentCustomerIndex === null) {
        showNotification('لطفاً ابتدا یک مشتری انتخاب کنید', 'warning');
        return;
    }
    
    showNotification('قابلیت چاپ گزارش کامل به زودی اضافه خواهد شد', 'info');
}

// ========== STATISTICS ==========
async function updateStats() {
    try {
        const totalCustomers = customers.length;
        const totalOrders = customers.reduce((sum, customer) => sum + (customer.orders ? customer.orders.length : 0), 0);
        const paidCustomers = customers.filter(c => c.paymentReceived).length;
        const dbSize = await dbManager.getDatabaseSize();
        
        document.getElementById('totalCustomers').textContent = totalCustomers;
        document.getElementById('activeOrders').textContent = totalOrders;
        document.getElementById('paidCustomers').textContent = paidCustomers;
        
        // نمایش حجم دیتابیس در کنسول
        console.log('Database size:', formatFileSize(dbSize));
        
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// ========== DATA MANAGEMENT ==========
async function saveDataToFile() {
    try {
        showLoading('در حال آماده‌سازی داده‌ها...');
        
        // ایجاد پشتیبان در دیتابیس
        const backupData = await dbManager.createBackup();
        
        // ذخیره در فایل
        const dataStr = JSON.stringify(backupData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
        link.download = `alfajr-backup-${timestamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        hideLoading();
        showNotification(`پشتیبان با موفقیت ذخیره شد (${formatFileSize(dataStr.length)})`, 'success');
    } catch (error) {
        hideLoading();
        console.error('Error exporting data:', error);
        showNotification('خطا در ذخیره فایل: ' + error.message, 'error');
    }
}

function loadDataFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('آیا از وارد کردن داده‌های جدید مطمئن هستید؟\nاین عمل ممکن است داده‌های فعلی را بازنویسی کند.')) {
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            showLoading('در حال وارد کردن داده‌ها...');
            const backupData = JSON.parse(e.target.result);
            
            // اعتبارسنجی فایل
            if (!backupData || !backupData.customers || !Array.isArray(backupData.customers)) {
                throw new Error('فرمت فایل نامعتبر است');
            }
            
            // پاک‌سازی داده‌های فعلی
            await dbManager.clearAllData();
            
            let importedCount = 0;
            let errorCount = 0;
            
            // وارد کردن مشتریان
            for (const customerData of backupData.customers) {
                try {
                    if (customerData.deleted) continue;
                    const customer = Customer.fromObject(customerData);
                    await dbManager.saveCustomer(customer);
                    importedCount++;
                } catch (error) {
                    console.error('Error importing customer:', error, customerData);
                    errorCount++;
                }
            }
            
            // بارگذاری مجدد لیست
            await loadCustomers();
            
            hideLoading();
            
            if (errorCount > 0) {
                showNotification(`${importedCount} مشتری با موفقیت وارد شد. ${errorCount} خطا رخ داد.`, 'warning');
            } else {
                showNotification(`${importedCount} مشتری با موفقیت وارد شد`, 'success');
            }
            
            event.target.value = '';
        } catch (error) {
            hideLoading();
            console.error('Error importing data:', error);
            showNotification('خطا در وارد کردن داده‌ها: ' + error.message, 'error');
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

async function clearAllData() {
    if (!confirm('⚠️ ⚠️ ⚠️\n\nآیا از پاک‌سازی تمام داده‌ها مطمئن هستید؟\n\nاین عمل قابل بازگشت نیست و تمام مشتریان، سفارشات و تنظیمات پاک خواهند شد.')) return;
    
    if (!confirm('❌ ❌ ❌\n\nآخرین هشدار!\n\nتمام اطلاعات شما حذف خواهد شد. برای ادامه مجدداً تأیید کنید.')) return;
    
    try {
        showLoading('در حال پاک‌سازی کامل دیتابیس...');
        await dbManager.clearAllData();
        customers = [];
        currentCustomerIndex = null;
        await loadCustomers();
        backHome();
        hideLoading();
        showNotification('تمامی داده‌ها با موفقیت پاک شدند', 'success');
    } catch (error) {
        hideLoading();
        console.error('Error clearing data:', error);
        showNotification('خطا در پاک‌سازی: ' + error.message, 'error');
    }
}

// ========== THEME MANAGEMENT ==========
function toggleDarkMode() {
    document.body.className = 'dark-mode';
    currentTheme = 'dark';
    if (dbManager) {
        dbManager.saveSettings('theme', 'dark');
    }
    showNotification('حالت تاریک فعال شد', 'success');
}

function toggleLightMode() {
    document.body.className = 'light-mode';
    currentTheme = 'light';
    if (dbManager) {
        dbManager.saveSettings('theme', 'light');
    }
    showNotification('حالت روشن فعال شد', 'success');
}

function toggleVividMode() {
    document.body.className = 'vivid-mode';
    currentTheme = 'vivid';
    if (dbManager) {
        dbManager.saveSettings('theme', 'vivid');
    }
    showNotification('حالت ویوید فعال شد', 'success');
}

// ========== GLOBAL EXPORTS ==========
window.addCustomer = addCustomer;
window.searchCustomer = searchCustomer;
window.openProfile = openProfile;
window.backHome = backHome;
window.saveCustomer = saveCustomer;
window.deleteCustomer = deleteCustomer;
window.updateNotes = updateNotes;
window.updateMeasurement = updateMeasurement;
window.selectModel = selectModel;
window.toggleMultiSelect = toggleMultiSelect;
window.updatePrice = updatePrice;
window.togglePayment = togglePayment;
window.setDeliveryDay = setDeliveryDay;
window.addOrder = addOrder;
window.deleteOrder = deleteOrder;
window.printThermalLabel = printThermalLabel;
window.printThermalInvoice = printThermalInvoice;
window.printCustomerReport = printCustomerReport;
window.saveDataToFile = saveDataToFile;
window.loadDataFromFile = loadDataFromFile;
window.clearAllData = clearAllData;
window.toggleDarkMode = toggleDarkMode;
window.toggleLightMode = toggleLightMode;
window.toggleVividMode = toggleVividMode;
window.formatPrice = formatPrice;
window.showNotification = showNotification;
window.showLoading = showLoading;
window.hideLoading = hideLoading;

// ========== START APP ==========
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

console.log('ALFAJR App initialized - Version 4.0');
