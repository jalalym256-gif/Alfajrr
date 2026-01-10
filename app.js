// ========== CONFIGURATION ==========
const AppConfig = {
    DATABASE_NAME: 'ALFAJR_DB',
    DATABASE_VERSION: 4,
    STORES: {
        CUSTOMERS: 'customers',
        SETTINGS: 'settings',
        BACKUPS: 'backups'
    },
    MEASUREMENT_FIELDS: [
        "قد", 
        "شانه_یک", "شانه_دو",
        "آستین_یک", "آستین_دو", "آستین_سه",
        "بغل", 
        "دامن", 
        "گردن", 
        "دور_سینه", 
        "شلوار", 
        "دم_پاچه",
        "بر_تمبان", 
        "خشتک", 
        "چاک_پتی", 
        "تعداد_سفارش", 
        "مقدار_تکه"
    ],
    YAKHUN_MODELS: ["آف دار", "چپه یخن", "پاکستانی", "ملی", "شهبازی", "خامک", "قاسمی"],
    SLEEVE_MODELS: ["کفک", "ساده شیش بخیه", "بندک", "پر بخیه", "آف دار", "لایی یک انچ"],
    SKIRT_MODELS: ["دامن یک بخیه", "دامن دوبخیه", "دامن چهارکنج", "دامن ترخیز", "دامن گاوی"],
    FEATURES_LIST: ["جیب رو", "جیب شلوار", "یک بخیه سند", "دو بخیه سند", "مکمل دو بخیه"]
};

// ========== GLOBAL VARIABLES ==========
let customers = [];
let currentIndex = null;
let isDarkMode = true;
let isVividMode = false;
let currentFieldIndex = 0;
let db = null;
let isDBInitialized = false;
let dbManager = null;

// ========== CUSTOMER CLASS ==========
class Customer {
    constructor(name, phone) {
        this.id = this.generateRandomFourDigitId();
        this.name = name;
        this.phone = phone;
        this.measurements = this.initMeasurements();
        this.orders = [];
        this.notes = "";
        this.models = {
            yakhun: "",
            sleeve: "",
            skirt: [],
            features: []
        };
        this.sewingPriceAfghani = null;
        this.deliveryDay = "";
        this.paymentReceived = false;
        this.paymentDate = null;
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
        this.deleted = false;
        this.version = 1;
    }

    generateRandomFourDigitId() {
        const timestamp = Date.now().toString().slice(-4);
        const random = Math.floor(Math.random() * 9000) + 1000;
        return (timestamp + random).toString().slice(-8);
    }

    initMeasurements() {
        const measurements = {};
        AppConfig.MEASUREMENT_FIELDS.forEach(field => {
            measurements[field] = "";
        });
        return measurements;
    }

    static fromObject(obj) {
        if (!obj || typeof obj !== 'object') {
            throw new Error("داده‌های نامعتبر برای مشتری");
        }
        
        const customer = new Customer(obj.name || '', obj.phone || '');
        
        // کپی تمام ویژگی‌ها
        Object.keys(obj).forEach(key => {
            if (key !== 'id') { // id نباید تغییر کند
                customer[key] = obj[key];
            }
        });
        
        // مقداردهی اولیه مقادیر null/undefined
        if (!customer.orders) customer.orders = [];
        if (!customer.measurements) customer.measurements = customer.initMeasurements();
        if (!customer.models) {
            customer.models = {
                yakhun: "",
                sleeve: "",
                skirt: [],
                features: []
            };
        }
        if (!Array.isArray(customer.models.skirt)) customer.models.skirt = [];
        if (!Array.isArray(customer.models.features)) customer.models.features = [];
        
        return customer;
    }
}

// ========== DATABASE MANAGER ==========
class DatabaseManager {
    constructor() {
        this.db = null;
        this.isInitialized = false;
        this.pendingTransactions = new Set();
    }

