// ========== CONFIGURATION ==========
const AppConfig = {
    DATABASE_NAME: 'ALFAJR_DB',
    DATABASE_VERSION: 4, // نسخه را افزایش دادیم
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
        // اطمینان از منحصر به فرد بودن ID
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
        const customer = new Customer(obj.name, obj.phone);
        
        // کپی کردن تمام خصوصیات از آبجکت ورودی
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                customer[key] = obj[key];
            }
        }
        
        // اطمینان از وجود آرایه‌های ضروری
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
        if (!customer.models.skirt) customer.models.skirt = [];
        if (!customer.models.features) customer.models.features = [];
        
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
                    console.log("دیتابیس با موفقیت باز شد");
                    
                    this.db.onerror = (event) => {
                        console.error("خطای دیتابیس:", event.target.error);
                        showNotification("خطا در عملیات دیتابیس", "error");
                    };
                    
                    // اضافه کردن هندلر برای بسته شدن
                    this.db.onclose = () => {
                        console.log("دیتابیس بسته شد");
                        this.isInitialized = false;
                    };
                    
                    updateDBStatus(true);
                    resolve(this.db);
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    console.log(`آپگرید دیتابیس از نسخه ${event.oldVersion} به ${event.newVersion}`);
                    
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
                };
                
            } catch (error) {
                console.error("خطا در راه‌اندازی دیتابیس:", error);
                reject(error);
            }
        });
    }

    // متد جدید: دریافت یک مشتری بر اساس ID
    async getCustomer(id) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject("دیتابیس راه‌اندازی نشده است");
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            
            const request = store.get(id);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async saveCustomer(customer) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject("دیتابیس راه‌اندازی نشده است");
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            
            // اطمینان از وجود تمام فیلدهای ضروری
            customer.updatedAt = new Date().toISOString();
            customer.version = (customer.version || 0) + 1;
            
            // اطمینان از ساختار صحیح
            if (!customer.measurements) {
                const tempCustomer = new Customer(customer.name, customer.phone);
                customer.measurements = tempCustomer.measurements;
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
            
            request.onsuccess = () => {
                resolve(customer);
            };
            
            request.onerror = (event) => {
                console.error("خطا در ذخیره مشتری:", event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getAllCustomers(includeDeleted = false) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject("دیتابیس راه‌اندازی نشده است");
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const index = store.index('createdAt');
            
            const request = index.getAll();
            
            request.onsuccess = () => {
                let customers = request.result;
                if (!includeDeleted) {
                    customers = customers.filter(c => !c.deleted);
                }
                
                // اطمینان از ساختار صحیح مشتریان
                customers = customers.map(c => {
                    if (!c.models) {
                        c.models = {
                            yakhun: "",
                            sleeve: "",
                            skirt: [],
                            features: []
                        };
                    }
                    if (!c.models.skirt) c.models.skirt = [];
                    if (!c.models.features) c.models.features = [];
                    if (!c.measurements) {
                        const tempCustomer = new Customer(c.name, c.phone);
                        c.measurements = tempCustomer.measurements;
                    }
                    if (!c.orders) c.orders = [];
                    
                    return c;
                });
                
                resolve(customers);
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async searchCustomers(query, field = 'name') {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject("دیتابیس راه‌اندازی نشده است");
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            
            let index;
            try {
                index = store.index(field);
            } catch (e) {
                // اگر ایندکس وجود نداشت، جستجوی سراسری انجام بده
                this.getAllCustomers().then(allCustomers => {
                    const results = allCustomers.filter(customer => {
                        return Object.values(customer).some(value => 
                            value && typeof value === 'string' && 
                            value.toLowerCase().includes(query.toLowerCase())
                        );
                    });
                    resolve(results);
                }).catch(reject);
                return;
            }
            
            const request = index.openCursor();
            const results = [];
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const customer = cursor.value;
                    if (customer[field] && 
                        customer[field].toLowerCase().includes(query.toLowerCase()) &&
                        !customer.deleted) {
                        results.push(customer);
                    }
                    cursor.continue();
                } else {
                    resolve(results);
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
                reject("دیتابیس راه‌اندازی نشده است");
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
                        resolve(true);
                    };
                    
                    putRequest.onerror = (event) => {
                        reject(event.target.error);
                    };
                } else {
                    reject("مشتری یافت نشد");
                }
            };
            
            getRequest.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async getDatabaseSize() {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject("دیتابیس راه‌اندازی نشده است");
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const data = JSON.stringify(request.result);
                const sizeInBytes = new Blob([data]).size;
                resolve(sizeInBytes);
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async getSettings(key) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject("دیتابیس راه‌اندازی نشده است");
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
                reject("دیتابیس راه‌اندازی نشده است");
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.SETTINGS], 'readwrite');
            const store = transaction.objectStore(AppConfig.STORES.SETTINGS);
            
            const request = store.put({ key, value, updatedAt: new Date().toISOString() });
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async clearAllData() {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized || !this.db) {
                reject("دیتابیس راه‌اندازی نشده است");
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            
            const request = store.clear();
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    close() {
        if (this.db) {
            this.db.close();
            this.isInitialized = false;
            updateDBStatus(false);
        }
    }
}

// ========== CREATE DATABASE MANAGER INSTANCE ==========
const dbManager = new DatabaseManager();

// ========== HELPER FUNCTIONS ==========
function showNotification(message, type = "info", duration = 3000) {
    const notification = document.getElementById("notification");
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add("show");
    
    clearTimeout(notification.timeoutId);
    notification.timeoutId = setTimeout(() => {
        notification.classList.remove("show");
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
    const overlay = document.getElementById("loadingOverlay");
    const text = document.getElementById("loadingText");
    if (overlay && text) {
        text.textContent = message;
        overlay.style.display = "flex";
    }
}

function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
        overlay.style.display = "none";
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

// ایجاد یک نمونه debounced برای ذخیره
const debouncedSave = debounce(async () => {
    if (currentIndex !== null && currentIndex < customers.length) {
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
        
        // باز کردن پروفایل مشتری جدید
        const index = customers.findIndex(c => c.id === newCustomer.id);
        if (index !== -1) {
            openProfile(index);
        }
    } catch (error) {
        console.error("خطا در اضافه کردن مشتری:", error);
        showNotification("خطا در اضافه کردن مشتری", "error");
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
        showNotification("خطا در بارگذاری مشتریان", "error");
        hideLoading();
        return [];
    }
}

async function saveCustomerToDB() {
    if (currentIndex === null || currentIndex >= customers.length) {
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
        showNotification("خطا در ذخیره اطلاعات", "error");
    }
}

async function deleteCustomer(index) {
    if (index < 0 || index >= customers.length) return;
    
    const customer = customers[index];
    const customerName = customer.name;
    
    if (!confirm(`آیا از حذف مشتری "${customerName}" مطمئن هستید؟ این مشتری به سطل زباله منتقل می‌شود.`)) return;
    
    try {
        await dbManager.deleteCustomer(customer.id);
        showNotification(`مشتری "${customerName}" به سطل زباله منتقل شد`, "success");
        await loadCustomersFromDB();
        backHome();
    } catch (error) {
        console.error("خطا در حذف مشتری:", error);
        showNotification("خطا در حذف مشتری", "error");
    }
}

async function searchCustomer() {
    const term = document.getElementById("searchInput").value.trim();
    if (!term) {
        await loadCustomersFromDB();
        renderCustomerList();
        return;
    }
    
    try {
        let results = await dbManager.searchCustomers(term, 'name');
        
        if (results.length === 0) {
            results = await dbManager.searchCustomers(term, 'phone');
        }
        
        if (results.length === 0) {
            const allCustomers = await dbManager.getAllCustomers();
            results = allCustomers.filter(customer => {
                return Object.values(customer).some(value => 
                    value && typeof value === 'string' && 
                    value.toLowerCase().includes(term.toLowerCase())
                );
            });
        }
        
        renderSearchResults(results, term);
    } catch (error) {
        console.error("خطا در جستجو:", error);
        showNotification("خطا در جستجو", "error");
    }
}

function renderSearchResults(results, term) {
    const list = document.getElementById("customerList");
    if (!list) return;
    
    if (results.length === 0) {
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
        
        // تبدیل به شیء Customer
        const customerObj = Customer.fromObject(customer);
        
        // بررسی وجود مشتری در آرایه
        const index = customers.findIndex(c => c.id === customerId);
        if (index !== -1) {
            // به‌روزرسانی مشتری موجود
            customers[index] = customerObj;
            currentIndex = index;
        } else {
            // اضافه کردن مشتری جدید
            customers.push(customerObj);
            currentIndex = customers.length - 1;
        }
        
        openProfile(currentIndex);
    } catch (error) {
        console.error("خطا در باز کردن پروفایل:", error);
        showNotification("خطا در باز کردن پروفایل", "error");
    }
}

// ========== PROFILE MANAGEMENT ==========
function openProfile(index) {
    if (index < 0 || index >= customers.length) {
        showNotification("مشتری یافت نشد!", "error");
        return;
    }
    
    currentIndex = index;
    const cust = customers[index];
    
    document.getElementById("profileName").textContent = `${cust.name || 'بدون نام'}`;
    document.getElementById("profilePhone").textContent = cust.phone || 'بدون شماره';
    document.getElementById("customerNotes").value = cust.notes || "";
    
    renderMeasurements(index);
    renderModels(index);
    updateSelectedModelTexts(index);
    renderOrdersHistory(index);
    renderPriceAndDeliverySection(index);
    
    document.getElementById("homePage").style.display = "none";
    document.getElementById("profilePage").style.display = "block";
    
    currentFieldIndex = 0;
    
    setTimeout(() => {
        const firstInput = document.querySelector('.field-input[contenteditable="true"]');
        if (firstInput) {
            firstInput.focus();
        }
    }, 100);
}

function backHome() {
    document.getElementById("homePage").style.display = "block";
    document.getElementById("profilePage").style.display = "none";
    currentIndex = null;
    renderCustomerList();
    updateStats();
}

function updateNotes(val) {
    if (currentIndex === null || currentIndex >= customers.length) return;
    customers[currentIndex].notes = val;
    debouncedSave();
}

// ========== MEASUREMENTS TABLE ==========
function renderMeasurements(index) {
    if (index < 0 || index >= customers.length) return;
    
    const customer = customers[index];
    const container = document.getElementById("measurementsTable");
    if (!container) return;
    
    // اطمینان از وجود measurements
    if (!customer.measurements) {
        const tempCustomer = new Customer(customer.name, customer.phone);
        customer.measurements = tempCustomer.measurements;
    }
    
    container.innerHTML = `
        <h4><i class="fas fa-ruler-combined"></i> اندازه‌گیری‌ها:</h4>
        <table>
            <thead>
                <tr>
                    <th>اندازه</th>
                    <th>مقدار</th>
                </tr>
            </thead>
            <tbody>
                <!-- قد -->
                <tr>
                    <td style="font-weight:bold;color:var(--royal-gold);">قد</td>
                    <td>
                        <div class="field-input" 
                             contenteditable="true" 
                             data-field="قد"
                             oninput="updateMeasurement('قد', this.innerText.trim())">
                            ${customer.measurements.قد || ''}
                        </div>
                    </td>
                </tr>
                
                <!-- شانه (دو فیلد بدون عنوان) -->
                <tr>
                    <td style="font-weight:bold;color:var(--royal-gold);">شانه</td>
                    <td>
                        <div class="horizontal-fields">
                            <div class="field-item">
                                <div class="field-input" 
                                     contenteditable="true" 
                                     data-field="شانه_یک"
                                     oninput="updateMeasurement('شانه_یک', this.innerText.trim())">
                                    ${customer.measurements.شانه_یک || ''}
                                </div>
                            </div>
                            <div class="field-item">
                                <div class="field-input" 
                                     contenteditable="true" 
                                     data-field="شانه_دو"
                                     oninput="updateMeasurement('شانه_دو', this.innerText.trim())">
                                    ${customer.measurements.شانه_دو || ''}
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
                
                <!-- آستین (سه فیلد بدون عنوان) -->
                <tr>
                    <td style="font-weight:bold;color:var(--royal-gold);">آستین</td>
                    <td>
                        <div class="horizontal-fields">
                            <div class="field-item">
                                <div class="field-input" 
                                     contenteditable="true" 
                                     data-field="آستین_یک"
                                     oninput="updateMeasurement('آستین_یک', this.innerText.trim())">
                                    ${customer.measurements.آستین_یک || ''}
                                </div>
                            </div>
                            <div class="field-item">
                                <div class="field-input" 
                                     contenteditable="true" 
                                     data-field="آستین_دو"
                                     oninput="updateMeasurement('آستین_دو', this.innerText.trim())">
                                    ${customer.measurements.آستین_دو || ''}
                                </div>
                            </div>
                            <div class="field-item">
                                <div class="field-input" 
                                     contenteditable="true" 
                                     data-field="آستین_سه"
                                     oninput="updateMeasurement('آستین_سه', this.innerText.trim())">
                                    ${customer.measurements.آستین_سه || ''}
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
                
                <!-- بقیه فیلدها -->
                ${AppConfig.MEASUREMENT_FIELDS.slice(6).map((field, i) => {
                    if (field === 'بر_تمبان' || field === 'خشتک') return '';
                    
                    return `
                    <tr>
                        <td style="font-weight:bold;color:var(--royal-gold);">${getFieldLabel(field)}</td>
                        <td>
                            <div class="field-input" 
                                 contenteditable="true" 
                                 data-field="${field}"
                                 oninput="updateMeasurement('${field}', this.innerText.trim())">
                                ${customer.measurements[field] || ''}
                            </div>
                        </td>
                    </tr>
                    `;
                }).join('')}
                
                <!-- بر تهمان و خشتک (دو فیلد با اختصار) -->
                <tr>
                    <td style="font-weight:bold;color:var(--royal-gold);">خشتک</td>
                    <td>
                        <div class="horizontal-fields">
                            <div class="field-item">
                                <span class="field-label">ب</span>
                                <div class="field-input" 
                                     contenteditable="true" 
                                     data-field="بر_تمبان"
                                     oninput="updateMeasurement('بر_تمبان', this.innerText.trim())">
                                    ${customer.measurements.بر_تمبان || ''}
                                </div>
                            </div>
                            <div class="field-item">
                                <span class="field-label">خ</span>
                                <div class="field-input" 
                                     contenteditable="true" 
                                     data-field="خشتک"
                                     oninput="updateMeasurement('خشتک', this.innerText.trim())">
                                    ${customer.measurements.خشتک || ''}
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
                
                <!-- سفارش (تعداد سفارش + مقدار تکه در یک ردیف) -->
                <tr>
                    <td style="font-weight:bold;color:var(--royal-gold);">سفارش</td>
                    <td>
                        <div class="horizontal-fields">
                            <div class="field-item">
                                <span class="field-label">تعداد</span>
                                <div class="field-input" 
                                     contenteditable="true" 
                                     data-field="تعداد_سفارش"
                                     oninput="updateMeasurement('تعداد_سفارش', this.innerText.trim())">
                                    ${customer.measurements.تعداد_سفارش || ''}
                                </div>
                            </div>
                            <div class="field-item">
                                <span class="field-label">مقدار تکه</span>
                                <div class="field-input" 
                                     contenteditable="true" 
                                     data-field="مقدار_تکه"
                                     oninput="updateMeasurement('مقدار_تکه', this.innerText.trim())">
                                    ${customer.measurements.مقدار_تکه || ''}
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
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
    if (currentIndex === null || currentIndex >= customers.length) return;
    
    // اطمینان از وجود measurements
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
    if (index < 0 || index >= customers.length) return;
    
    const cust = customers[index];
    
    // اطمینان از وجود models
    if (!cust.models) {
        cust.models = {
            yakhun: "",
            sleeve: "",
            skirt: [],
            features: []
        };
    }
    
    renderModelOptions('yakhunOptions', AppConfig.YAKHUN_MODELS, cust.models.yakhun, 
        (opt) => {
            cust.models.yakhun = opt;
            showNotification(`مدل یخن به "${opt}" تغییر کرد`, "success");
            debouncedSave();
            updateSelectedModelTexts(index);
        });
    
    renderModelOptions('sleeveOptions', AppConfig.SLEEVE_MODELS, cust.models.sleeve,
        (opt) => {
            cust.models.sleeve = opt;
            showNotification(`مدل آستین به "${opt}" تغییر کرد`, "success");
            debouncedSave();
            updateSelectedModelTexts(index);
        });
    
    renderMultiSelectOptions('skirtOptions', AppConfig.SKIRT_MODELS, cust.models.skirt || [],
        (opt, isSelected) => {
            if (!cust.models.skirt) cust.models.skirt = [];
            
            if (isSelected) {
                cust.models.skirt = cust.models.skirt.filter(item => item !== opt);
                showNotification(`مدل دامن "${opt}" حذف شد`, "info");
            } else {
                cust.models.skirt.push(opt);
                showNotification(`مدل دامن "${opt}" اضافه شد`, "success");
            }
            debouncedSave();
            updateSelectedModelTexts(index);
        });
    
    renderMultiSelectOptions('featuresOptions', AppConfig.FEATURES_LIST, cust.models.features || [],
        (opt, isSelected) => {
            if (!cust.models.features) cust.models.features = [];
            
            if (isSelected) {
                cust.models.features = cust.models.features.filter(item => item !== opt);
                showNotification(`ویژگی "${opt}" حذف شد`, "info");
            } else {
                cust.models.features.push(opt);
                showNotification(`ویژگی "${opt}" اضافه شد`, "success");
            }
            debouncedSave();
            updateSelectedModelTexts(index);
        });
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
        const isSelected = selectedArray && selectedArray.includes(opt);
        const div = document.createElement("div");
        div.className = `multi-select-option ${isSelected ? 'selected' : ''}`;
        div.innerHTML = `
            <span>${opt}</span>
            <div class="checkmark"></div>
        `;
        div.onclick = () => {
            onClick(opt, isSelected);
        };
        container.appendChild(div);
    });
}

function updateSelectedModelTexts(index) {
    if (index < 0 || index >= customers.length) return;
    
    const cust = customers[index];
    
    // اطمینان از وجود models
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
            cust.models.skirt && cust.models.skirt.length > 0 
                ? `مدل دامن: ${cust.models.skirt.join(", ")}` 
                : "مدل دامن: انتخاب نشده";
    }
    
    if (featuresText) {
        featuresText.textContent = 
            cust.models.features && cust.models.features.length > 0 
                ? `ویژگی‌ها: ${cust.models.features.join(", ")}` 
                : "ویژگی‌ها: انتخاب نشده";
    }
}

// ========== PRICE & DELIVERY MANAGEMENT ==========
function renderPriceAndDeliverySection(index) {
    if (index < 0 || index >= customers.length) return;
    
    const customer = customers[index];
    const container = document.getElementById("priceDeliverySection");
    
    if (!container) return;
    
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
                       value="${customer.sewingPriceAfghani || ''}"
                       oninput="updateAfghaniPrice(${index}, this.value)"
                       class="price-input">
                <span class="price-unit">افغانی</span>
            </div>
        </div>
        
        <!-- تیک رسید (پرداخت شده) -->
        <div class="payment-status-section">
            <div class="payment-toggle">
                <div class="payment-checkbox ${customer.paymentReceived ? 'checked' : ''}" 
                     onclick="togglePaymentReceived(${index})">
                    <div class="checkbox-display ${customer.paymentReceived ? 'checked' : ''}"></div>
                    <span style="font-weight: bold; color: ${customer.paymentReceived ? 'var(--success)' : 'var(--royal-silver)'}">
                        ${customer.paymentReceived ? 'پول رسید شد' : 'پول نرسید'}
                    </span>
                </div>
            </div>
            
            ${customer.paymentReceived && customer.paymentDate ? `
            <div style="margin-top: 10px; padding: 8px; background: rgba(40,167,69,0.15); border-radius: 6px; text-align: center; font-size: 13px;">
                <i class="fas fa-calendar-check" style="color: var(--success); margin-left: 5px;"></i>
                تاریخ رسید: ${new Date(customer.paymentDate).toLocaleDateString('fa-IR')}
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
                    const isSelected = customer.deliveryDay === day;
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

// تابع‌های کمکی برای قیمت و تحویل
function updateAfghaniPrice(index, price) {
    if (index < 0 || index >= customers.length) return;
    customers[index].sewingPriceAfghani = price ? parseInt(price) : null;
    debouncedSave();
}

function togglePaymentReceived(index) {
    if (index < 0 || index >= customers.length) return;
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
    if (index < 0 || index >= customers.length) return;
    customers[index].deliveryDay = day;
    renderPriceAndDeliverySection(index);
    debouncedSave();
    showNotification(`روز تحویل به ${day} تنظیم شد`, "success");
}

// ========== ORDER MANAGEMENT ==========
function addOrder(index) {
    if (index < 0 || index >= customers.length) return;
    
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
    
    if (!customers[index].orders) {
        customers[index].orders = [];
    }
    
    customers[index].orders.push(newOrder);
    customers[index].updatedAt = new Date().toISOString();
    
    renderOrdersHistory(index);
    debouncedSave();
    showNotification("سفارش جدید اضافه شد", "success");
}

function renderOrdersHistory(index) {
    if (index < 0 || index >= customers.length) return;
    
    const customer = customers[index];
    const container = document.getElementById("ordersHistory");
    
    if (!container) return;
    
    if (!customer.orders || customer.orders.length === 0) {
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
    
    if (customers.length === 0) {
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
        const totalCustomers = customers.length;
        const activeOrders = customers.reduce((total, customer) => {
            return total + (customer.orders ? customer.orders.length : 0);
        }, 0);
        
        const dbSize = await dbManager.getDatabaseSize();
        
        document.getElementById("totalCustomers").textContent = totalCustomers;
        document.getElementById("activeOrders").textContent = activeOrders;
        document.getElementById("dbSize").textContent = formatBytes(dbSize);
    } catch (error) {
        console.error("خطا در به‌روزرسانی آمار:", error);
    }
}

// ========== SETTINGS FUNCTIONS ==========
async function saveDataToFile() {
    try {
        const allCustomers = await dbManager.getAllCustomers(true); // Include deleted
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
        showNotification("خطا در ذخیره فایل", "error");
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
            
            // Validate data structure
            if (!Array.isArray(customersData)) {
                throw new Error("فرمت فایل نامعتبر است");
            }
            
            let importedCount = 0;
            for (const customerData of customersData) {
                // رد کردن مشتری‌های حذف شده
                if (customerData.deleted) continue;
                
                const customer = Customer.fromObject(customerData);
                await dbManager.saveCustomer(customer);
                importedCount++;
            }
            
            hideLoading();
            showNotification(`${importedCount} مشتری با موفقیت وارد شد`, "success");
            
            // Reload and refresh UI
            await loadCustomersFromDB();
            renderCustomerList();
            updateStats();
            
            // Reset file input
            event.target.value = '';
            
        } catch (error) {
            hideLoading();
            console.error("خطا در بارگذاری فایل:", error);
            showNotification("خطا در بارگذاری فایل: " + error.message, "error");
        }
    };
    
    reader.readAsText(file);
}

function toggleDarkMode() {
    document.body.classList.remove('light-mode', 'vivid-mode');
    document.body.classList.add('dark-mode');
    isDarkMode = true;
    isVividMode = false;
    dbManager.saveSettings('theme', 'dark');
    showNotification("حالت تاریک فعال شد", "success");
}

function toggleLightMode() {
    document.body.classList.remove('dark-mode', 'vivid-mode');
    document.body.classList.add('light-mode');
    isDarkMode = false;
    isVividMode = false;
    dbManager.saveSettings('theme', 'light');
    showNotification("حالت روشن فعال شد", "success");
}

function toggleVividMode() {
    document.body.classList.remove('dark-mode', 'light-mode');
    document.body.classList.add('vivid-mode');
    isDarkMode = false;
    isVividMode = true;
    dbManager.saveSettings('theme', 'vivid');
    showNotification("حالت ویوید فعال شد", "success");
}

async function optimizeDatabase() {
    try {
        showLoading("در حال بهینه‌سازی دیتابیس...");
        
        // 1. Vacuum deleted records
        const allCustomers = await dbManager.getAllCustomers(true);
        const activeCustomers = allCustomers.filter(c => !c.deleted);
        
        // 2. Re-save all active customers to compact the database
        for (const customer of activeCustomers) {
            await dbManager.saveCustomer(customer);
        }
        
        hideLoading();
        showNotification("دیتابیس با موفقیت بهینه‌سازی شد", "success");
        
        // 3. Refresh data
        await loadCustomersFromDB();
        renderCustomerList();
        updateStats();
        
    } catch (error) {
        hideLoading();
        console.error("خطا در بهینه‌سازی دیتابیس:", error);
        showNotification("خطا در بهینه‌سازی دیتابیس", "error");
    }
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
        
        // پاک کردن تمام مشتریان
        await dbManager.clearAllData();
        
        // پاک کردن آرایه مشتریان
        customers = [];
        currentIndex = null;
        
        // بارگذاری مجدد UI
        await loadCustomersFromDB();
        renderCustomerList();
        updateStats();
        
        hideLoading();
        showNotification("تمامی داده‌ها با موفقیت پاک شدند", "success");
        
        if (document.getElementById("profilePage").style.display === "block") {
            backHome();
        }
        
    } catch (error) {
        hideLoading();
        console.error("خطا در پاک‌سازی داده‌ها:", error);
        showNotification("خطا در پاک‌سازی داده‌ها", "error");
    }
}

function advancedSearch() {
    const searchType = prompt("نوع جستجو:\n1. نام\n2. شماره تماس\n3. مدل یخن\n4. قیمت\n5. روز تحویل\nعدد مربوطه را وارد کنید:");
    
    if (!searchType) return;
    
    switch (searchType) {
        case '1':
            searchCustomer();
            break;
        case '2':
            const phone = prompt("شماره تماس را وارد کنید:");
            if (phone) {
                document.getElementById("searchInput").value = phone;
                searchCustomer();
            }
            break;
        case '3':
            const yakhunModel = prompt("مدل یخن را انتخاب کنید:\n" + AppConfig.YAKHUN_MODELS.join("\n"));
            if (yakhunModel) {
                performAdvancedSearch('yakhun', yakhunModel);
            }
            break;
        case '4':
            const priceRange = prompt("محدوده قیمت (مثلاً 1000-2000 یا >1500):");
            if (priceRange) {
                performPriceSearch(priceRange);
            }
            break;
        case '5':
            const deliveryDay = prompt("روز تحویل را انتخاب کنید:\nشنبه\nیکشنبه\nدوشنبه\nسه‌شنبه\nچهارشنبه\nپنجشنبه\nجمعه");
            if (deliveryDay) {
                performDeliverySearch(deliveryDay);
            }
            break;
        default:
            showNotification("گزینه نامعتبر", "warning");
    }
}

async function performAdvancedSearch(field, value) {
    try {
        showLoading("در حال جستجو...");
        const allCustomers = await dbManager.getAllCustomers();
        
        const results = allCustomers.filter(customer => {
            if (field === 'yakhun') {
                return customer.models && customer.models.yakhun === value;
            }
            return false;
        });
        
        hideLoading();
        renderSearchResults(results, value);
    } catch (error) {
        hideLoading();
        console.error("خطا در جستجوی پیشرفته:", error);
        showNotification("خطا در جستجو", "error");
    }
}

async function performPriceSearch(range) {
    try {
        showLoading("در حال جستجو...");
        const allCustomers = await dbManager.getAllCustomers();
        
        const results = allCustomers.filter(customer => {
            const price = customer.sewingPriceAfghani;
            if (!price) return false;
            
            if (range.includes('-')) {
                const [min, max] = range.split('-').map(Number);
                return price >= min && price <= max;
            } else if (range.startsWith('>')) {
                const min = Number(range.substring(1));
                return price > min;
            } else if (range.startsWith('<')) {
                const max = Number(range.substring(1));
                return price < max;
            }
            return false;
        });
        
        hideLoading();
        renderSearchResults(results, `قیمت: ${range}`);
    } catch (error) {
        hideLoading();
        console.error("خطا در جستجوی قیمت:", error);
        showNotification("خطا در جستجو", "error");
    }
}

async function performDeliverySearch(day) {
    try {
        showLoading("در حال جستجو...");
        const allCustomers = await dbManager.getAllCustomers();
        
        const results = allCustomers.filter(customer => {
            return customer.deliveryDay === day;
        });
        
        hideLoading();
        renderSearchResults(results, `روز تحویل: ${day}`);
    } catch (error) {
        hideLoading();
        console.error("خطا در جستجوی روز تحویل:", error);
        showNotification("خطا در جستجو", "error");
    }
}

function printLabels(index) {
    if (index < 0 || index >= customers.length) return;
    
    const customer = customers[index];
    
    // اطمینان از وجود مقادیر
    const yakhun = customer.models ? customer.models.yakhun || '-' : '-';
    const sleeve = customer.models ? customer.models.sleeve || '-' : '-';
    const deliveryDay = customer.deliveryDay || '-';
    const price = customer.sewingPriceAfghani ? customer.sewingPriceAfghani + ' افغانی' : '-';
    const height = customer.measurements ? customer.measurements.قد || '-' : '-';
    
    // Create print content
    const printContent = `
        <html>
            <head>
                <title>لیبل ${customer.name}</title>
                <style>
                    body { 
                        font-family: Tahoma, Arial, sans-serif; 
                        direction: rtl; 
                        padding: 20px; 
                        margin: 0;
                        background: white;
                    }
                    @page {
                        size: A4;
                        margin: 0;
                    }
                    .label { 
                        border: 2px solid #000; 
                        padding: 15px; 
                        margin: 10px auto; 
                        width: 300px;
                        page-break-inside: avoid;
                    }
                    .label-header { 
                        text-align: center; 
                        border-bottom: 1px solid #000; 
                        margin-bottom: 10px; 
                        padding-bottom: 5px; 
                    }
                    .label-row { 
                        margin: 8px 0; 
                        display: flex; 
                        justify-content: space-between;
                        font-size: 14px;
                    }
                    .label-row strong {
                        color: #333;
                    }
                    h3 {
                        margin: 0 0 5px 0;
                        color: #222;
                    }
                    h4 {
                        margin: 0;
                        color: #555;
                    }
                </style>
            </head>
            <body>
                <div class="label">
                    <div class="label-header">
                        <h3>${customer.name || 'بدون نام'}</h3>
                        <h4>${customer.phone || 'بدون شماره'}</h4>
                    </div>
                    <div class="label-row">
                        <strong>قد:</strong>
                        <span>${height}</span>
                    </div>
                    <div class="label-row">
                        <strong>یخن:</strong>
                        <span>${yakhun}</span>
                    </div>
                    <div class="label-row">
                        <strong>آستین:</strong>
                        <span>${sleeve}</span>
                    </div>
                    <div class="label-row">
                        <strong>تاریخ تحویل:</strong>
                        <span>${deliveryDay}</span>
                    </div>
                    <div class="label-row">
                        <strong>قیمت:</strong>
                        <span>${price}</span>
                    </div>
                    ${customer.notes ? `
                    <div class="label-row">
                        <strong>یادداشت:</strong>
                        <span style="max-width: 150px; text-align: left;">${customer.notes.substring(0, 50)}${customer.notes.length > 50 ? '...' : ''}</span>
                    </div>
                    ` : ''}
                </div>
            </body>
        </html>
    `;
    
    // Open print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
    
    showNotification("چاپ لیبل آغاز شد", "success");
}

// ========== KEYBOARD NAVIGATION ==========
function navigateFields(direction) {
    const inputs = document.querySelectorAll('.field-input[contenteditable="true"]');
    if (inputs.length === 0) return;
    
    currentFieldIndex += direction;
    
    if (currentFieldIndex < 0) {
        currentFieldIndex = inputs.length - 1;
    } else if (currentFieldIndex >= inputs.length) {
        currentFieldIndex = 0;
    }
    
    const input = inputs[currentFieldIndex];
    input.focus();
    
    // انتخاب متن داخل فیلد
    const range = document.createRange();
    range.selectNodeContents(input);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

// ========== INITIALIZATION ==========
async function initializeApp() {
    try {
        showLoading("در حال راه‌اندازی اپلیکیشن...");
        
        // Initialize database
        await dbManager.init();
        
        // Load customers
        await loadCustomersFromDB();
        
        // Load saved theme
        const savedTheme = await dbManager.getSettings('theme');
        if (savedTheme === 'light') {
            toggleLightMode();
        } else if (savedTheme === 'vivid') {
            toggleVividMode();
        } else {
            toggleDarkMode();
        }
        
        // Render initial UI
        renderCustomerList();
        await updateStats();
        
        // Setup event listeners
        const fileInput = document.getElementById("fileInput");
        if (fileInput) {
            fileInput.addEventListener("change", loadDataFromFile);
        }
        
        const customerNotes = document.getElementById("customerNotes");
        if (customerNotes) {
            customerNotes.addEventListener("input", function() {
                updateNotes(this.value);
            });
        }
        
        // Setup keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            // Ctrl+S to save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveCustomerToDB();
            }
            
            // Escape to go back
            if (e.key === 'Escape' && document.getElementById("profilePage").style.display === "block") {
                backHome();
            }
            
            // Tab navigation in measurements
            if (e.key === 'Tab' && document.getElementById("profilePage").style.display === "block") {
                e.preventDefault();
                navigateFields(e.shiftKey ? -1 : 1);
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
        
        // هندلر برای بستن صفحه
        window.addEventListener('beforeunload', function(e) {
            if (currentIndex !== null) {
                // ذخیره نهایی
                debouncedSave();
            }
        });
        
        hideLoading();
        showNotification("اپلیکیشن ALFAJR آماده است", "success");
        
    } catch (error) {
        hideLoading();
        console.error("خطا در راه‌اندازی اپلیکیشن:", error);
        showNotification("خطا در راه‌اندازی اپلیکیشن", "error");
        
        // نمایش وضعیت اضطراری
        document.getElementById("customerList").innerHTML = `
            <div class="empty-state error">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطا در راه‌اندازی</h3>
                <p>لطفاً صفحه را رفرش کنید یا مرورگر را عوض کنید</p>
                <button onclick="location.reload()" style="margin-top: 10px;">
                    <i class="fas fa-redo"></i> رفرش صفحه
                </button>
            </div>
        `;
    }
}

// ========== START APPLICATION ==========
document.addEventListener('DOMContentLoaded', initializeApp);

// Export functions to global scope for HTML onclick events
window.addCustomer = addCustomer;
window.searchCustomer = searchCustomer;
window.advancedSearch = advancedSearch;
window.openProfile = openProfile;
window.openProfileFromSearch = openProfileFromSearch;
window.backHome = backHome;
window.saveCustomerToDB = saveCustomerToDB;
window.printLabels = printLabels;
window.addOrder = addOrder;
window.deleteCustomer = deleteCustomer;
window.updateNotes = updateNotes;
window.updateMeasurement = updateMeasurement;
window.toggleOptions = toggleOptions;
window.updateAfghaniPrice = updateAfghaniPrice;
window.togglePaymentReceived = togglePaymentReceived;
window.setDeliveryDay = setDeliveryDay;
window.saveDataToFile = saveDataToFile;
window.toggleDarkMode = toggleDarkMode;
window.toggleLightMode = toggleLightMode;
window.toggleVividMode = toggleVividMode;
window.optimizeDatabase = optimizeDatabase;
window.clearAllData = clearAllData;
