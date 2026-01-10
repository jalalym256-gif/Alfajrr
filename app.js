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
let dbManager = null;

// ========== CUSTOMER CLASS ==========
class Customer {
    constructor(name, phone) {
        this.id = this.generateRandomFourDigitId();
        this.name = name || '';
        this.phone = phone || '';
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
        if (!obj) {
            return new Customer('', '');
        }
        
        const customer = new Customer(obj.name, obj.phone);
        
        // کپی تمام ویژگی‌ها
        Object.keys(obj).forEach(key => {
            if (key !== 'id' && key !== 'name' && key !== 'phone') {
                customer[key] = obj[key];
            }
        });
        
        // اطمینان از ساختار صحیح
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
    }

    async init() {
        return new Promise((resolve, reject) => {
            if (this.isInitialized && this.db) {
                resolve(this.db);
                return;
            }

            try {
                const request = indexedDB.open(AppConfig.DATABASE_NAME, AppConfig.DATABASE_VERSION);
                
                request.onerror = (event) => {
                    console.error("خطا در باز کردن دیتابیس:", event.target.error);
                    reject(event.target.error);
                    updateDBStatus(false);
                };
                
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    this.isInitialized = true;
                    
                    this.db.onerror = (event) => {
                        console.error("خطای دیتابیس:", event.target.error);
                        showNotification("خطا در عملیات دیتابیس", "error");
                    };
                    
                    updateDBStatus(true);
                    resolve(this.db);
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    // حذف استورهای قدیمی اگر نیاز باشد
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
                };
                
            } catch (error) {
                console.error("خطا در راه‌اندازی دیتابیس:", error);
                reject(error);
                updateDBStatus(false);
            }
        });
    }

    async saveCustomer(customer) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject(new Error("دیتابیس راه‌اندازی نشده است"));
                return;
            }
            
            try {
                const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
                const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
                
                customer.updatedAt = new Date().toISOString();
                customer.version = (customer.version || 0) + 1;
                
                const request = store.put(customer);
                
                request.onsuccess = () => resolve(customer);
                request.onerror = (event) => reject(event.target.error);
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
                const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
                const request = store.getAll();
                
                request.onsuccess = () => {
                    let customers = request.result || [];
                    
                    if (!includeDeleted) {
                        customers = customers.filter(c => !c.deleted);
                    }
                    
                    const customerObjects = customers.map(c => Customer.fromObject(c));
                    resolve(customerObjects);
                };
                
                request.onerror = (event) => reject(event.target.error);
            } catch (error) {
                reject(error);
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
                const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
                const request = store.get(id);
                
                request.onsuccess = () => {
                    if (request.result) {
                        resolve(Customer.fromObject(request.result));
                    } else {
                        resolve(null);
                    }
                };
                
                request.onerror = (event) => reject(event.target.error);
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
                const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
                const getRequest = store.get(id);
                
                getRequest.onsuccess = () => {
                    const customer = getRequest.result;
                    if (customer) {
                        customer.deleted = true;
                        customer.updatedAt = new Date().toISOString();
                        
                        const putRequest = store.put(customer);
                        putRequest.onsuccess = () => resolve(true);
                        putRequest.onerror = (event) => reject(event.target.error);
                    } else {
                        reject(new Error("مشتری یافت نشد"));
                    }
                };
                
                getRequest.onerror = (event) => reject(event.target.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    async searchCustomers(query) {
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
                const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
                const request = store.getAll();
                
                request.onsuccess = () => {
                    const allCustomers = request.result || [];
                    const searchTerm = query.toLowerCase().trim();
                    
                    const results = allCustomers.filter(customer => {
                        if (customer.deleted) return false;
                        
                        // جستجو در فیلدهای مختلف
                        const fields = ['name', 'phone', 'notes', 'id'];
                        return fields.some(field => {
                            const value = customer[field];
                            return value && value.toString().toLowerCase().includes(searchTerm);
                        });
                    }).map(c => Customer.fromObject(c));
                    
                    resolve(results);
                };
                
                request.onerror = (event) => reject(event.target.error);
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
                const store = transaction.objectStore(AppConfig.STORES.SETTINGS);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    resolve(request.result ? request.result.value : null);
                };
                
                request.onerror = (event) => reject(event.target.error);
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
                const store = transaction.objectStore(AppConfig.STORES.SETTINGS);
                const request = store.put({ 
                    key, 
                    value, 
                    updatedAt: new Date().toISOString() 
                });
                
                request.onsuccess = () => resolve();
                request.onerror = (event) => reject(event.target.error);
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
                const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
                const request = store.clear();
                
                request.onsuccess = () => resolve();
                request.onerror = (event) => reject(event.target.error);
            } catch (error) {
                reject(error);
            }
        });
    }
}