    async init() {
        return new Promise((resolve, reject) => {
            try {
                if (this.isInitialized && this.db) {
                    resolve(this.db);
                    return;
                }

                const request = indexedDB.open(AppConfig.DATABASE_NAME, AppConfig.DATABASE_VERSION);
                
                request.onerror = (event) => {
                    console.error("خطا در باز کردن دیتابیس:", event.target.error);
                    reject(event.target.error);
                    updateDBStatus(false);
                };
                
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.isInitialized = true;
                    console.log("دیتابیس با موفقیت باز شد");
                    
                    this.db.onerror = (event) => {
                        console.error("خطای دیتابیس:", event.target.error);
                        showNotification("خطا در عملیات دیتابیس", "error");
                    };
                    
                    this.db.onclose = () => {
                        console.log("دیتابیس بسته شد");
                        this.isInitialized = false;
                        updateDBStatus(false);
                    };
                    
                    updateDBStatus(true);
                    resolve(this.db);
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    console.log(`آپگرید دیتابیس از نسخه ${event.oldVersion} به ${event.newVersion}`);
                    
                    // حذف استورهای قدیمی اگر وجود دارند
                    if (event.oldVersion < 1) {
                        if (db.objectStoreNames.contains(AppConfig.STORES.CUSTOMERS)) {
                            db.deleteObjectStore(AppConfig.STORES.CUSTOMERS);
                        }
                        if (db.objectStoreNames.contains(AppConfig.STORES.SETTINGS)) {
                            db.deleteObjectStore(AppConfig.STORES.SETTINGS);
                        }
                        if (db.objectStoreNames.contains(AppConfig.STORES.BACKUPS)) {
                            db.deleteObjectStore(AppConfig.STORES.BACKUPS);
                        }
                    }
                    
                    if (!db.objectStoreNames.contains(AppConfig.STORES.CUSTOMERS)) {
                        const customerStore = db.createObjectStore(AppConfig.STORES.CUSTOMERS, { 
                            keyPath: 'id',
                            autoIncrement: false 
                        });
                        customerStore.createIndex('name', 'name', { unique: false });
                        customerStore.createIndex('phone', 'phone', { unique: false });
                        customerStore.createIndex('createdAt', 'createdAt', { unique: false });
                        customerStore.createIndex('deleted', 'deleted', { unique: false });
                        customerStore.createIndex('yakhun', 'models.yakhun', { unique: false });
                        customerStore.createIndex('deliveryDay', 'deliveryDay', { unique: false });
                    }
                    
                    if (!db.objectStoreNames.contains(AppConfig.STORES.SETTINGS)) {
                        db.createObjectStore(AppConfig.STORES.SETTINGS, { 
                            keyPath: 'key'
                        });
                    }
                    
                    if (!db.objectStoreNames.contains(AppConfig.STORES.BACKUPS)) {
                        db.createObjectStore(AppConfig.STORES.BACKUPS, { 
                            keyPath: 'id',
                            autoIncrement: true 
                        });
                    }
                    
                    console.log("دیتابیس آپگرید شد");
                };
                
                request.onblocked = () => {
                    showNotification("دیتابیس توسط تب دیگری قفل شده است", "warning");
                    reject(new Error("دیتابیس قفل شده است"));
                };
                
            } catch (error) {
                console.error("خطا در راه‌اندازی دیتابیس:", error);
                reject(error);
                updateDBStatus(false);
            }
        });
    }

    async getCustomer(id) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error("دیتابیس راه‌اندازی نشده است"));
                return;
            }
            
            try {
                const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
                this.pendingTransactions.add(transaction);
                
                transaction.oncomplete = () => this.pendingTransactions.delete(transaction);
                transaction.onerror = () => this.pendingTransactions.delete(transaction);
                
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
            } catch (error) {
                reject(error);
            }
        });
    }

    async saveCustomer(customer) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error("دیتابیس راه‌اندازی نشده است"));
                return;
            }
            
            if (!customer || !customer.id) {
                reject(new Error("مشتری نامعتبر"));
                return;
            }
            
            try {
                const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
                this.pendingTransactions.add(transaction);
                
                transaction.oncomplete = () => {
                    this.pendingTransactions.delete(transaction);
                    resolve(customer);
                };
                
                transaction.onerror = (event) => {
                    this.pendingTransactions.delete(transaction);
                    reject(event.target.error);
                };
                
                const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
                
                // به‌روزرسانی timestamp
                customer.updatedAt = new Date().toISOString();
                customer.version = (customer.version || 0) + 1;
                
                // اطمینان از ساختار داده‌ها
                if (!customer.measurements) {
                    customer.measurements = {};
                }
                if (!customer.models) {
                    customer.models = {
                        yakhun: "",
                        sleeve: "",
                        skirt: [],
                        features: []
                    };
                }
                
                const request = store.put(customer);
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    async getAllCustomers(includeDeleted = false) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error("دیتابیس راه‌اندازی نشده است"));
                return;
            }
            
            try {
                const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
                this.pendingTransactions.add(transaction);
                
                transaction.oncomplete = () => this.pendingTransactions.delete(transaction);
                transaction.onerror = () => this.pendingTransactions.delete(transaction);
                
                const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
                const index = store.index('createdAt');
                const request = index.getAll();
                
                request.onsuccess = () => {
                    let customers = request.result || [];
                    
                    if (!includeDeleted) {
                        customers = customers.filter(c => !c.deleted);
                    }
                    
                    // تبدیل به کلاس Customer
                    const customerObjects = customers.map(c => {
                        try {
                            return Customer.fromObject(c);
                        } catch (error) {
                            console.warn("خطا در تبدیل مشتری:", error, c);
                            return null;
                        }
                    }).filter(c => c !== null);
                    
                    resolve(customerObjects);
                };
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    async searchCustomers(query, field = 'name') {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error("دیتابیس راه‌اندازی نشده است"));
                return;
            }
            
            if (!query || query.trim() === '') {
                resolve([]);
                return;
            }
            
            try {
                const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
                this.pendingTransactions.add(transaction);
                
                transaction.oncomplete = () => this.pendingTransactions.delete(transaction);
                transaction.onerror = () => this.pendingTransactions.delete(transaction);
                
                const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
                const request = store.getAll();
                
                request.onsuccess = () => {
                    const allCustomers = request.result || [];
                    const searchTerm = query.toLowerCase().trim();
                    
                    const results = allCustomers.filter(customer => {
                        if (customer.deleted) return false;
                        
                        // جستجو در فیلدهای مختلف
                        const searchFields = ['name', 'phone', 'notes', 'id'];
                        return searchFields.some(field => {
                            const value = customer[field];
                            return value && value.toString().toLowerCase().includes(searchTerm);
                        });
                    }).map(c => Customer.fromObject(c));
                    
                    resolve(results);
                };
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    async deleteCustomer(id) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error("دیتابیس راه‌اندازی نشده است"));
                return;
            }
            
            try {
                const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
                this.pendingTransactions.add(transaction);
                
                transaction.oncomplete = () => {
                    this.pendingTransactions.delete(transaction);
                    resolve(true);
                };
                
                transaction.onerror = (event) => {
                    this.pendingTransactions.delete(transaction);
                    reject(event.target.error);
                };
                
                const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
                const getRequest = store.get(id);
                
                getRequest.onsuccess = () => {
                    const customer = getRequest.result;
                    if (customer) {
                        customer.deleted = true;
                        customer.updatedAt = new Date().toISOString();
                        
                        const putRequest = store.put(customer);
                        putRequest.onerror = (event) => {
                            reject(event.target.error);
                        };
                    } else {
                        reject(new Error("مشتری یافت نشد"));
                    }
                };
                
                getRequest.onerror = (event) => {
                    reject(event.target.error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    async getSettings(key) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error("دیتابیس راه‌اندازی نشده است"));
                return;
            }
            
            try {
                const transaction = this.db.transaction([AppConfig.STORES.SETTINGS], 'readonly');
                this.pendingTransactions.add(transaction);
                
                transaction.oncomplete = () => this.pendingTransactions.delete(transaction);
                transaction.onerror = () => this.pendingTransactions.delete(transaction);
                
                const store = transaction.objectStore(AppConfig.STORES.SETTINGS);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    resolve(request.result ? request.result.value : null);
                };
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    async saveSettings(key, value) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error("دیتابیس راه‌اندازی نشده است"));
                return;
            }
            
            try {
                const transaction = this.db.transaction([AppConfig.STORES.SETTINGS], 'readwrite');
                this.pendingTransactions.add(transaction);
                
                transaction.oncomplete = () => {
                    this.pendingTransactions.delete(transaction);
                    resolve();
                };
                
                transaction.onerror = (event) => {
                    this.pendingTransactions.delete(transaction);
                    reject(event.target.error);
                };
                
                const store = transaction.objectStore(AppConfig.STORES.SETTINGS);
                const request = store.put({ 
                    key, 
                    value, 
                    updatedAt: new Date().toISOString() 
                });
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    async clearAllData() {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error("دیتابیس راه‌اندازی نشده است"));
                return;
            }
            
            try {
                const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
                this.pendingTransactions.add(transaction);
                
                transaction.oncomplete = () => {
                    this.pendingTransactions.delete(transaction);
                    resolve();
                };
                
                transaction.onerror = (event) => {
                    this.pendingTransactions.delete(transaction);
                    reject(event.target.error);
                };
                
                const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
                const request = store.clear();
                
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    async close() {
        // منتظر تمام تراکنش‌های در حال اجرا بمان
        await Promise.all(Array.from(this.pendingTransactions).map(t => 
            new Promise(resolve => {
                t.oncomplete = t.onerror = () => resolve();
            })
        ));
        
        if (this.db) {
            this.db.close();
            this.isInitialized = false;
            this.db = null;
            updateDBStatus(false);
        }
    }
}

