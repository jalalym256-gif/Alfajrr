// ========== ALFAJR TAILORING MANAGEMENT SYSTEM ==========
// Version 3.0 - Complete Production Ready
// Phone: 0799799009

// ========== CONFIGURATION ==========
const AppConfig = {
    DATABASE_NAME: 'ALFAJR_DB_V3',
    DATABASE_VERSION: 3,
    STORES: {
        CUSTOMERS: 'customers',
        SETTINGS: 'settings'
    },
    MEASUREMENT_FIELDS: [
        "قد", "شانه_یک", "شانه_دو", "آستین_یک", "آستین_دو", "آستین_سه",
        "بغل", "دامن", "گردن", "دور_سینه", "شلوار", "دم_پاچه",
        "بر_تمبان", "خشتک", "چاک_پتی", "تعداد_سفارش", "مقدار_تکه"
    ],
    YAKHUN_MODELS: ["آف دار", "چپه یخن", "پاکستانی", "ملی", "شهبازی", "خامک", "قاسمی"],
    SLEEVE_MODELS: ["کفک", "ساده شیش بخیه", "بندک", "پر بخیه", "آف دار", "لایی یک انچ"],
    SKIRT_MODELS: ["دامن یک بخیه", "دامن دوبخیه", "دامن چهارکنج", "دامن ترخیز", "دامن گاوی"],
    FEATURES_LIST: ["جیب رو", "جیب شلوار", "یک بخیه سند", "دو بخیه سند", "مکمل دو بخیه"],
    DAYS_OF_WEEK: ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]
};

// ========== GLOBAL VARIABLES ==========
let customers = [];
let currentCustomerIndex = null;
let dbManager = null;
let currentTheme = 'dark';
let saveTimeout = null;

// ========== CUSTOMER CLASS ==========
class Customer {
    constructor(name, phone) {
        this.id = this.generateUniqueId();
        this.name = name || '';
        this.phone = phone || '';
        this.notes = '';
        this.measurements = this.createEmptyMeasurements();
        this.models = {
            yakhun: '',
            sleeve: '',
            skirt: [],
            features: []
        };
        this.sewingPriceAfghani = null;
        this.deliveryDay = '';
        this.paymentReceived = false;
        this.paymentDate = null;
        this.orders = [];
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
        this.deleted = false;
    }

