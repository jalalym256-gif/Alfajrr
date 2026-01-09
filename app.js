// ========== ALFAJR - سیستم مدیریت خیاطی ==========
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
let db = null;

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
        const customer = new Customer(obj.name, obj.phone);
        
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                customer[key] = obj[key];
            }
        }
        
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
            const request = indexedDB.open(AppConfig.DATABASE_NAME, AppConfig.DATABASE_VERSION);
            
            request.onerror = (event) => {
                console.error("خطا در باز کردن دیتابیس:", event.target.error);
                reject(event.target.error);
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isInitialized = true;
                console.log("دیتابیس باز شد");
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains(AppConfig.STORES.CUSTOMERS)) {
                    const customerStore = db.createObjectStore(AppConfig.STORES.CUSTOMERS, { 
                        keyPath: 'id'
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
        });
    }

    async getCustomer(id) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                reject("دیتابیس راه‌اندازی نشده");
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async saveCustomer(customer) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                reject("دیتابیس راه‌اندازی نشده");
                return;
            }
            
            customer.updatedAt = new Date().toISOString();
            customer.version = (customer.version || 0) + 1;
            
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
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const request = store.put(customer);
            
            request.onsuccess = () => resolve(customer);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getAllCustomers(includeDeleted = false) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                reject("دیتابیس راه‌اندازی نشده");
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                let customers = request.result;
                if (!includeDeleted) {
                    customers = customers.filter(c => !c.deleted);
                }
                
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
            
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async searchCustomers(query, field = 'name') {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                reject("دیتابیس راه‌اندازی نشده");
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const allCustomers = request.result;
                const results = allCustomers.filter(customer => {
                    if (customer.deleted) return false;
                    
                    if (field === 'name' || field === 'phone') {
                        return customer[field] && 
                               customer[field].toLowerCase().includes(query.toLowerCase());
                    }
                    
                    return Object.values(customer).some(value => 
                        value && typeof value === 'string' && 
                        value.toLowerCase().includes(query.toLowerCase())
                    );
                });
                resolve(results);
            };
            
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async deleteCustomer(id) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                reject("دیتابیس راه‌اندازی نشده");
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
                    
                    putRequest.onsuccess = () => resolve(true);
                    putRequest.onerror = (event) => reject(event.target.error);
                } else {
                    reject("مشتری یافت نشد");
                }
            };
            
            getRequest.onerror = (event) => reject(event.target.error);
        });
    }

    async getSettings(key) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                reject("دیتابیس راه‌اندازی نشده");
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.SETTINGS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.SETTINGS);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async saveSettings(key, value) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                reject("دیتابیس راه‌اندازی نشده");
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
            if (!this.isInitialized) {
                reject("دیتابیس راه‌اندازی نشده");
                return;
            }
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    close() {
        if (this.db) {
            this.db.close();
            this.isInitialized = false;
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

function showLoading(message = "در حال بارگذاری...") {
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

const debouncedSave = debounce(async () => {
    if (currentIndex !== null && currentIndex < customers.length) {
        try {
            await dbManager.saveCustomer(customers[currentIndex]);
            console.log("ذخیره خودکار");
        } catch (error) {
            console.error("خطا در ذخیره:", error);
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
        
        showNotification(`مشتری "${name}" اضافه شد`, "success");
        await loadCustomersFromDB();
        renderCustomerList();
        updateStats();
        
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
        showNotification("مشتری انتخاب نشده", "warning");
        return;
    }
    
    try {
        const customer = customers[currentIndex];
        await dbManager.saveCustomer(customer);
        showNotification("ذخیره شد", "success");
        updateStats();
    } catch (error) {
        console.error("خطا در ذخیره مشتری:", error);
        showNotification("خطا در ذخیره", "error");
    }
}

async function deleteCustomer(index) {
    if (index < 0 || index >= customers.length) return;
    
    const customer = customers[index];
    const customerName = customer.name;
    
    if (!confirm(`حذف مشتری "${customerName}"؟`)) return;
    
    try {
        await dbManager.deleteCustomer(customer.id);
        showNotification(`مشتری "${customerName}" حذف شد`, "success");
        await loadCustomersFromDB();
        backHome();
    } catch (error) {
        console.error("خطا در حذف مشتری:", error);
        showNotification("خطا در حذف", "error");
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
                <p>"${term}"</p>
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
                ${customer.notes ? '<br><small>' + 
                  (customer.notes.length > 50 ? customer.notes.substring(0, 50) + '...' : customer.notes) + '</small>' : ''}
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
        
        const customerObj = Customer.fromObject(customer);
        const index = customers.findIndex(c => c.id === customerId);
        
        if (index !== -1) {
            customers[index] = customerObj;
            currentIndex = index;
        } else {
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
                <tr>
                    <td style="font-weight:bold;">قد</td>
                    <td>
                        <div class="field-input" 
                             contenteditable="true" 
                             data-field="قد"
                             oninput="updateMeasurement('قد', this.innerText.trim())">
                            ${customer.measurements.قد || ''}
                        </div>
                    </td>
                </tr>
                
                <tr>
                    <td style="font-weight:bold;">شانه</td>
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
                
                <tr>
                    <td style="font-weight:bold;">آستین</td>
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
                
                ${['بغل', 'دامن', 'گردن', 'دور_سینه', 'شلوار', 'دم_پاچه', 'چاک_پتی'].map(field => `
                <tr>
                    <td style="font-weight:bold;">${getFieldLabel(field)}</td>
                    <td>
                        <div class="field-input" 
                             contenteditable="true" 
                             data-field="${field}"
                             oninput="updateMeasurement('${field}', this.innerText.trim())">
                            ${customer.measurements[field] || ''}
                        </div>
                    </td>
                </tr>
                `).join('')}
                
                <tr>
                    <td style="font-weight:bold;">خشتک</td>
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
                
                <tr>
                    <td style="font-weight:bold;">سفارش</td>
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
        "بغل": "بغل",
        "دامن": "دامن",
        "گردن": "گردن",
        "دور_سینه": "دور سینه",
        "شلوار": "شلوار",
        "دم_پاچه": "دم پاچه",
        "چاک_پتی": "چاک پتی"
    };
    
    return labels[field] || field;
}

function updateMeasurement(field, val) {
    if (currentIndex === null || currentIndex >= customers.length) return;
    
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
    
    if (!cust.models) {
        cust.models = {
            yakhun: "",
            sleeve: "",
            skirt: [],
            features: []
        };
    }
    
    // یخن
    const yakhunContainer = document.getElementById('yakhunOptions');
    if (yakhunContainer) {
        yakhunContainer.innerHTML = '';
        AppConfig.YAKHUN_MODELS.forEach(opt => {
            const div = document.createElement('div');
            div.className = `model-option ${opt === cust.models.yakhun ? 'selected' : ''}`;
            div.textContent = opt;
            div.onclick = () => {
                cust.models.yakhun = opt;
                showNotification(`مدل یخن: ${opt}`, "success");
                debouncedSave();
                updateSelectedModelTexts(index);
                yakhunContainer.style.display = 'none';
            };
            yakhunContainer.appendChild(div);
        });
    }
    
    // آستین
    const sleeveContainer = document.getElementById('sleeveOptions');
    if (sleeveContainer) {
        sleeveContainer.innerHTML = '';
        AppConfig.SLEEVE_MODELS.forEach(opt => {
            const div = document.createElement('div');
            div.className = `model-option ${opt === cust.models.sleeve ? 'selected' : ''}`;
            div.textContent = opt;
            div.onclick = () => {
                cust.models.sleeve = opt;
                showNotification(`مدل آستین: ${opt}`, "success");
                debouncedSave();
                updateSelectedModelTexts(index);
                sleeveContainer.style.display = 'none';
            };
            sleeveContainer.appendChild(div);
        });
    }
    
    // دامن
    const skirtContainer = document.getElementById('skirtOptions');
    if (skirtContainer) {
        skirtContainer.innerHTML = '';
        AppConfig.SKIRT_MODELS.forEach(opt => {
            const isSelected = cust.models.skirt && cust.models.skirt.includes(opt);
            const div = document.createElement('div');
            div.className = `multi-select-option ${isSelected ? 'selected' : ''}`;
            div.innerHTML = `<span>${opt}</span><div class="checkmark"></div>`;
            div.onclick = () => {
                if (!cust.models.skirt) cust.models.skirt = [];
                const foundIndex = cust.models.skirt.indexOf(opt);
                if (foundIndex > -1) {
                    cust.models.skirt.splice(foundIndex, 1);
                    showNotification(`حذف دامن: ${opt}`, "info");
                } else {
                    cust.models.skirt.push(opt);
                    showNotification(`افزودن دامن: ${opt}`, "success");
                }
                debouncedSave();
                updateSelectedModelTexts(index);
                div.classList.toggle('selected');
            };
            skirtContainer.appendChild(div);
        });
    }
    
    // ویژگی‌ها
    const featuresContainer = document.getElementById('featuresOptions');
    if (featuresContainer) {
        featuresContainer.innerHTML = '';
        AppConfig.FEATURES_LIST.forEach(opt => {
            const isSelected = cust.models.features && cust.models.features.includes(opt);
            const div = document.createElement('div');
            div.className = `multi-select-option ${isSelected ? 'selected' : ''}`;
            div.innerHTML = `<span>${opt}</span><div class="checkmark"></div>`;
            div.onclick = () => {
                if (!cust.models.features) cust.models.features = [];
                const foundIndex = cust.models.features.indexOf(opt);
                if (foundIndex > -1) {
                    cust.models.features.splice(foundIndex, 1);
                    showNotification(`حذف ویژگی: ${opt}`, "info");
                } else {
                    cust.models.features.push(opt);
                    showNotification(`افزودن ویژگی: ${opt}`, "success");
                }
                debouncedSave();
                updateSelectedModelTexts(index);
                div.classList.toggle('selected');
            };
            featuresContainer.appendChild(div);
        });
    }
}

function updateSelectedModelTexts(index) {
    if (index < 0 || index >= customers.length) return;
    
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
        <h4><i class="fas fa-money-bill-wave"></i> قیمت و تحویل</h4>
        
        <div class="price-input-group">
            <label class="price-label">
                <i class="fas fa-money-bill"></i>
                قیمت دوخت (افغانی):
            </label>
            <div class="price-input-wrapper">
                <input type="number" 
                       id="sewingPriceAfghani" 
                       placeholder="مبلغ"
                       value="${customer.sewingPriceAfghani || ''}"
                       oninput="updateAfghaniPrice(${index}, this.value)">
                <span class="price-unit">افغانی</span>
            </div>
        </div>
        
        <div class="payment-status-section">
            <div class="payment-toggle">
                <div class="payment-checkbox ${customer.paymentReceived ? 'checked' : ''}" 
                     onclick="togglePaymentReceived(${index})">
                    <div class="checkbox-display ${customer.paymentReceived ? 'checked' : ''}"></div>
                    <span style="font-weight: bold; color: ${customer.paymentReceived ? 'green' : 'gray'}">
                        ${customer.paymentReceived ? 'پول رسید شد' : 'پول نرسید'}
                    </span>
                </div>
            </div>
            
            ${customer.paymentReceived && customer.paymentDate ? `
            <div style="margin-top: 10px; padding: 8px; background: #e8f5e8; border-radius: 6px; text-align: center; font-size: 13px;">
                <i class="fas fa-calendar-check" style="color: green; margin-left: 5px;"></i>
                تاریخ: ${new Date(customer.paymentDate).toLocaleDateString('fa-IR')}
            </div>
            ` : ''}
        </div>
        
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
    showNotification(`روز تحویل: ${day}`, "success");
}

// ========== ORDER MANAGEMENT ==========
function addOrder(index) {
    if (index < 0 || index >= customers.length) return;
    
    const orderDetails = prompt("جزئیات سفارش:");
    if (!orderDetails || orderDetails.trim() === "") return;
    
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
    showNotification("سفارش اضافه شد", "success");
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
                <h4>هیچ سفارشی</h4>
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
                <h3>مشتری وجود ندارد</h3>
                <p>دکمه "مشتری جدید" را بزنید</p>
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
                ${customer.notes ? '<br><small>' + 
                  (customer.notes.length > 50 ? customer.notes.substring(0, 50) + '...' : customer.notes) + '</small>' : ''}
            </div>
            <button onclick="openProfile(${i})">
                <i class="fas fa-user-circle"></i> مشاهده
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
        
        const dbSize = 0; // می‌توانید محاسبه کنید
        
        document.getElementById("totalCustomers").textContent = totalCustomers;
        document.getElementById("activeOrders").textContent = activeOrders;
        document.getElementById("dbSize").textContent = formatBytes(dbSize);
    } catch (error) {
        console.error("خطا در آمار:", error);
    }
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
        
        showNotification("داده‌ها ذخیره شد", "success");
    } catch (error) {
        console.error("خطا در ذخیره فایل:", error);
        showNotification("خطا در ذخیره", "error");
    }
}

function loadDataFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            showLoading("در حال بارگذاری...");
            const customersData = JSON.parse(e.target.result);
            
            if (!Array.isArray(customersData)) {
                throw new Error("فرمت فایل نامعتبر");
            }
            
            let importedCount = 0;
            for (const customerData of customersData) {
                if (customerData.deleted) continue;
                
                const customer = Customer.fromObject(customerData);
                await dbManager.saveCustomer(customer);
                importedCount++;
            }
            
            hideLoading();
            showNotification(`${importedCount} مشتری وارد شد`, "success");
            
            await loadCustomersFromDB();
            renderCustomerList();
            updateStats();
            
            event.target.value = '';
            
        } catch (error) {
            hideLoading();
            console.error("خطا در بارگذاری:", error);
            showNotification("خطا در بارگذاری: " + error.message, "error");
        }
    };
    
    reader.readAsText(file);
}

function toggleDarkMode() {
    document.body.classList.remove('light-mode', 'vivid-mode');
    document.body.classList.add('dark-mode');
    isDarkMode = true;
    dbManager.saveSettings('theme', 'dark');
    showNotification("حالت تاریک", "success");
}

function toggleLightMode() {
    document.body.classList.remove('dark-mode', 'vivid-mode');
    document.body.classList.add('light-mode');
    isDarkMode = false;
    dbManager.saveSettings('theme', 'light');
    showNotification("حالت روشن", "success");
}

function toggleVividMode() {
    document.body.classList.remove('dark-mode', 'light-mode');
    document.body.classList.add('vivid-mode');
    isDarkMode = false;
    dbManager.saveSettings('theme', 'vivid');
    showNotification("حالت ویوید", "success");
}

async function optimizeDatabase() {
    try {
        showLoading("در حال بهینه‌سازی...");
        
        const allCustomers = await dbManager.getAllCustomers(true);
        const activeCustomers = allCustomers.filter(c => !c.deleted);
        
        for (const customer of activeCustomers) {
            await dbManager.saveCustomer(customer);
        }
        
        hideLoading();
        showNotification("بهینه‌سازی شد", "success");
        
        await loadCustomersFromDB();
        renderCustomerList();
        updateStats();
        
    } catch (error) {
        hideLoading();
        console.error("خطا در بهینه‌سازی:", error);
        showNotification("خطا در بهینه‌سازی", "error");
    }
}

async function clearAllData() {
    if (!confirm("⚠️ تمام داده‌ها پاک می‌شود!\nادامه می‌دهید؟")) return;
    
    if (!confirm("❌ این عمل غیرقابل بازگشت است!\nمطمئن هستید؟")) return;
    
    try {
        showLoading("در حال پاک‌سازی...");
        
        await dbManager.clearAllData();
        
        customers = [];
        currentIndex = null;
        
        await loadCustomersFromDB();
        renderCustomerList();
        updateStats();
        
        hideLoading();
        showNotification("تمامی داده‌ها پاک شد", "success");
        
        if (document.getElementById("profilePage").style.display === "block") {
            backHome();
        }
        
    } catch (error) {
        hideLoading();
        console.error("خطا در پاک‌سازی:", error);
        showNotification("خطا در پاک‌سازی", "error");
    }
}

function advancedSearch() {
    const searchType = prompt("نوع جستجو:\n1. نام\n2. شماره\n3. مدل یخن\n4. قیمت\n5. روز تحویل\nعدد را وارد کنید:");
    
    if (!searchType) return;
    
    switch (searchType) {
        case '1':
            searchCustomer();
            break;
        case '2':
            const phone = prompt("شماره:");
            if (phone) {
                document.getElementById("searchInput").value = phone;
                searchCustomer();
            }
            break;
        case '3':
            const yakhunModel = prompt("مدل یخن:\n" + AppConfig.YAKHUN_MODELS.join("\n"));
            if (yakhunModel) {
                performAdvancedSearch('yakhun', yakhunModel);
            }
            break;
        case '4':
            const priceRange = prompt("محدوده قیمت (مثلاً 1000-2000):");
            if (priceRange) {
                performPriceSearch(priceRange);
            }
            break;
        case '5':
            const deliveryDay = prompt("روز تحویل:\nشنبه\nیکشنبه\nدوشنبه\nسه‌شنبه\nچهارشنبه\nپنجشنبه\nجمعه");
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
        showLoading("جستجو...");
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
        console.error("خطا در جستجو:", error);
        showNotification("خطا در جستجو", "error");
    }
}

async function performPriceSearch(range) {
    try {
        showLoading("جستجو...");
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
        console.error("خطا در جستجو:", error);
        showNotification("خطا در جستجو", "error");
    }
}

async function performDeliverySearch(day) {
    try {
        showLoading("جستجو...");
        const allCustomers = await dbManager.getAllCustomers();
        
        const results = allCustomers.filter(customer => {
            return customer.deliveryDay === day;
        });
        
        hideLoading();
        renderSearchResults(results, `تحویل: ${day}`);
    } catch (error) {
        hideLoading();
        console.error("خطا در جستجو:", error);
        showNotification("خطا در جستجو", "error");
    }
}

function printLabels(index) {
    if (index < 0 || index >= customers.length) return;
    
    const customer = customers[index];
    
    const yakhun = customer.models ? customer.models.yakhun || '-' : '-';
    const sleeve = customer.models ? customer.models.sleeve || '-' : '-';
    const deliveryDay = customer.deliveryDay || '-';
    const price = customer.sewingPriceAfghani ? customer.sewingPriceAfghani + ' افغانی' : '-';
    const height = customer.measurements ? customer.measurements.قد || '-' : '-';
    
    const printContent = `
        <html>
            <head>
                <title>لیبل ${customer.name}</title>
                <style>
                    body { font-family: Tahoma; direction: rtl; padding: 20px; }
                    .label { border: 2px solid #000; padding: 15px; margin: 10px; width: 300px; }
                    .label-header { text-align: center; border-bottom: 1px solid #000; margin-bottom: 10px; padding-bottom: 5px; }
                    .label-row { margin: 8px 0; display: flex; justify-content: space-between; }
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
                        <strong>تحویل:</strong>
                        <span>${deliveryDay}</span>
                    </div>
                    <div class="label-row">
                        <strong>قیمت:</strong>
                        <span>${price}</span>
                    </div>
                </div>
            </body>
        </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
    
    showNotification("چاپ لیبل", "success");
}

// ========== INITIALIZATION ==========
async function initializeApp() {
    try {
        showLoading("راه‌اندازی ALFAJR...");
        
        // Initialize database
        await dbManager.init();
        
        // Load customers
        await loadCustomersFromDB();
        
        // Load theme
        const savedTheme = await dbManager.getSettings('theme');
        if (savedTheme === 'light') {
            toggleLightMode();
        } else if (savedTheme === 'vivid') {
            toggleVividMode();
        } else {
            toggleDarkMode();
        }
        
        // Render UI
        renderCustomerList();
        await updateStats();
        
        // Event listeners
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
        
        // Keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveCustomerToDB();
            }
            
            if (e.key === 'Escape' && document.getElementById("profilePage").style.display === "block") {
                backHome();
            }
            
            if (e.key === 'Tab' && document.getElementById("profilePage").style.display === "block") {
                e.preventDefault();
                // navigate fields if needed
            }
            
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                const searchInput = document.getElementById("searchInput");
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            }
        });
        
        // Before unload
        window.addEventListener('beforeunload', function(e) {
            if (currentIndex !== null) {
                debouncedSave();
            }
        });
        
        // PWA Install Prompt
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            setTimeout(() => {
                if (deferredPrompt && !document.getElementById('installBtn')) {
                    const btn = document.createElement('button');
                    btn.id = 'installBtn';
                    btn.innerHTML = '📲 نصب اپ';
                    btn.style.cssText = `
                        position: fixed;
                        bottom: 20px;
                        left: 20px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 50px;
                        font-weight: bold;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                        z-index: 9999;
                        cursor: pointer;
                    `;
                    btn.onclick = async () => {
                        if (!deferredPrompt) return;
                        deferredPrompt.prompt();
                        const { outcome } = await deferredPrompt.userChoice;
                        if (outcome === 'accepted') {
                            showNotification('✅ اپ نصب شد!', 'success');
                        }
                        btn.style.display = 'none';
                        deferredPrompt = null;
                    };
                    document.body.appendChild(btn);
                }
            }, 3000);
        });
        
        hideLoading();
        showNotification("ALFAJR آماده است", "success");
        
    } catch (error) {
        hideLoading();
        console.error("خطا در راه‌اندازی:", error);
        showNotification("خطا در راه‌اندازی", "error");
        
        document.getElementById("customerList").innerHTML = `
            <div class="empty-state error">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطا در راه‌اندازی</h3>
                <button onclick="location.reload()" style="margin-top: 10px;">
                    <i class="fas fa-redo"></i> رفرش
                </button>
            </div>
        `;
    }
}

// ========== START APPLICATION ==========
// Global exports برای HTML onclick
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

// Start when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