// ========== CREATE DATABASE MANAGER INSTANCE ==========
dbManager = new DatabaseManager();

// ========== HELPER FUNCTIONS ==========
function showNotification(message, type = "info", duration = 3000) {
    const notification = document.getElementById("notification");
    if (!notification) {
        // ایجاد عنصر نوتیفیکیشن اگر وجود ندارد
        const notificationDiv = document.createElement('div');
        notificationDiv.id = 'notification';
        notificationDiv.className = 'notification';
        notificationDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            z-index: 10000;
            display: none;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: Tahoma, Arial, sans-serif;
        `;
        document.body.appendChild(notificationDiv);
    }
    
    const notificationEl = document.getElementById("notification");
    notificationEl.textContent = message;
    
    // رنگ‌های نوتیفیکیشن
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    
    notificationEl.style.backgroundColor = colors[type] || colors.info;
    notificationEl.style.display = 'block';
    notificationEl.style.opacity = '1';
    
    clearTimeout(notificationEl.timeoutId);
    notificationEl.timeoutId = setTimeout(() => {
        notificationEl.style.opacity = '0';
        setTimeout(() => {
            notificationEl.style.display = 'none';
        }, 300);
    }, duration);
}

function updateDBStatus(connected) {
    const statusEl = document.getElementById("dbStatus");
    if (!statusEl) return;
    
    if (connected) {
        statusEl.className = "db-status connected";
        statusEl.innerHTML = `<i class="fas fa-database"></i> <span>متصل</span>`;
    } else {
        statusEl.className = "db-status disconnected";
        statusEl.innerHTML = `<i class="fas fa-database"></i> <span>قطع ارتباط</span>`;
    }
}

function showLoading(message = "در حال راه‌اندازی...") {
    let overlay = document.getElementById("loadingOverlay");
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            color: white;
            font-family: Tahoma, Arial, sans-serif;
        `;
        
        const spinner = document.createElement('div');
        spinner.style.cssText = `
            border: 5px solid #f3f3f3;
            border-top: 5px solid #3498db;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        `;
        
        const text = document.createElement('div');
        text.id = 'loadingText';
        text.style.fontSize = '18px';
        text.textContent = message;
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        
        document.head.appendChild(style);
        overlay.appendChild(spinner);
        overlay.appendChild(text);
        document.body.appendChild(overlay);
    } else {
        overlay.style.display = 'flex';
        const text = document.getElementById("loadingText");
        if (text) text.textContent = message;
    }
}

function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.style.display = "none";
    }
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

const debouncedSave = debounce(async () => {
    if (currentIndex !== null && currentIndex < customers.length && customers[currentIndex]) {
        try {
            await dbManager.saveCustomer(customers[currentIndex]);
            console.log("ذخیره خودکار انجام شد");
        } catch (error) {
            console.error("خطا در ذخیره خودکار:", error);
        }
    }
}, 2000);

// ========== CUSTOMER MANAGEMENT ==========
async function addCustomer() {
    const name = prompt("نام مشتری:");
    if (!name || name.trim() === "") {
        showNotification("لطفاً نام معتبر وارد کنید", "warning");
        return;
    }
    
    const phone = prompt("شماره مشتری:");
    if (!phone || phone.trim() === "") {
        showNotification("لطفاً شماره معتبر وارد کنید", "warning");
        return;
    }
    
    try {
        const newCustomer = new Customer(name.trim(), phone.trim());
        await dbManager.saveCustomer(newCustomer);
        
        showNotification(`مشتری "${name}" با موفقیت اضافه شد`, "success");
        await loadCustomersFromDB();
        renderCustomerList();
        updateStats();
        
        const index = customers.findIndex(c => c.id === newCustomer.id);
        if (index !== -1) {
            openProfile(index);
        }
    } catch (error) {
        console.error("خطا در اضافه کردن مشتری:", error);
        showNotification("خطا در اضافه کردن مشتری: " + error.message, "error");
    }
}

async function loadCustomersFromDB() {
    try {
        showLoading("در حال بارگذاری مشتریان...");
        customers = await dbManager.getAllCustomers();
        hideLoading();
        return customers;
    } catch (error) {
        console.error("خطا در بارگذاری مشتریان:", error);
        showNotification("خطا در بارگذاری مشتریان: " + error.message, "error");
        hideLoading();
        return [];
    }
}

async function saveCustomerToDB() {
    if (currentIndex === null || currentIndex >= customers.length || !customers[currentIndex]) {
        showNotification("مشتری انتخاب نشده است", "warning");
        return;
    }
    
    try {
        const customer = customers[currentIndex];
        await dbManager.saveCustomer(customer);
        showNotification("ذخیره شد", "success");
        updateStats();
    } catch (error) {
        console.error("خطا در ذخیره مشتری:", error);
        showNotification("خطا در ذخیره اطلاعات: " + error.message, "error");
    }
}

async function deleteCustomer(index) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    
    const customer = customers[index];
    const customerName = customer.name || 'بدون نام';
    
    if (!confirm(`آیا از حذف مشتری "${customerName}" مطمئن هستید؟ این مشتری به سطل زباله منتقل می‌شود.`)) return;
    
    try {
        await dbManager.deleteCustomer(customer.id);
        showNotification(`مشتری "${customerName}" به سطل زباله منتقل شد`, "success");
        await loadCustomersFromDB();
        backHome();
    } catch (error) {
        console.error("خطا در حذف مشتری:", error);
        showNotification("خطا در حذف مشتری: " + error.message, "error");
    }
}

async function searchCustomer() {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) return;
    
    const term = searchInput.value.trim();
    if (!term) {
        await loadCustomersFromDB();
        renderCustomerList();
        return;
    }
    
    try {
        const results = await dbManager.searchCustomers(term);
        renderSearchResults(results, term);
    } catch (error) {
        console.error("خطا در جستجو:", error);
        showNotification("خطا در جستجو: " + error.message, "error");
    }
}