    generateUniqueId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 9);
        return `CUST_${timestamp}_${random}`.toUpperCase();
    }

    createEmptyMeasurements() {
        const measurements = {};
        AppConfig.MEASUREMENT_FIELDS.forEach(field => {
            measurements[field] = '';
        });
        return measurements;
    }

    static fromObject(obj) {
        if (!obj || typeof obj !== 'object') {
            console.warn('Invalid customer data:', obj);
            return new Customer('', '');
        }
        
        const customer = new Customer(obj.name || '', obj.phone || '');
        
        // Copy all properties except id, name, phone (already set)
        Object.keys(obj).forEach(key => {
            if (!['id', 'name', 'phone'].includes(key)) {
                try {
                    customer[key] = obj[key];
                } catch (e) {
                    console.warn(`Error copying property ${key}:`, e);
                }
            }
        });
        
        // Ensure arrays exist and are arrays
        if (!Array.isArray(customer.orders)) customer.orders = [];
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
        if (!customer.measurements) customer.measurements = customer.createEmptyMeasurements();
        
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

            const request = indexedDB.open(AppConfig.DATABASE_NAME, AppConfig.DATABASE_VERSION);
            
            request.onerror = (event) => {
                console.error('Database open error:', event.target.error);
                reject(event.target.error);
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isInitialized = true;
                console.log('Database initialized successfully');
                this.updateDatabaseStatus(true);
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('Database upgrade needed:', event.oldVersion, '→', event.newVersion);
                
                // Create or upgrade stores
                if (!db.objectStoreNames.contains(AppConfig.STORES.CUSTOMERS)) {
                    const store = db.createObjectStore(AppConfig.STORES.CUSTOMERS, { keyPath: 'id' });
                    store.createIndex('name', 'name', { unique: false });
                    store.createIndex('phone', 'phone', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('deleted', 'deleted', { unique: false });
                    console.log('Customers store created');
                }
                
                if (!db.objectStoreNames.contains(AppConfig.STORES.SETTINGS)) {
                    db.createObjectStore(AppConfig.STORES.SETTINGS, { keyPath: 'key' });
                    console.log('Settings store created');
                }
            };
            
            request.onblocked = () => {
                console.error('Database blocked by other tab');
                alert('دیتابیس توسط تب دیگری قفل شده است. لطفاً سایر تب‌ها را ببندید.');
                reject(new Error('Database blocked'));
            };
        });
    }

    updateDatabaseStatus(connected) {
        const statusElement = document.getElementById('dbStatus');
        if (statusElement) {
            if (connected) {
                statusElement.innerHTML = '<i class="fas fa-database"></i> متصل';
                statusElement.className = 'db-status connected';
            } else {
                statusElement.innerHTML = '<i class="fas fa-database"></i> قطع';
                statusElement.className = 'db-status disconnected';
            }
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
            
            customer.updatedAt = new Date().toISOString();
            
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            
            const request = store.put(customer);
            
            request.onsuccess = () => {
                console.log('Customer saved:', customer.name, customer.id);
                resolve(customer);
            };
            
            request.onerror = (event) => {
                console.error('Error saving customer:', event.target.error);
                reject(event.target.error);
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
                
                // Convert to Customer objects
                const customerObjects = customers.map(c => {
                    try {
                        return Customer.fromObject(c);
                    } catch (error) {
                        console.error('Error converting customer:', error, c);
                        return null;
                    }
                }).filter(c => c !== null);
                
                // Sort by creation date (newest first)
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
                    putRequest.onsuccess = () => resolve(true);
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
                    
                    // Search in multiple fields
                    const searchFields = [
                        customer.name,
                        customer.phone,
                        customer.notes,
                        customer.id,
                        customer.models?.yakhun,
                        customer.models?.sleeve,
                        customer.deliveryDay
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
                resolve();
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }
}

// ========== UI HELPER FUNCTIONS ==========
function showNotification(message, type = 'info', duration = 3000) {
    // Remove existing notification if any
    const existingNotification = document.getElementById('globalNotification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create new notification
    const notification = document.createElement('div');
    notification.id = 'globalNotification';
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        color: white;
        font-family: Tahoma, Arial, sans-serif;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        font-size: 14px;
        transition: all 0.3s;
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    
    // Set colors based on type
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    
    notification.style.backgroundColor = colors[type] || colors.info;
    
    // Add icon
    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ'
    };
    
    notification.innerHTML = `
        <span style="font-size: 16px;">${icons[type] || 'ℹ'}</span>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Auto hide after duration
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100px)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
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
            background: rgba(0, 0, 0, 0.85);
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
            width: 60px;
            height: 60px;
            border: 5px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: #0fceff;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        `;

        const text = document.createElement('div');
        text.id = 'loadingText';
        text.style.cssText = `
            font-size: 18px;
            text-align: center;
            max-width: 80%;
        `;
        text.textContent = message;

        // Add animation style
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
    } else {
        overlay.style.display = 'flex';
        document.getElementById('loadingText').textContent = message;
    }
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

// ========== CUSTOMER MANAGEMENT ==========
async function addCustomer() {
    const name = prompt('نام مشتری را وارد کنید:');
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
        showLoading('در حال اضافه کردن مشتری...');
        const customer = new Customer(name.trim(), phone.trim());
        await dbManager.saveCustomer(customer);
        
        // Reload customers
        await loadCustomers();
        
        // Find and open the new customer
        const index = customers.findIndex(c => c.id === customer.id);
        if (index !== -1) {
            openProfile(index);
        }
        
        hideLoading();
        showNotification(`مشتری "${name}" با موفقیت اضافه شد`, 'success');
    } catch (error) {
        hideLoading();
        console.error('Error adding customer:', error);
        showNotification('خطا در اضافه کردن مشتری', 'error');
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
        renderCustomerList(); // Render empty list anyway
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
        
        html += `
            <div class="customer-item" onclick="openProfile(${index})">
                <div class="customer-info">
                    <div class="customer-header">
                        <span class="customer-id">${customer.id.substring(0, 8)}</span>
                        <span class="customer-date">${formattedDate}</span>
                    </div>
                    <h4>${customer.name || 'بدون نام'}</h4>
                    <p class="customer-phone">${customer.phone || 'بدون شماره'}</p>
                    ${customer.notes ? `<p class="customer-notes">${customer.notes.substring(0, 50)}${customer.notes.length > 50 ? '...' : ''}</p>` : ''}
                </div>
                <div class="customer-status">
                    ${hasPrice ? `<span class="price-badge">${formatPrice(customer.sewingPriceAfghani)} افغانی</span>` : ''}
                    ${isPaid ? '<span class="paid-badge">پرداخت شده</span>' : ''}
                    ${deliveryDay ? `<span class="delivery-badge">${deliveryDay}</span>` : ''}
                    <button class="delete-btn" onclick="event.stopPropagation(); deleteCustomer(${index})">
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
                </div>
            `;
            hideLoading();
            return;
        }

        let html = '';
        results.forEach((customer, index) => {
            const realIndex = customers.findIndex(c => c.id === customer.id);
            html += `
                <div class="customer-item search-result" onclick="openProfile(${realIndex})">
                    <div class="customer-info">
                        <h4>${customer.name || 'بدون نام'}</h4>
                        <p class="customer-phone">${customer.phone || 'بدون شماره'}</p>
                    </div>
                    <span class="search-tag">نتیجه جستجو</span>
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
    if (!confirm(`آیا از حذف "${customerName}" مطمئن هستید؟`)) return;
    
    try {
        showLoading('در حال حذف مشتری...');
        await dbManager.deleteCustomer(customer.id);
        await loadCustomers();
        
        // If we're on profile page, go back home
        if (document.getElementById('profilePage').style.display === 'block') {
            backHome();
        }
        
        hideLoading();
        showNotification('مشتری حذف شد', 'success');
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

    // Update basic info
    document.getElementById('profileName').textContent = customer.name || 'بدون نام';
    document.getElementById('profilePhone').textContent = customer.phone || 'بدون شماره';
    document.getElementById('profileId').textContent = `کد: ${customer.id.substring(0, 8)}`;
    
    // Update notes
    const notesElement = document.getElementById('customerNotes');
    if (notesElement) {
        notesElement.value = customer.notes || '';
    }

    // Render all sections
    renderMeasurements();
    renderModels();
    renderOrders();
    renderPriceDelivery();

    // Show profile page
    document.getElementById('homePage').style.display = 'none';
    document.getElementById('profilePage').style.display = 'block';

    // Add print buttons
    setTimeout(addPrintButtons, 100);
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
    customer.notes = notesElement.value;
    saveCustomer();
}

function saveCustomer() {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    if (!customer) return;
    
    // Update from UI elements
    const notesElement = document.getElementById('customerNotes');
    if (notesElement) {
        customer.notes = notesElement.value;
    }
    
    // Update measurements from inputs
    const measurementInputs = document.querySelectorAll('.measurement-input');
    measurementInputs.forEach(input => {
        const field = input.dataset.field;
        if (field) {
            customer.measurements[field] = input.value;
        }
    });
    
    // Update price
    const priceInput = document.getElementById('sewingPrice');
    if (priceInput) {
        customer.sewingPriceAfghani = priceInput.value ? parseInt(priceInput.value) : null;
    }
    
    // Auto-save with debounce
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await dbManager.saveCustomer(customer);
            console.log('Auto-saved customer:', customer.name);
        } catch (error) {
            console.error('Error auto-saving:', error);
        }
    }, 1000);
}

// ========== MEASUREMENTS ==========
function renderMeasurements() {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    const container = document.getElementById('measurementsContainer');
    if (!container) return;

    let html = `
        <div class="section-header">
            <h3><i class="fas fa-ruler-combined"></i> اندازه‌گیری‌ها</h3>
        </div>
        <div class="measurements-grid">
    `;

    // Define measurement groups
    const groups = [
        {
            title: 'قد',
            fields: [{key: 'قد', label: 'قد (سانتی‌متر)', placeholder: '170'}]
        },
        {
            title: 'شانه',
            fields: [
                {key: 'شانه_یک', label: 'شانه یک', placeholder: '45'},
                {key: 'شانه_دو', label: 'شانه دو', placeholder: '45'}
            ]
        },
        {
            title: 'آستین',
            fields: [
                {key: 'آستین_یک', label: 'آستین یک', placeholder: '60'},
                {key: 'آستین_دو', label: 'آستین دو', placeholder: '25'},
                {key: 'آستین_سه', label: 'آستین سه', placeholder: '15'}
            ]
        },
        {
            title: 'بدنه',
            fields: [
                {key: 'بغل', label: 'بغل', placeholder: '50'},
                {key: 'دامن', label: 'دامن', placeholder: '100'},
                {key: 'گردن', label: 'گردن', placeholder: '40'},
                {key: 'دور سینه', label: 'دور سینه', placeholder: '100'}
            ]
        },
        {
            title: 'شلوار',
            fields: [
                {key: 'شلوار', label: 'شلوار', placeholder: '110'},
                {key: 'دم_پاچه', label: 'دم پاچه', placeholder: '22'}
            ]
        },
        {
            title: 'سایر',
            fields: [
                {key: 'بر_تمبان', label: 'بر تهمان (ب)', placeholder: '40'},
                {key: 'خشتک', label: 'خشتک (خ)', placeholder: '25'},
                {key: 'چاک_پتی', label: 'چاک پتی', placeholder: '30'}
            ]
        },
        {
            title: 'سفارش',
            fields: [
                {key: 'تعداد_سفارش', label: 'تعداد سفارش', placeholder: '1'},
                {key: 'مقدار_تکه', label: 'مقدار تکه', placeholder: '2'}
            ]
        }
    ];

    groups.forEach(group => {
        html += `<div class="measurement-group">`;
        html += `<h4>${group.title}</h4>`;
        html += `<div class="measurement-fields">`;
        
        group.fields.forEach(field => {
            const value = customer.measurements[field.key] || '';
            html += `
                <div class="measurement-field">
                    <label>${field.label}</label>
                    <input type="number" 
                           class="measurement-input" 
                           data-field="${field.key}"
                           value="${value}"
                           placeholder="${field.placeholder}"
                           oninput="updateMeasurement('${field.key}', this.value)"
                           step="0.5"
                           min="0">
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
    
    customer.measurements[field] = value;
    saveCustomer();
}

// ========== MODELS ==========
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

    // Yakhun Models
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

    // Sleeve Models
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

    // Skirt Models (multi-select)
    html += `
        <div class="model-category">
            <h4><i class="fas fa-venus"></i> مدل دامن</h4>
            <div class="model-options multi-select">
    `;
    
    AppConfig.SKIRT_MODELS.forEach(model => {
        const isSelected = customer.models.skirt && customer.models.skirt.includes(model);
        html += `
            <div class="model-option ${isSelected ? 'selected' : ''}" 
                 onclick="toggleMultiSelect('skirt', '${model}')">
                ${model}
                <span class="checkmark">${isSelected ? '✓' : ''}</span>
            </div>
        `;
    });
    
    html += `</div></div>`;

    // Features (multi-select)
    html += `
        <div class="model-category">
            <h4><i class="fas fa-star"></i> ویژگی‌ها</h4>
            <div class="model-options multi-select">
    `;
    
    AppConfig.FEATURES_LIST.forEach(feature => {
        const isSelected = customer.models.features && customer.models.features.includes(feature);
        html += `
            <div class="model-option ${isSelected ? 'selected' : ''}" 
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
    customer.models[type] = model;
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
        customer.models[type].push(value);
        showNotification(`"${value}" اضافه شد`, 'success');
    }
    
    // Re-render the section
    renderModels();
    saveCustomer();
}

// ========== PRICE & DELIVERY ==========
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
            </div>
            
            <div class="payment-section">
                <h4><i class="fas fa-check-circle"></i> وضعیت پرداخت</h4>
                <div class="payment-toggle" onclick="togglePayment()">
                    <div class="payment-checkbox ${customer.paymentReceived ? 'checked' : ''}">
                        <div class="checkbox-icon">${customer.paymentReceived ? '✓' : ''}</div>
                        <span>${customer.paymentReceived ? 'پرداخت شده' : 'پرداخت نشده'}</span>
                    </div>
                    ${customer.paymentReceived && customer.paymentDate ? 
                        `<div class="payment-date">${new Date(customer.paymentDate).toLocaleDateString('fa-IR')}</div>` : ''}
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
    showNotification(`وضعیت پرداخت تغییر کرد`, 'success');
}

function setDeliveryDay(day) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    customer.deliveryDay = day;
    renderPriceDelivery();
    saveCustomer();
    showNotification(`روز تحویل به ${day} تنظیم شد`, 'success');
}

// ========== ORDERS ==========
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
                    <div class="order-header">
                        <span class="order-number">سفارش #${index + 1}</span>
                        <span class="order-date">${date.toLocaleDateString('fa-IR')}</span>
                    </div>
                    <div class="order-details">${order.details || 'بدون توضیحات'}</div>
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
    
    const details = prompt('جزئیات سفارش جدید را وارد کنید:');
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
        details: details.trim(),
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
    
    const printContent = `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
    <meta charset="UTF-8">
    <title>لیبل اندازه‌گیری ALFAJR</title>
    <style>
        @page { size: 80mm auto; margin: 0; }
        body { width: 80mm; padding: 2mm; font-family: Tahoma; font-size: 11px; }
        .label { border: 2px solid #000; padding: 3mm; border-radius: 3px; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 2mm; margin-bottom: 3mm; }
        .shop-name { font-size: 16px; font-weight: bold; }
        .customer-info { text-align: center; margin: 3mm 0; padding: 2mm; background: #f8f9fa; }
        .customer-name { font-size: 14px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; margin: 3mm 0; }
        td { border: 1px solid #000; padding: 2mm; text-align: center; }
        .label-cell { font-weight: bold; background: #f0f0f0; }
        .footer { text-align: center; margin-top: 3mm; padding-top: 2mm; border-top: 1px solid #ccc; font-size: 9px; }
    </style>
</head>
<body>
    <div class="label">
        <div class="header">
            <div class="shop-name">ALFAJR خیاطی</div>
            <div>۰۷۹۹۷۹۹۰۰۹</div>
        </div>
        
        <div class="customer-info">
            <div class="customer-name">${customer.name || 'بدون نام'}</div>
            <div>${customer.phone || 'بدون شماره'}</div>
        </div>
        
        <table>
            <tr><td class="label-cell">قد</td><td>${customer.measurements.قد || '-'} سانت</td></tr>
            <tr><td class="label-cell">شانه</td><td>${customer.measurements.شانه_یک || '-'} / ${customer.measurements.شانه_دو || '-'}</td></tr>
            <tr><td class="label-cell">آستین</td><td>${customer.measurements.آستین_یک || '-'} / ${customer.measurements.آستین_دو || '-'} / ${customer.measurements.آستین_سه || '-'}</td></tr>
            <tr><td class="label-cell">بغل</td><td>${customer.measurements.بغل || '-'}</td></tr>
            <tr><td class="label-cell">دامن</td><td>${customer.measurements.دامن || '-'}</td></tr>
            <tr><td class="label-cell">گردن</td><td>${customer.measurements.گردن || '-'}</td></tr>
            <tr><td class="label-cell">دور سینه</td><td>${customer.measurements.dور_سینه || '-'}</td></tr>
            <tr><td class="label-cell">شلوار</td><td>${customer.measurements.شلوار || '-'}</td></tr>
            <tr><td class="label-cell">دم پاچه</td><td>${customer.measurements.دم_پاچه || '-'}</td></tr>
            <tr><td class="label-cell">ب / خ</td><td>${customer.measurements.بر_تمبان || '-'} / ${customer.measurements.خشتک || '-'}</td></tr>
            <tr><td class="label-cell">یخن</td><td>${customer.models.yakhun || '-'}</td></tr>
            <tr><td class="label-cell">آستین</td><td>${customer.models.sleeve || '-'}</td></tr>
        </table>
        
        <div class="footer">
            <div>تاریخ: ${persianDate}</div>
            <div>ALFAJR سیستم مدیریت</div>
        </div>
    </div>
    
    <script>
        setTimeout(() => {
            window.print();
            setTimeout(() => window.close(), 1000);
        }, 500);
    </script>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=600,height=800');
    if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
    } else {
        showNotification('لطفاً popup blocker را غیرفعال کنید', 'error');
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
    
    const printContent = `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
    <meta charset="UTF-8">
    <title>فاکتور ALFAJR</title>
    <style>
        @page { size: 80mm auto; margin: 0; }
        body { width: 80mm; padding: 3mm; font-family: Tahoma; font-size: 12px; }
        .invoice { border: 3px double #000; padding: 3mm; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 2mm; margin-bottom: 3mm; }
        .title { font-size: 18px; font-weight: bold; }
        .customer { margin: 3mm 0; padding: 2mm; background: #f8f9fa; }
        .row { display: flex; justify-content: space-between; margin: 1mm 0; }
        .price { margin: 3mm 0; padding: 3mm; border: 2px solid #000; text-align: center; font-weight: bold; }
        .status { text-align: center; margin: 3mm 0; padding: 2mm; border-radius: 3px; font-weight: bold; }
        .paid { background: #d4edda; color: #155724; border: 2px solid #28a745; }
        .unpaid { background: #f8d7da; color: #721c24; border: 2px solid #dc3545; }
        .footer { text-align: center; margin-top: 3mm; padding-top: 2mm; border-top: 1px solid #ccc; }
    </style>
</head>
<body>
    <div class="invoice">
        <div class="header">
            <div class="title">فاکتور فروش</div>
            <div>ALFAJR خیاطی | ${persianDate}</div>
        </div>
        
        <div class="customer">
            <div class="row"><span>مشتری:</span><span>${customer.name || 'بدون نام'}</span></div>
            <div class="row"><span>تلفن:</span><span>${customer.phone || 'بدون شماره'}</span></div>
            <div class="row"><span>کد:</span><span>${customer.id.substring(0, 8)}</span></div>
        </div>
        
        <div class="price">
            <div>مبلغ قابل پرداخت</div>
            <div style="font-size: 18px; margin-top: 2mm;">
                ${customer.sewingPriceAfghani ? customer.sewingPriceAfghani.toLocaleString('fa-IR') + ' افغانی' : '---'}
            </div>
        </div>
        
        <div class="status ${customer.paymentReceived ? 'paid' : 'unpaid'}">
            ${customer.paymentReceived ? '✅ پرداخت شده' : '❌ پرداخت نشده'}
        </div>
        
        ${customer.deliveryDay ? `
        <div style="text-align: center; margin: 3mm 0; padding: 2mm; background: #e3f2fd; border: 1px solid #2196f3;">
            📅 تحویل: ${customer.deliveryDay}
        </div>
        ` : ''}
        
        <div class="footer">
            <div>با تشکر از انتخاب شما</div>
            <div>ALFAJR خیاطی - ۰۷۹۹۷۹۹۰۰۹</div>
        </div>
    </div>
    
    <script>
        setTimeout(() => {
            window.print();
            setTimeout(() => window.close(), 1000);
        }, 500);
    </script>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=600,height=600');
    if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
    }
}

function addPrintButtons() {
    const profileHeader = document.querySelector('#profilePage .section-header:first-child');
    if (profileHeader) {
        const existingButtons = document.querySelector('.print-buttons');
        if (existingButtons) existingButtons.remove();
        
        const buttons = `
            <div class="print-buttons" style="margin: 20px 0; display: flex; gap: 10px; flex-wrap: wrap;">
                <button onclick="printThermalLabel()" class="btn-primary">
                    <i class="fas fa-print"></i> چاپ لیبل اندازه‌گیری
                </button>
                <button onclick="printThermalInvoice()" class="btn-success">
                    <i class="fas fa-file-invoice"></i> چاپ فاکتور
                </button>
            </div>
        `;
        
        profileHeader.insertAdjacentHTML('afterend', buttons);
    }
}

// ========== STATISTICS ==========
function updateStats() {
    const totalCustomers = customers.length;
    const totalOrders = customers.reduce((sum, customer) => sum + (customer.orders ? customer.orders.length : 0), 0);
    const paidCustomers = customers.filter(c => c.paymentReceived).length;
    
    document.getElementById('totalCustomers').textContent = totalCustomers;
    document.getElementById('activeOrders').textContent = totalOrders;
    document.getElementById('paidCustomers').textContent = paidCustomers;
}

// ========== DATA MANAGEMENT ==========
async function saveDataToFile() {
    try {
        showLoading('در حال آماده‌سازی داده‌ها...');
        const allCustomers = await dbManager.getAllCustomers(true);
        const dataStr = JSON.stringify(allCustomers, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `alfajr-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        hideLoading();
        showNotification('داده‌ها با موفقیت ذخیره شد', 'success');
    } catch (error) {
        hideLoading();
        console.error('Error exporting data:', error);
        showNotification('خطا در ذخیره فایل', 'error');
    }
}

function loadDataFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            showLoading('در حال وارد کردن داده‌ها...');
            const customersData = JSON.parse(e.target.result);
            
            if (!Array.isArray(customersData)) {
                throw new Error('فرمت فایل نامعتبر است');
            }
            
            let importedCount = 0;
            for (const customerData of customersData) {
                if (customerData.deleted) continue;
                const customer = Customer.fromObject(customerData);
                await dbManager.saveCustomer(customer);
                importedCount++;
            }
            
            hideLoading();
            showNotification(`${importedCount} مشتری با موفقیت وارد شد`, 'success');
            
            await loadCustomers();
            event.target.value = '';
        } catch (error) {
            hideLoading();
            console.error('Error importing data:', error);
            showNotification('خطا در وارد کردن داده‌ها', 'error');
        }
    };
    reader.readAsText(file);
}

async function clearAllData() {
    if (!confirm('⚠️ آیا از پاک‌سازی تمام داده‌ها مطمئن هستید؟')) return;
    if (!confirm('❌ این عمل قابل بازگشت نیست!')) return;
    
    try {
        showLoading('در حال پاک‌سازی...');
        await dbManager.clearAllData();
        customers = [];
        currentCustomerIndex = null;
        await loadCustomers();
        backHome();
        hideLoading();
        showNotification('تمامی داده‌ها پاک شدند', 'success');
    } catch (error) {
        hideLoading();
        console.error('Error clearing data:', error);
        showNotification('خطا در پاک‌سازی', 'error');
    }
}

// ========== THEME MANAGEMENT ==========
function toggleDarkMode() {
    document.body.className = 'dark-mode';
    currentTheme = 'dark';
    dbManager.saveSettings('theme', 'dark');
    showNotification('حالت تاریک فعال شد', 'success');
}

function toggleLightMode() {
    document.body.className = 'light-mode';
    currentTheme = 'light';
    dbManager.saveSettings('theme', 'light');
    showNotification('حالت روشن فعال شد', 'success');
}

function toggleVividMode() {
    document.body.className = 'vivid-mode';
    currentTheme = 'vivid';
    dbManager.saveSettings('theme', 'vivid');
    showNotification('حالت ویوید فعال شد', 'success');
}

// ========== INITIALIZATION ==========
function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') searchCustomer();
        });
    }
    
    // File input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', loadDataFromFile);
    }
    
    // Notes
    const notesTextarea = document.getElementById('customerNotes');
    if (notesTextarea) {
        notesTextarea.addEventListener('input', updateNotes);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl+S to save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveCustomer();
            showNotification('ذخیره شد', 'success');
        }
        
        // Escape to go back
        if (e.key === 'Escape') {
            const profilePage = document.getElementById('profilePage');
            if (profilePage && profilePage.style.display === 'block') {
                backHome();
            }
        }
        
        // Ctrl+F to search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
        
        // Ctrl+N for new customer
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            addCustomer();
        }
        
        // Ctrl+P for print
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            if (currentCustomerIndex !== null) {
                printThermalLabel();
            }
        }
    });
}