// ========== HELPER FUNCTIONS ==========
function showNotification(message, type = "info", duration = 3000) {
    // اگر عنصر نوتیفیکیشن وجود ندارد، ایجادش کن
    let notification = document.getElementById("notification");
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            z-index: 10000;
            display: none;
            max-width: 400px;
            font-family: Tahoma, Arial, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(notification);
    }
    
    // تنظیم متن و رنگ
    notification.textContent = message;
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    notification.style.backgroundColor = colors[type] || colors.info;
    
    // نمایش نوتیفیکیشن
    notification.style.display = 'block';
    notification.style.opacity = '1';
    
    // مخفی کردن بعد از مدت زمان مشخص
    clearTimeout(notification.timeoutId);
    notification.timeoutId = setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 300);
    }, duration);
}

function showLoading(message = "در حال بارگذاری...") {
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
            width: 50px;
            height: 50px;
            border: 5px solid #f3f3f3;
            border-top: 5px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        `;
        
        const text = document.createElement('div');
        text.id = 'loadingText';
        text.style.fontSize = '18px';
        
        // اضافه کردن انیمیشن
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
    }
    
    overlay.style.display = 'flex';
    document.getElementById('loadingText').textContent = message;
}

function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.style.display = 'none';
    }
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
    if (currentIndex !== null && customers[currentIndex]) {
        try {
            await dbManager.saveCustomer(customers[currentIndex]);
        } catch (error) {
            console.error("خطا در ذخیره خودکار:", error);
        }
    }
}, 1500);

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
        
        const index = customers.findIndex(c => c.id === newCustomer.id);
        if (index !== -1) {
            openProfile(index);
        }
    } catch (error) {
        showNotification("خطا در اضافه کردن مشتری: " + error.message, "error");
    }
}

async function loadCustomersFromDB() {
    try {
        customers = await dbManager.getAllCustomers();
        renderCustomerList();
        updateStats();
        return customers;
    } catch (error) {
        showNotification("خطا در بارگذاری مشتریان: " + error.message, "error");
        return [];
    }
}

async function saveCustomerToDB() {
    if (currentIndex === null || !customers[currentIndex]) {
        showNotification("مشتری انتخاب نشده است", "warning");
        return;
    }
    
    try {
        await dbManager.saveCustomer(customers[currentIndex]);
        showNotification("ذخیره شد", "success");
    } catch (error) {
        showNotification("خطا در ذخیره اطلاعات: " + error.message, "error");
    }
}

async function deleteCustomer(index) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    
    const customer = customers[index];
    const customerName = customer.name || 'بدون نام';
    
    if (!confirm(`آیا از حذف مشتری "${customerName}" مطمئن هستید؟`)) return;
    
    try {
        await dbManager.deleteCustomer(customer.id);
        showNotification(`مشتری "${customerName}" حذف شد`, "success");
        await loadCustomersFromDB();
        backHome();
    } catch (error) {
        showNotification("خطا در حذف مشتری: " + error.message, "error");
    }
}

async function searchCustomer() {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) return;
    
    const term = searchInput.value.trim();
    if (!term) {
        await loadCustomersFromDB();
        return;
    }
    
    try {
        const results = await dbManager.searchCustomers(term);
        renderSearchResults(results, term);
    } catch (error) {
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
            </div>
            <button onclick="openProfileFromSearch('${customer.id}')">
                <i class="fas fa-user-circle"></i> مشاهده
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
    
    // به‌روزرسانی اطلاعات
    document.getElementById("profileName").textContent = cust.name || 'بدون نام';
    document.getElementById("profilePhone").textContent = cust.phone || 'بدون شماره';
    document.getElementById("customerNotes").value = cust.notes || "";
    
    renderMeasurements(index);
    renderModels(index);
    renderOrdersHistory(index);
    renderPriceAndDeliverySection(index);
    
    // نمایش صفحه پروفایل
    document.getElementById("homePage").style.display = "none";
    document.getElementById("profilePage").style.display = "block";
}

function backHome() {
    document.getElementById("homePage").style.display = "block";
    document.getElementById("profilePage").style.display = "none";
    currentIndex = null;
    renderCustomerList();
}

function updateNotes() {
    if (currentIndex === null || !customers[currentIndex]) return;
    const notes = document.getElementById("customerNotes").value;
    customers[currentIndex].notes = notes;
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
    
    let html = `
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
    `;
    
    // ساخت ردیف‌های جدول
    const fields = [
        { key: 'قد', label: 'قد' },
        { key: 'شانه', label: 'شانه', subKeys: ['شانه_یک', 'شانه_دو'] },
        { key: 'آستین', label: 'آستین', subKeys: ['آستین_یک', 'آستین_دو', 'آستین_سه'] },
        { key: 'بغل', label: 'بغل' },
        { key: 'دامن', label: 'دامن' },
        { key: 'گردن', label: 'گردن' },
        { key: 'دور_سینه', label: 'دور سینه' },
        { key: 'شلوار', label: 'شلوار' },
        { key: 'دم_پاچه', label: 'دم پاچه' },
        { key: 'خشتک', label: 'خشتک', subKeys: ['بر_تمبان', 'خشتک'] },
        { key: 'چاک_پتی', label: 'چاک پتی' },
        { key: 'سفارش', label: 'سفارش', subKeys: ['تعداد_سفارش', 'مقدار_تکه'] }
    ];
    
    fields.forEach(field => {
        if (field.subKeys) {
            // فیلدهای چندگانه (مثل شانه، آستین)
            html += `
                <tr>
                    <td class="measurement-label">${field.label}</td>
                    <td>
                        <div class="horizontal-inputs">
            `;
            
            field.subKeys.forEach((subKey, i) => {
                const placeholder = ['یک', 'دو', 'سه'][i] || '';
                html += `
                    <input type="number" 
                           class="measurement-input small"
                           data-field="${subKey}"
                           value="${customer.measurements[subKey] || ''}"
                           oninput="updateMeasurement('${subKey}', this.value)"
                           step="0.5"
                           min="0"
                           placeholder="${placeholder}">
                `;
            });
            
            html += `
                        </div>
                    </td>
                </tr>
            `;
        } else if (field.key === 'خشتک') {
            // خشتک و بر تهمان
            html += `
                <tr>
                    <td class="measurement-label">${field.label}</td>
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
            `;
        } else if (field.key === 'سفارش') {
            // سفارش
            html += `
                <tr>
                    <td class="measurement-label">${field.label}</td>
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
            `;
        } else {
            // فیلدهای عادی
            html += `
                <tr>
                    <td class="measurement-label">${field.label}</td>
                    <td>
                        <input type="number" 
                               class="measurement-input"
                               data-field="${field.key}"
                               value="${customer.measurements[field.key] || ''}"
                               oninput="updateMeasurement('${field.key}', this.value)"
                               step="0.5"
                               min="0"
                               placeholder="سانتی‌متر">
                    </td>
                </tr>
            `;
        }
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
}

function updateMeasurement(field, val) {
    if (currentIndex === null || !customers[currentIndex]) return;
    
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
    
    // یخن
    renderModelOptions('yakhunOptions', AppConfig.YAKHUN_MODELS, cust.models.yakhun, (opt) => {
        cust.models.yakhun = opt;
        document.getElementById("yakhunSelectedText").textContent = `مدل یخن: ${opt}`;
        showNotification(`مدل یخن به "${opt}" تغییر کرد`, "success");
        debouncedSave();
    });
    
    // آستین
    renderModelOptions('sleeveOptions', AppConfig.SLEEVE_MODELS, cust.models.sleeve, (opt) => {
        cust.models.sleeve = opt;
        document.getElementById("sleeveSelectedText").textContent = `مدل آستین: ${opt}`;
        showNotification(`مدل آستین به "${opt}" تغییر کرد`, "success");
        debouncedSave();
    });
    
    // دامن
    renderMultiSelectOptions('skirtOptions', AppConfig.SKIRT_MODELS, cust.models.skirt, (opt, isSelected) => {
        if (!Array.isArray(cust.models.skirt)) cust.models.skirt = [];
        
        if (isSelected) {
            const index = cust.models.skirt.indexOf(opt);
            if (index > -1) cust.models.skirt.splice(index, 1);
            showNotification(`مدل دامن "${opt}" حذف شد`, "info");
        } else {
            cust.models.skirt.push(opt);
            showNotification(`مدل دامن "${opt}" اضافه شد`, "success");
        }
        
        document.getElementById("skirtSelectedText").textContent = 
            cust.models.skirt.length > 0 
                ? `مدل دامن: ${cust.models.skirt.join(", ")}` 
                : "مدل دامن: انتخاب نشده";
        
        // رندر مجدد
        renderMultiSelectOptions('skirtOptions', AppConfig.SKIRT_MODELS, cust.models.skirt, arguments.callee);
        debouncedSave();
    });
    
    // ویژگی‌ها
    renderMultiSelectOptions('featuresOptions', AppConfig.FEATURES_LIST, cust.models.features, (opt, isSelected) => {
        if (!Array.isArray(cust.models.features)) cust.models.features = [];
        
        if (isSelected) {
            const index = cust.models.features.indexOf(opt);
            if (index > -1) cust.models.features.splice(index, 1);
            showNotification(`ویژگی "${opt}" حذف شد`, "info");
        } else {
            cust.models.features.push(opt);
            showNotification(`ویژگی "${opt}" اضافه شد`, "success");
        }
        
        document.getElementById("featuresSelectedText").textContent = 
            cust.models.features.length > 0 
                ? `ویژگی‌ها: ${cust.models.features.join(", ")}` 
                : "ویژگی‌ها: انتخاب نشده";
        
        // رندر مجدد
        renderMultiSelectOptions('featuresOptions', AppConfig.FEATURES_LIST, cust.models.features, arguments.callee);
        debouncedSave();
    });
    
    // به‌روزرسانی متن‌های انتخاب شده
    updateSelectedModelTexts(index);
}

function renderModelOptions(containerId, options, selectedValue, onClick) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = "";
    options.forEach(opt => {
        const div = document.createElement("div");
        div.className = "model-option" + (selectedValue === opt ? " selected" : "");
        div.textContent = opt;
        div.onclick = () => { 
            onClick(opt);
            container.style.display = "none";
        };
        container.appendChild(div);
    });
}

function renderMultiSelectOptions(containerId, options, selectedArray, onClick) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = "";
    options.forEach(opt => {
        const isSelected = Array.isArray(selectedArray) && selectedArray.includes(opt);
        const div = document.createElement("div");
        div.className = `multi-select-option ${isSelected ? 'selected' : ''}`;
        div.innerHTML = `
            <span>${opt}</span>
            <div class="checkmark">${isSelected ? '✓' : ''}</div>
        `;
        div.onclick = () => onClick(opt, isSelected);
        container.appendChild(div);
    });
}

function updateSelectedModelTexts(index) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    
    const cust = customers[index];
    
    document.getElementById("yakhunSelectedText").textContent = 
        cust.models.yakhun ? `مدل یخن: ${cust.models.yakhun}` : "مدل یخن: انتخاب نشده";
    
    document.getElementById("sleeveSelectedText").textContent = 
        cust.models.sleeve ? `مدل آستین: ${cust.models.sleeve}` : "مدل آستین: انتخاب نشده";
    
    document.getElementById("skirtSelectedText").textContent = 
        Array.isArray(cust.models.skirt) && cust.models.skirt.length > 0 
            ? `مدل دامن: ${cust.models.skirt.join(", ")}` 
            : "مدل دامن: انتخاب نشده";
    
    document.getElementById("featuresSelectedText").textContent = 
        Array.isArray(cust.models.features) && cust.models.features.length > 0 
            ? `ویژگی‌ها: ${cust.models.features.join(", ")}` 
            : "ویژگی‌ها: انتخاب نشده";
}

// ========== PRICE & DELIVERY MANAGEMENT ==========
function renderPriceAndDeliverySection(index) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    
    const customer = customers[index];
    const container = document.getElementById("priceDeliverySection");
    
    if (!container) return;
    
    container.innerHTML = `
        <h4><i class="fas fa-money-bill-wave"></i> قیمت و تاریخ تحویل</h4>
        
        <div class="price-input-group">
            <label class="price-label">
                <i class="fas fa-money-bill"></i>
                قیمت دوخت (افغانی):
            </label>
            <input type="number" 
                   id="sewingPriceAfghani" 
                   placeholder="مبلغ به افغانی"
                   value="${customer.sewingPriceAfghani || ''}"
                   oninput="updateAfghaniPrice(${index}, this.value)"
                   class="price-input">
            <span class="price-unit">افغانی</span>
        </div>
        
        <div class="payment-status-section">
            <div class="payment-toggle" onclick="togglePaymentReceived(${index})">
                <div class="payment-checkbox ${customer.paymentReceived ? 'checked' : ''}">
                    <div class="checkbox-display ${customer.paymentReceived ? 'checked' : ''}"></div>
                    <span>${customer.paymentReceived ? 'پول رسید شد' : 'پول نرسید'}</span>
                </div>
            </div>
        </div>
        
        <div class="delivery-days">
            <label class="price-label">
                <i class="fas fa-calendar-check"></i>
                روز تحویل:
            </label>
            <div class="delivery-grid">
                ${['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'].map(day => `
                    <div class="day-button ${customer.deliveryDay === day ? 'selected' : ''}" 
                         onclick="setDeliveryDay(${index}, '${day}')">
                        ${day}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function updateAfghaniPrice(index, price) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    customers[index].sewingPriceAfghani = price ? parseInt(price) : null;
    debouncedSave();
}

function togglePaymentReceived(index) {
    if (index < 0 || index >= customers.length || !customers[index]) return;
    customers[index].paymentReceived = !customers[index].paymentReceived;
    customers[index].paymentDate = customers[index].paymentReceived ? new Date().toISOString() : null;
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
    if (!orderDetails || orderDetails.trim() === "") return;
    
    if (!Array.isArray(customers[index].orders)) {
        customers[index].orders = [];
    }
    
    customers[index].orders.push({
        id: Date.now().toString(),
        date: new Date().toISOString(),
        details: orderDetails.trim(),
        status: "pending"
    });
    
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
            <div class="order-details">${order.details || 'بدون توضیحات'}</div>
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
        const div = document.createElement("div");
        div.className = "customer-item";
        div.innerHTML = `
            <div>
                <span class="customer-number">${customer.id ? customer.id.substring(0, 4) : '----'}</span>
                <strong>${customer.name || 'بدون نام'}</strong> - ${customer.phone || 'بدون شماره'}
            </div>
            <button onclick="openProfile(${i})">
                <i class="fas fa-user-circle"></i> مشاهده
            </button>
        `;
        list.appendChild(div);
    });
}

// ========== STATISTICS ==========
function updateStats() {
    const totalCustomers = customers.length;
    const activeOrders = customers.reduce((total, customer) => {
        return total + (Array.isArray(customer.orders) ? customer.orders.length : 0);
    }, 0);
    
    document.getElementById("totalCustomers").textContent = totalCustomers;
    document.getElementById("activeOrders").textContent = activeOrders;
    document.getElementById("dbSize").textContent = "فعال";
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
            for (const customerData of customersData) {
                if (customerData.deleted) continue;
                const customer = Customer.fromObject(customerData);
                await dbManager.saveCustomer(customer);
                importedCount++;
            }
            
            hideLoading();
            showNotification(`${importedCount} مشتری با موفقیت وارد شد`, "success");
            
            await loadCustomersFromDB();
            event.target.value = '';
            
        } catch (error) {
            hideLoading();
            showNotification("خطا در بارگذاری فایل: " + error.message, "error");
        }
    };
    
    reader.readAsText(file);
}

function toggleDarkMode() {
    document.body.className = 'dark-mode';
    isDarkMode = true;
    isVividMode = false;
    dbManager.saveSettings('theme', 'dark');
    showNotification("حالت تاریک فعال شد", "success");
}

function toggleLightMode() {
    document.body.className = 'light-mode';
    isDarkMode = false;
    isVividMode = false;
    dbManager.saveSettings('theme', 'light');
    showNotification("حالت روشن فعال شد", "success");
}

function toggleVividMode() {
    document.body.className = 'vivid-mode';
    isDarkMode = false;
    isVividMode = true;
    dbManager.saveSettings('theme', 'vivid');
    showNotification("حالت ویوید فعال شد", "success");
}

async function clearAllData() {
    if (!confirm("⚠️ آیا از پاک‌سازی تمام داده‌ها مطمئن هستید؟")) return;
    if (!confirm("❌ این عمل قابل بازگشت نیست!")) return;
    
    try {
        showLoading("در حال پاک‌سازی...");
        await dbManager.clearAllData();
        customers = [];
        currentIndex = null;
        await loadCustomersFromDB();
        backHome();
        hideLoading();
        showNotification("تمامی داده‌ها پاک شدند", "success");
    } catch (error) {
        hideLoading();
        showNotification("خطا در پاک‌سازی: " + error.message, "error");
    }
}

// ========== INITIALIZATION ==========
async function initializeApp() {
    try {
        showLoading("در حال راه‌اندازی اپلیکیشن ALFAJR...");
        
        // بررسی پشتیبانی مرورگر
        if (!window.indexedDB) {
            throw new Error("مرورگر شما از IndexedDB پشتیبانی نمی‌کند");
        }
        
        // ایجاد مدیر دیتابیس
        dbManager = new DatabaseManager();
        
        // راه‌اندازی دیتابیس
        await dbManager.init();
        
        // بارگذاری مشتریان
        await loadCustomersFromDB();
        
        // بارگذاری تم ذخیره شده
        try {
            const savedTheme = await dbManager.getSettings('theme');
            if (savedTheme === 'light') toggleLightMode();
            else if (savedTheme === 'vivid') toggleVividMode();
            else toggleDarkMode();
        } catch (e) {
            toggleDarkMode();
        }
        
        // تنظیم هندلرهای رویداد
        setupEventListeners();
        
        hideLoading();
        showNotification("اپلیکیشن ALFAJR آماده است", "success");
        
    } catch (error) {
        hideLoading();
        
        const errorMessage = error.message || "خطای نامشخص";
        showNotification("خطا در راه‌اندازی: " + errorMessage, "error");
        
        const list = document.getElementById("customerList");
        if (list) {
            list.innerHTML = `
                <div class="empty-state error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>خطا در راه‌اندازی</h3>
                    <p>${errorMessage}</p>
                    <button onclick="location.reload()" style="margin-top: 10px; padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        <i class="fas fa-redo"></i> رفرش صفحه
                    </button>
                </div>
            `;
        }
    }
}

function setupEventListeners() {
    // جستجو با Enter
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("keypress", function(e) {
            if (e.key === "Enter") searchCustomer();
        });
    }
    
    // فایل
    const fileInput = document.getElementById("fileInput");
    if (fileInput) {
        fileInput.addEventListener("change", loadDataFromFile);
    }
    
    // یادداشت‌ها
    const customerNotes = document.getElementById("customerNotes");
    if (customerNotes) {
        customerNotes.addEventListener("input", updateNotes);
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
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
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

// ========== GLOBAL EXPORTS ==========
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