function renderSearchResults(results, term) {
    const list = document.getElementById("customerList");
    if (!list) return;
    
    if (!results || results.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>مشتری یافت نشد</h3>
                <p>هیچ مشتری با مشخصات "${term}" پیدا نشد</p>
            </div>
        `;
        return;
    }
    
    list.innerHTML = "";
    results.forEach((customer, i) => {
        if (!customer) return;
        
        const div = document.createElement("div");
        div.className = "customer-item";
        div.innerHTML = `
            <div>
                <span class="customer-number">${customer.id ? customer.id.substring(0, 4) : '----'}</span>
                <strong>${customer.name || 'بدون نام'}</strong> - ${customer.phone || 'بدون شماره'}
                ${customer.notes ? '<br><small style="color:var(--royal-silver);">' + 
                  (customer.notes.length > 50 ? customer.notes.substring(0, 50) + '...' : customer.notes) + '</small>' : ''}
            </div>
            <button onclick="openProfileFromSearch('${customer.id}')">
                <i class="fas fa-user-circle"></i> مشاهده پروفایل
            </button>
        `;
        list.appendChild(div);
    });
    
    showNotification(`${results.length} مشتری یافت شد`, "success");
}

async function openProfileFromSearch(customerId) {
    try {
        const customer = await dbManager.getCustomer(customerId);
        if (!customer) {
            showNotification("مشتری یافت نشد", "error");
            return;
        }
        
        const index = customers.findIndex(c => c && c.id === customerId);
        if (index !== -1) {
            customers[index] = customer;
            currentIndex = index;
        } else {
            customers.push(customer);
            currentIndex = customers.length - 1;
        }
        
        openProfile(currentIndex);
    } catch (error) {
        console.error("خطا در باز کردن پروفایل:", error);
        showNotification("خطا در باز کردن پروفایل: " + error.message, "error");
    }
}

// ========== PROFILE MANAGEMENT ==========
function openProfile(index) {
    if (index < 0 || index >= customers.length || !customers[index]) {
        showNotification("مشتری یافت نشد!", "error");
        return;
    }
    
    currentIndex = index;
    const cust = customers[index];
    
    // به‌روزرسانی عناصر DOM
    const profileName = document.getElementById("profileName");
    const profilePhone = document.getElementById("profilePhone");
    const customerNotes = document.getElementById("customerNotes");
    const homePage = document.getElementById("homePage");
    const profilePage = document.getElementById("profilePage");
    
    if (profileName) profileName.textContent = `${cust.name || 'بدون نام'}`;
    if (profilePhone) profilePhone.textContent = cust.phone || 'بدون شماره';
    if (customerNotes) customerNotes.value = cust.notes || "";
    
    renderMeasurements(index);
    renderModels(index);
    updateSelectedModelTexts(index);
    renderOrdersHistory(index);
    renderPriceAndDeliverySection(index);
    
    if (homePage) homePage.style.display = "none";
    if (profilePage) profilePage.style.display = "block";
    
    currentFieldIndex = 0;
    
    setTimeout(() => {
        const firstInput = document.querySelector('.field-input[contenteditable="true"]');
        if (firstInput) {
            firstInput.focus();
        }
    }, 100);
}

function backHome() {
    const homePage = document.getElementById("homePage");
    const profilePage = document.getElementById("profilePage");
    
    if (homePage) homePage.style.display = "block";
    if (profilePage) profilePage.style.display = "none";
    
    currentIndex = null;
    renderCustomerList();
    updateStats();
}

function updateNotes(val) {
    if (currentIndex === null || currentIndex >= customers.length || !customers[currentIndex]) return;
    customers[currentIndex].notes = val;
    debouncedSave();
}

// ========== MEASUREMENTS TABLE ==========
function renderMeasurements(index) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    
    const customer = customers[index];
    const container = document.getElementById("measurementsTable");
    if (!container) return;
    
    if (!customer.measurements) {
        customer.measurements = {};
    }
    
    container.innerHTML = `
        <h4><i class="fas fa-ruler-combined"></i> اندازه‌گیری‌ها:</h4>
        <div class="measurements-table-container">
            <table class="fixed-measurements-table">
                <thead>
                    <tr>
                        <th>اندازه</th>
                        <th>مقدار</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- قد -->
                    <tr>
                        <td class="measurement-label">قد</td>
                        <td>
                            <input type="number" 
                                   class="measurement-input" 
                                   data-field="قد"
                                   value="${customer.measurements.قد || ''}"
                                   oninput="updateMeasurement('قد', this.value)"
                                   step="0.5"
                                   min="0"
                                   placeholder="سانتی‌متر">
                        </td>
                    </tr>
                    
                    <!-- شانه -->
                    <tr>
                        <td class="measurement-label">شانه</td>
                        <td>
                            <div class="horizontal-inputs">
                                <input type="number" 
                                       class="measurement-input small"
                                       data-field="شانه_یک"
                                       value="${customer.measurements.شانه_یک || ''}"
                                       oninput="updateMeasurement('شانه_یک', this.value)"
                                       step="0.5"
                                       min="0"
                                       placeholder="یک">
                                <input type="number" 
                                       class="measurement-input small"
                                       data-field="شانه_دو"
                                       value="${customer.measurements.شانه_دو || ''}"
                                       oninput="updateMeasurement('شانه_دو', this.value)"
                                       step="0.5"
                                       min="0"
                                       placeholder="دو">
                            </div>
                        </td>
                    </tr>
                    
                    <!-- آستین -->
                    <tr>
                        <td class="measurement-label">آستین</td>
                        <td>
                            <div class="horizontal-inputs">
                                <input type="number" 
                                       class="measurement-input small"
                                       data-field="آستین_یک"
                                       value="${customer.measurements.آستین_یک || ''}"
                                       oninput="updateMeasurement('آستین_یک', this.value)"
                                       step="0.5"
                                       min="0"
                                       placeholder="یک">
                                <input type="number" 
                                       class="measurement-input small"
                                       data-field="آستین_دو"
                                       value="${customer.measurements.آستین_دو || ''}"
                                       oninput="updateMeasurement('آستین_دو', this.value)"
                                       step="0.5"
                                       min="0"
                                       placeholder="دو">
                                <input type="number" 
                                       class="measurement-input small"
                                       data-field="آستین_سه"
                                       value="${customer.measurements.آستین_سه || ''}"
                                       oninput="updateMeasurement('آستین_سه', this.value)"
                                       step="0.5"
                                       min="0"
                                       placeholder="سه">
                            </div>
                        </td>
                    </tr>
                    
                    <!-- سایر فیلدها -->
                    ${['بغل', 'دامن', 'گردن', 'دور_سینه', 'شلوار', 'دم_پاچه', 'چاک_پتی'].map(field => {
                        const label = getFieldLabel(field);
                        const value = customer.measurements[field] || '';
                        return `
                        <tr>
                            <td class="measurement-label">${label}</td>
                            <td>
                                <input type="number" 
                                       class="measurement-input"
                                       data-field="${field}"
                                       value="${value}"
                                       oninput="updateMeasurement('${field}', this.value)"
                                       step="0.5"
                                       min="0"
                                       placeholder="سانتی‌متر">
                            </td>
                        </tr>
                        `;
                    }).join('')}
                    
                    <!-- بر تهمان و خشتک -->
                    <tr>
                        <td class="measurement-label">خشتک</td>
                        <td>
                            <div class="horizontal-inputs">
                                <div class="labeled-input">
                                    <span class="input-label">ب</span>
                                    <input type="number" 
                                           class="measurement-input xsmall"
                                           data-field="بر_تمبان"
                                           value="${customer.measurements.بر_تمبان || ''}"
                                           oninput="updateMeasurement('بر_تمبان', this.value)"
                                           step="0.5"
                                           min="0">
                                </div>
                                <div class="labeled-input">
                                    <span class="input-label">خ</span>
                                    <input type="number" 
                                           class="measurement-input xsmall"
                                           data-field="خشتک"
                                           value="${customer.measurements.خشتک || ''}"
                                           oninput="updateMeasurement('خشتک', this.value)"
                                           step="0.5"
                                           min="0">
                                </div>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- سفارش -->
                    <tr>
                        <td class="measurement-label">سفارش</td>
                        <td>
                            <div class="horizontal-inputs">
                                <div class="labeled-input">
                                    <span class="input-label">تعداد</span>
                                    <input type="number" 
                                           class="measurement-input xsmall"
                                           data-field="تعداد_سفارش"
                                           value="${customer.measurements.تعداد_سفارش || ''}"
                                           oninput="updateMeasurement('تعداد_سفارش', this.value)"
                                           step="1"
                                           min="0">
                                </div>
                                <div class="labeled-input">
                                    <span class="input-label">تکه</span>
                                    <input type="number" 
                                           class="measurement-input xsmall"
                                           data-field="مقدار_تکه"
                                           value="${customer.measurements.مقدار_تکه || ''}"
                                           oninput="updateMeasurement('مقدار_تکه', this.value)"
                                           step="1"
                                           min="0">
                                </div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

function getFieldLabel(field) {
    const labels = {
        "قد": "قد",
        "شانه_یک": "شانه",
        "شانه_دو": "شانه",
        "آستین_یک": "آستین",
        "آستین_دو": "آستین",
        "آستین_سه": "آستین",
        "بغل": "بغل",
        "دامن": "دامن",
        "گردن": "گردن",
        "دور_سینه": "دور سینه",
        "شلوار": "شلوار",
        "دم_پاچه": "دم پاچه",
        "بر_تمبان": "بر تهمان",
        "خشتک": "خشتک",
        "چاک_پتی": "چاک پتی",
        "تعداد_سفارش": "تعداد سفارش",
        "مقدار_تکه": "مقدار تکه"
    };
    
    return labels[field] || field;
}

function updateMeasurement(field, val) {
    if (currentIndex === null || currentIndex >= customers.length || !customers[currentIndex]) return;
    
    if (!customers[currentIndex].measurements) {
        customers[currentIndex].measurements = {};
    }
    
    customers[currentIndex].measurements[field] = val;
    debouncedSave();
}

// ========== MODELS MANAGEMENT ==========
function toggleOptions(optionId) {
    const allOptions = document.querySelectorAll('.model-options');
    allOptions.forEach(option => {
        if (option.id !== optionId) {
            option.style.display = 'none';
        }
    });
    
    const options = document.getElementById(optionId);
    if (options) {
        options.style.display = options.style.display === "block" ? "none" : "block";
    }
}

function renderModels(index) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    
    const cust = customers[index];
    
    if (!cust.models) {
        cust.models = {
            yakhun: "",
            sleeve: "",
            skirt: [],
            features: []
        };
    }
    
    // رندر گزینه‌ها
    renderYakhunOptions(cust);
    renderSleeveOptions(cust);
    renderSkirtOptions(cust);
    renderFeaturesOptions(cust);
}

function renderYakhunOptions(cust) {
    const container = document.getElementById("yakhunOptions");
    if (!container) return;
    
    container.innerHTML = "";
    AppConfig.YAKHUN_MODELS.forEach(opt => {
        const div = document.createElement("div");
        div.className = "model-option" + (cust.models.yakhun === opt ? " selected" : "");
        div.textContent = opt;
        div.onclick = () => {
            cust.models.yakhun = opt;
            showNotification(`مدل یخن به "${opt}" تغییر کرد`, "success");
            debouncedSave();
            updateSelectedModelTexts(customers.indexOf(cust));
            container.style.display = "none";
        };
        container.appendChild(div);
    });
}

function renderSleeveOptions(cust) {
    const container = document.getElementById("sleeveOptions");
    if (!container) return;
    
    container.innerHTML = "";
    AppConfig.SLEEVE_MODELS.forEach(opt => {
        const div = document.createElement("div");
        div.className = "model-option" + (cust.models.sleeve === opt ? " selected" : "");
        div.textContent = opt;
        div.onclick = () => {
            cust.models.sleeve = opt;
            showNotification(`مدل آستین به "${opt}" تغییر کرد`, "success");
            debouncedSave();
            updateSelectedModelTexts(customers.indexOf(cust));
            container.style.display = "none";
        };
        container.appendChild(div);
    });
}

function renderSkirtOptions(cust) {
    const container = document.getElementById("skirtOptions");
    if (!container) return;
    
    container.innerHTML = "";
    AppConfig.SKIRT_MODELS.forEach(opt => {
        const isSelected = Array.isArray(cust.models.skirt) && cust.models.skirt.includes(opt);
        const div = document.createElement("div");
        div.className = `multi-select-option ${isSelected ? 'selected' : ''}`;
        div.innerHTML = `
            <span>${opt}</span>
            <div class="checkmark">${isSelected ? '✓' : ''}</div>
        `;
        div.onclick = () => {
            if (!Array.isArray(cust.models.skirt)) cust.models.skirt = [];
            
            if (isSelected) {
                const indexToRemove = cust.models.skirt.indexOf(opt);
                if (indexToRemove > -1) {
                    cust.models.skirt.splice(indexToRemove, 1);
                }
                showNotification(`مدل دامن "${opt}" حذف شد`, "info");
            } else {
                cust.models.skirt.push(opt);
                showNotification(`مدل دامن "${opt}" اضافه شد`, "success");
            }
            debouncedSave();
            updateSelectedModelTexts(customers.indexOf(cust));
            renderSkirtOptions(cust); // رندر مجدد
        };
        container.appendChild(div);
    });
}

function renderFeaturesOptions(cust) {
    const container = document.getElementById("featuresOptions");
    if (!container) return;
    
    container.innerHTML = "";
    AppConfig.FEATURES_LIST.forEach(opt => {
        const isSelected = Array.isArray(cust.models.features) && cust.models.features.includes(opt);
        const div = document.createElement("div");
        div.className = `multi-select-option ${isSelected ? 'selected' : ''}`;
        div.innerHTML = `
            <span>${opt}</span>
            <div class="checkmark">${isSelected ? '✓' : ''}</div>
        `;
        div.onclick = () => {
            if (!Array.isArray(cust.models.features)) cust.models.features = [];
            
            if (isSelected) {
                const indexToRemove = cust.models.features.indexOf(opt);
                if (indexToRemove > -1) {
                    cust.models.features.splice(indexToRemove, 1);
                }
                showNotification(`ویژگی "${opt}" حذف شد`, "info");
            } else {
                cust.models.features.push(opt);
                showNotification(`ویژگی "${opt}" اضافه شد`, "success");
            }
            debouncedSave();
            updateSelectedModelTexts(customers.indexOf(cust));
            renderFeaturesOptions(cust); // رندر مجدد
        };
        container.appendChild(div);
    });
}

function updateSelectedModelTexts(index) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    
    const cust = customers[index];
    
    if (!cust.models) {
        cust.models = {
            yakhun: "",
            sleeve: "",
            skirt: [],
            features: []
        };
    }
    
    const yakhunText = document.getElementById("yakhunSelectedText");
    const sleeveText = document.getElementById("sleeveSelectedText");
    const skirtText = document.getElementById("skirtSelectedText");
    const featuresText = document.getElementById("featuresSelectedText");
    
    if (yakhunText) {
        yakhunText.textContent = 
            cust.models.yakhun ? `مدل یخن: ${cust.models.yakhun}` : "مدل یخن: انتخاب نشده";
    }
    
    if (sleeveText) {
        sleeveText.textContent = 
            cust.models.sleeve ? `مدل آستین: ${cust.models.sleeve}` : "مدل آستین: انتخاب نشده";
    }
    
    if (skirtText) {
        skirtText.textContent = 
            Array.isArray(cust.models.skirt) && cust.models.skirt.length > 0 
                ? `مدل دامن: ${cust.models.skirt.join(", ")}` 
                : "مدل دامن: انتخاب نشده";
    }
    
    if (featuresText) {
        featuresText.textContent = 
            Array.isArray(cust.models.features) && cust.models.features.length > 0 
                ? `ویژگی‌ها: ${cust.models.features.join(", ")}` 
                : "ویژگی‌ها: انتخاب نشده";
    }
}