async function initializeApp() {
    try {
        showLoading('در حال راه‌اندازی اپلیکیشن ALFAJR...');
        
        // Check browser support
        if (!window.indexedDB) {
            throw new Error('مرورگر شما از IndexedDB پشتیبانی نمی‌کند');
        }
        
        // Initialize database
        dbManager = new DatabaseManager();
        await dbManager.init();
        
        // Load customers
        await loadCustomers();
        
        // Load saved theme
        try {
            const savedTheme = await dbManager.getSettings('theme') || 'dark';
            if (savedTheme === 'light') toggleLightMode();
            else if (savedTheme === 'vivid') toggleVividMode();
            else toggleDarkMode();
        } catch (e) {
            toggleDarkMode();
        }
        
        // Setup event listeners
        setupEventListeners();
        
        hideLoading();
        showNotification('اپلیکیشن ALFAJR آماده است', 'success');
        
    } catch (error) {
        hideLoading();
        console.error('Initialization error:', error);
        showNotification('خطا در راه‌اندازی: ' + error.message, 'error');
        
        // Show error in UI
        const listElement = document.getElementById('customerList');
        if (listElement) {
            listElement.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #dc3545;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                    <h3>خطا در راه‌اندازی</h3>
                    <p>${error.message}</p>
                    <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        <i class="fas fa-redo"></i> رفرش صفحه
                    </button>
                </div>
            `;
        }
    }
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
window.saveDataToFile = saveDataToFile;
window.loadDataFromFile = loadDataFromFile;
window.clearAllData = clearAllData;
window.toggleDarkMode = toggleDarkMode;
window.toggleLightMode = toggleLightMode;
window.toggleVividMode = toggleVividMode;

// ========== START APP ==========
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

console.log('ALFAJR App initialized');