// ========== PRICE & DELIVERY MANAGEMENT ==========
function renderPriceAndDeliverySection(index) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    
    const customer = customers[index];
    const container = document.getElementById("priceDeliverySection");
    
    if (!container) return;
    
    const price = customer.sewingPriceAfghani || '';
    const isPaid = customer.paymentReceived || false;
    const paymentDate = customer.paymentDate;
    const deliveryDay = customer.deliveryDay || '';
    
    container.innerHTML = `
        <h4><i class="fas fa-money-bill-wave"></i> قیمت و تاریخ تحویل (افغانی)</h4>
        
        <!-- قیمت دوخت به افغانی -->
        <div class="price-input-group">
            <label class="price-label">
                <i class="fas fa-money-bill"></i>
                قیمت دوخت (افغانی):
            </label>
            <div class="price-input-wrapper">
                <input type="number" 
                       id="sewingPriceAfghani" 
                       placeholder="مبلغ به افغانی"
                       value="${price}"
                       oninput="updateAfghaniPrice(${index}, this.value)"
                       class="price-input">
                <span class="price-unit">افغانی</span>
            </div>
        </div>
        
        <!-- تیک رسید (پرداخت شده) -->
        <div class="payment-status-section">
            <div class="payment-toggle">
                <div class="payment-checkbox ${isPaid ? 'checked' : ''}" 
                     onclick="togglePaymentReceived(${index})">
                    <div class="checkbox-display ${isPaid ? 'checked' : ''}"></div>
                    <span style="font-weight: bold; color: ${isPaid ? 'var(--success)' : 'var(--royal-silver)'}">
                        ${isPaid ? 'پول رسید شد' : 'پول نرسید'}
                    </span>
                </div>
            </div>
            
            ${isPaid && paymentDate ? `
            <div style="margin-top: 10px; padding: 8px; background: rgba(40,167,69,0.15); border-radius: 6px; text-align: center; font-size: 13px;">
                <i class="fas fa-calendar-check" style="color: var(--success); margin-left: 5px;"></i>
                تاریخ رسید: ${new Date(paymentDate).toLocaleDateString('fa-IR')}
            </div>
            ` : ''}
        </div>
        
        <!-- تاریخ تحویل (شنبه تا جمعه) -->
        <div class="delivery-days">
            <label class="price-label">
                <i class="fas fa-calendar-check"></i>
                روز تحویل:
            </label>
            <div class="delivery-grid">
                ${['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'].map(day => {
                    const isSelected = deliveryDay === day;
                    return `
                        <div class="day-button ${isSelected ? 'selected' : ''}" 
                             onclick="setDeliveryDay(${index}, '${day}')">
                            ${day}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function updateAfghaniPrice(index, price) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    const cleanPrice = price ? parseInt(price) : null;
    customers[index].sewingPriceAfghani = cleanPrice;
    debouncedSave();
}

function togglePaymentReceived(index) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    customers[index].paymentReceived = !customers[index].paymentReceived;
    if (customers[index].paymentReceived) {
        customers[index].paymentDate = new Date().toISOString();
    } else {
        customers[index].paymentDate = null;
    }
    renderPriceAndDeliverySection(index);
    debouncedSave();
    showNotification(`وضعیت پرداخت تغییر کرد`, "success");
}

function setDeliveryDay(index, day) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    customers[index].deliveryDay = day;
    renderPriceAndDeliverySection(index);
    debouncedSave();
    showNotification(`روز تحویل به ${day} تنظیم شد`, "success");
}

// ========== ORDER MANAGEMENT ==========
function addOrder(index) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    
    const orderDetails = prompt("جزئیات سفارش جدید:");
    if (!orderDetails || orderDetails.trim() === "") {
        showNotification("لطفاً جزئیات سفارش را وارد کنید", "warning");
        return;
    }
    
    const newOrder = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        details: orderDetails.trim(),
        status: "pending"
    };
    
    if (!Array.isArray(customers[index].orders)) {
        customers[index].orders = [];
    }
    
    customers[index].orders.push(newOrder);
    customers[index].updatedAt = new Date().toISOString();
    
    renderOrdersHistory(index);
    debouncedSave();
    showNotification("سفارش جدید اضافه شد", "success");
}

function renderOrdersHistory(index) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    
    const customer = customers[index];
    const container = document.getElementById("ordersHistory");
    
    if (!container) return;
    
    if (!Array.isArray(customer.orders) || customer.orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clipboard-list"></i>
                <h4>هیچ سفارشی ثبت نشده است</h4>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    customer.orders.forEach((order, i) => {
        const div = document.createElement('div');
        div.className = 'order-item';
        div.innerHTML = `
            <div class="order-header">
                <span>سفارش #${i + 1}</span>
                <span>${new Date(order.date).toLocaleDateString('fa-IR')}</span>
            </div>
            <div class="order-details">
                ${order.details || 'بدون توضیحات'}
            </div>
        `;
        container.appendChild(div);
    });
}

// ========== CUSTOMER LIST RENDERING ==========
function renderCustomerList() {
    const list = document.getElementById("customerList");
    if (!list) return;
    
    if (!Array.isArray(customers) || customers.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <h3>هنوز مشتری ثبت نشده است</h3>
                <p>برای شروع، روی دکمه "مشتری جدید" کلیک کنید</p>
            </div>
        `;
        return;
    }
    
    list.innerHTML = "";
    customers.forEach((customer, i) => {
        if (!customer) return;
        
        const div = document.createElement("div");
        div.className = "customer-item";
        div.innerHTML = `
            <div>
                <span class="customer-number">${customer.id ? customer.id.substring(0, 4) : '----'}</span>
                <strong>${customer.name || 'بدون نام'}</strong> - ${customer.phone || 'بدون شماره'}
                ${customer.notes ? '<br><small style="color:var(--royal-silver);">' + 
                  (customer.notes.length > 50 ? customer.notes.substring(0, 50) + '...' : customer.notes) + '</small>' : ''}
            </div>
            <button onclick="openProfile(${i})">
                <i class="fas fa-user-circle"></i> مشاهده پروفایل
            </button>
        `;
        list.appendChild(div);
    });
}

// ========== STATISTICS ==========
async function updateStats() {
    try {
        const totalCustomers = Array.isArray(customers) ? customers.length : 0;
        const activeOrders = customers.reduce((total, customer) => {
            return total + (Array.isArray(customer.orders) ? customer.orders.length : 0);
        }, 0);
        
        document.getElementById("totalCustomers").textContent = totalCustomers;
        document.getElementById("activeOrders").textContent = activeOrders;
        
        // اندازه دیتابیس
        if (dbManager && dbManager.db) {
            const allCustomers = await dbManager.getAllCustomers();
            const dataStr = JSON.stringify(allCustomers);
            const sizeInBytes = new Blob([dataStr]).size;
            const sizeText = formatBytes(sizeInBytes);
            document.getElementById("dbSize").textContent = sizeText;
        }
    } catch (error) {
        console.error("خطا در به‌روزرسانی آمار:", error);
    }
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ========== SETTINGS FUNCTIONS ==========
async function saveDataToFile() {
    try {
        const allCustomers = await dbManager.getAllCustomers(true);
        const dataStr = JSON.stringify(allCustomers, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `alfajr-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showNotification("داده‌ها با موفقیت ذخیره شد", "success");
    } catch (error) {
        console.error("خطا در ذخیره فایل:", error);
        showNotification("خطا در ذخیره فایل: " + error.message, "error");
    }
}

function loadDataFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            showLoading("در حال بارگذاری داده‌ها...");
            const customersData = JSON.parse(e.target.result);
            
            if (!Array.isArray(customersData)) {
                throw new Error("فرمت فایل نامعتبر است");
            }
            
            let importedCount = 0;
            let errorCount = 0;
            
            for (const customerData of customersData) {
                if (customerData.deleted) continue;
                
                try {
                    const customer = Customer.fromObject(customerData);
                    await dbManager.saveCustomer(customer);
                    importedCount++;
                } catch (err) {
                    console.error("خطا در وارد کردن مشتری:", err, customerData);
                    errorCount++;
                }
            }
            
            hideLoading();
            
            if (errorCount > 0) {
                showNotification(`${importedCount} مشتری وارد شد، ${errorCount} خطا رخ داد`, "warning");
            } else {
                showNotification(`${importedCount} مشتری با موفقیت وارد شد`, "success");
            }
            
            await loadCustomersFromDB();
            renderCustomerList();
            updateStats();
            
            event.target.value = '';
            
        } catch (error) {
            hideLoading();
            console.error("خطا در بارگذاری فایل:", error);
            showNotification("خطا در بارگذاری فایل: " + error.message, "error");
        }
    };
    
    reader.onerror = function() {
        hideLoading();
        showNotification("خطا در خواندن فایل", "error");
    };
    
    reader.readAsText(file);
}

function toggleDarkMode() {
    document.body.classList.remove('light-mode', 'vivid-mode');
    document.body.classList.add('dark-mode');
    isDarkMode = true;
    isVividMode = false;
    dbManager.saveSettings('theme', 'dark').catch(console.error);
    showNotification("حالت تاریک فعال شد", "success");
}

function toggleLightMode() {
    document.body.classList.remove('dark-mode', 'vivid-mode');
    document.body.classList.add('light-mode');
    isDarkMode = false;
    isVividMode = false;
    dbManager.saveSettings('theme', 'light').catch(console.error);
    showNotification("حالت روشن فعال شد", "success");
}

function toggleVividMode() {
    document.body.classList.remove('dark-mode', 'light-mode');
    document.body.classList.add('vivid-mode');
    isDarkMode = false;
    isVividMode = true;
    dbManager.saveSettings('theme', 'vivid').catch(console.error);
    showNotification("حالت ویوید فعال شد", "success");
}

async function clearAllData() {
    if (!confirm("⚠️ هشدار! آیا از پاک‌سازی تمام داده‌ها مطمئن هستید؟\nاین عمل قابل بازگشت نیست.")) {
        return;
    }
    
    if (!confirm("❌ هشدار نهایی! تمام مشتریان، سفارشات و تنظیمات پاک خواهند شد.\nادامه می‌دهید؟")) {
        return;
    }
    
    try {
        showLoading("در حال پاک‌سازی داده‌ها...");
        
        await dbManager.clearAllData();
        
        customers = [];
        currentIndex = null;
        
        await loadCustomersFromDB();
        renderCustomerList();
        updateStats();
        
        hideLoading();
        showNotification("تمامی داده‌ها با موفقیت پاک شدند", "success");
        
        const profilePage = document.getElementById("profilePage");
        if (profilePage && profilePage.style.display === "block") {
            backHome();
        }
        
    } catch (error) {
        hideLoading();
        console.error("خطا در پاک‌سازی داده‌ها:", error);
        showNotification("خطا در پاک‌سازی داده‌ها: " + error.message, "error");
    }
}

// ========== THERMAL PRINT FUNCTIONS ==========
function printThermalLabel() {
    if (currentIndex === null || currentIndex >= customers.length || !customers[currentIndex]) {
        showNotification("لطفاً ابتدا یک مشتری انتخاب کنید", "warning");
        return;
    }

    const customer = customers[currentIndex];
    
    // تاریخ شمسی
    const today = new Date();
    const persianDate = new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
    }).format(today);
    
    // باز کردن پنجره چاپ
    const printWindow = window.open('', '_blank', 'width=600,height=800');
    const printContent = createLabelContent(customer, persianDate);
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    
    showNotification("لیبل اندازه‌گیری برای چاپ آماده است", "success");
}

function createLabelContent(customer, persianDate) {
    // محتویات HTML برای لیبل
    // (محتویات کامل از کد قبلی)
    return `...`; // محتویات کامل HTML
}

// ========== INITIALIZATION ==========
async function initializeApp() {
    try {
        showLoading("در حال راه‌اندازی اپلیکیشن ALFAJR...");
        
        // بررسی پشتیبانی مرورگر از IndexedDB
        if (!window.indexedDB) {
            throw new Error("مرورگر شما از IndexedDB پشتیبانی نمی‌کند. لطفاً از مرورگر جدیدتری استفاده کنید.");
        }
        
        // Initialize database
        await dbManager.init();
        
        // Load customers
        await loadCustomersFromDB();
        
        // Load saved theme
        try {
            const savedTheme = await dbManager.getSettings('theme');
            if (savedTheme === 'light') {
                toggleLightMode();
            } else if (savedTheme === 'vivid') {
                toggleVividMode();
            } else {
                toggleDarkMode();
            }
        } catch (themeError) {
            console.warn("خطا در بارگذاری تم:", themeError);
            toggleDarkMode(); // حالت پیش‌فرض
        }
        
        // Render initial UI
        renderCustomerList();
        await updateStats();
        
        // Setup event listeners
        setupEventListeners();
        
        hideLoading();
        showNotification("اپلیکیشن ALFAJR آماده است", "success");
        
    } catch (error) {
        hideLoading();
        console.error("خطا در راه‌اندازی اپلیکیشن:", error);
        
        const errorMessage = error.message || "خطای نامشخص";
        showNotification("خطا در راه‌اندازی: " + errorMessage, "error");
        
        const customerList = document.getElementById("customerList");
        if (customerList) {
            customerList.innerHTML = `
                <div class="empty-state error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>خطا در راه‌اندازی</h3>
                    <p>${errorMessage}</p>
                    <button onclick="location.reload()" style="margin-top: 10px; padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 5px; cursor: pointer;">
                        <i class="fas fa-redo"></i> رفرش صفحه
                    </button>
                </div>
            `;
        }
    }
}

function setupEventListeners() {
    // جستجو
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("keypress", function(e) {
            if (e.key === "Enter") {
                searchCustomer();
            }
        });
    }
    
    // فایل
    const fileInput = document.getElementById("fileInput");
    if (fileInput) {
        fileInput.addEventListener("change", loadDataFromFile);
    }
    
    // یادداشت مشتری
    const customerNotes = document.getElementById("customerNotes");
    if (customerNotes) {
        customerNotes.addEventListener("input", function() {
            updateNotes(this.value);
        });
    }
    
    // کلیدهای میانبر
    document.addEventListener('keydown', function(e) {
        // Ctrl+S برای ذخیره
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveCustomerToDB();
        }
        
        // Escape برای بازگشت
        if (e.key === 'Escape') {
            const profilePage = document.getElementById("profilePage");
            if (profilePage && profilePage.style.display === "block") {
                backHome();
            }
        }
        
        // Ctrl+F برای جستجو
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById("searchInput");
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    });
    
    // هندلر بستن صفحه
    window.addEventListener('beforeunload', function(e) {
        if (currentIndex !== null && customers[currentIndex]) {
            try {
                dbManager.saveCustomer(customers[currentIndex]).catch(console.error);
            } catch (err) {
                console.error("خطا در ذخیره نهایی:", err);
            }
        }
    });
}

// ========== START APPLICATION ==========
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Export functions to global scope
window.addCustomer = addCustomer;
window.searchCustomer = searchCustomer;
window.openProfile = openProfile;
window.openProfileFromSearch = openProfileFromSearch;
window.backHome = backHome;
window.saveCustomerToDB = saveCustomerToDB;
window.deleteCustomer = deleteCustomer;
window.updateNotes = updateNotes;
window.updateMeasurement = updateMeasurement;
window.toggleOptions = toggleOptions;
window.updateAfghaniPrice = updateAfghaniPrice;
window.togglePaymentReceived = togglePaymentReceived;
window.setDeliveryDay = setDeliveryDay;
window.addOrder = addOrder;
window.saveDataToFile = saveDataToFile;
window.toggleDarkMode = toggleDarkMode;
window.toggleLightMode = toggleLightMode;
window.toggleVividMode = toggleVividMode;
window.clearAllData = clearAllData;
window.printThermalLabel = printThermalLabel;
console.log("App checking...");
if (dbManager) console.log("Database Manager is ready");
if (typeof initializeApp === 'function') console.log("Init function exists");
