// ========== COMPLETE ALFAJR TAILORING APP ==========
// Version 2.0 - Complete with all features

// ========== CONFIGURATION ==========
const AppConfig = {
    DATABASE_NAME: 'ALFAJR_DB',
    DATABASE_VERSION: 2,
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
let isAppInitialized = false;

// ========== CUSTOMER CLASS ==========
class Customer {
    constructor(name, phone) {
        this.id = Date.now().toString() + '_' + Math.random().toString(36).substring(2, 9);
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
        this.sewingPriceAfghani = 0;
        this.deliveryDay = '';
        this.paymentReceived = false;
        this.paymentDate = null;
        this.orders = [];
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
        this.deleted = false;
    }

    createEmptyMeasurements() {
        const measurements = {};
        AppConfig.MEASUREMENT_FIELDS.forEach(field => {
            measurements[field] = '';
        });
        return measurements;
    }
}

// ========== DATABASE MANAGER ==========
class DatabaseManager {
    constructor() {
        this.db = null;
        this.initialized = false;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            if (this.initialized) {
                resolve(this.db);
                return;
            }

            const request = indexedDB.open(AppConfig.DATABASE_NAME, AppConfig.DATABASE_VERSION);

            request.onerror = (event) => {
                console.error('Database error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.initialized = true;
                console.log('Database initialized successfully');
                updateDatabaseStatus(true);
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                console.log('Upgrading database...');
                const db = event.target.result;

                // ایجاد استور مشتریان
                if (!db.objectStoreNames.contains(AppConfig.STORES.CUSTOMERS)) {
                    const customerStore = db.createObjectStore(AppConfig.STORES.CUSTOMERS, {
                        keyPath: 'id'
                    });
                    customerStore.createIndex('name', 'name', { unique: false });
                    customerStore.createIndex('phone', 'phone', { unique: false });
                    customerStore.createIndex('createdAt', 'createdAt', { unique: false });
                    customerStore.createIndex('deleted', 'deleted', { unique: false });
                }

                // ایجاد استور تنظیمات
                if (!db.objectStoreNames.contains(AppConfig.STORES.SETTINGS)) {
                    db.createObjectStore(AppConfig.STORES.SETTINGS, {
                        keyPath: 'key'
                    });
                }
            };
        });
    }

    async saveCustomer(customer) {
        return new Promise((resolve, reject) => {
            if (!this.initialized) {
                reject(new Error('Database not initialized'));
                return;
            }

            customer.updatedAt = new Date().toISOString();

            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);

            const request = store.put(customer);

            request.onsuccess = () => {
                console.log('Customer saved:', customer.id);
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
            if (!this.initialized) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const index = store.index('createdAt');
            const request = index.getAll();

            request.onsuccess = () => {
                let customers = request.result || [];
                if (!includeDeleted) {
                    customers = customers.filter(c => !c.deleted);
                }
                resolve(customers);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async getCustomer(id) {
        return new Promise((resolve, reject) => {
            if (!this.initialized) {
                reject(new Error('Database not initialized'));
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

    async deleteCustomer(id) {
        return new Promise((resolve, reject) => {
            if (!this.initialized) {
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

    async searchCustomers(searchTerm) {
        return new Promise((resolve, reject) => {
            if (!this.initialized) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const store = transaction.objectStore(AppConfig.STORES.CUSTOMERS);
            const request = store.getAll();

            request.onsuccess = () => {
                const allCustomers = request.result || [];
                const term = searchTerm.toLowerCase().trim();

                const results = allCustomers.filter(customer => {
                    if (customer.deleted) return false;

                    const searchableFields = [
                        customer.name,
                        customer.phone,
                        customer.notes,
                        customer.id
                    ];

                    return searchableFields.some(field =>
                        field && field.toString().toLowerCase().includes(term)
                    );
                });

                resolve(results);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async getSettings(key) {
        return new Promise((resolve, reject) => {
            if (!this.initialized) {
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
            if (!this.initialized) {
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
            if (!this.initialized) {
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
    // ایجاد عنصر نوتیفیکیشن اگر وجود ندارد
    let notification = document.getElementById('globalNotification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'globalNotification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 8px;
            color: white;
            font-family: Tahoma, Arial, sans-serif;
            z-index: 10000;
            display: none;
            max-width: 400px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            font-size: 14px;
        `;
        document.body.appendChild(notification);
    }

    // تنظیم رنگ بر اساس نوع
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    
    notification.style.backgroundColor = colors[type] || colors.info;
    notification.textContent = message;
    notification.style.display = 'block';

    // مخفی کردن بعد از مدت زمان
    setTimeout(() => {
        notification.style.display = 'none';
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
        text.style.fontSize = '18px';
        text.textContent = message;

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

function updateDatabaseStatus(connected) {
    const statusElement = document.getElementById('databaseStatus');
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

function formatPrice(price) {
    if (!price) return '۰';
    return new Intl.NumberFormat('fa-IR').format(price);
}

// ========== CUSTOMER MANAGEMENT ==========
async function addNewCustomer() {
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
        await window.dbManager.saveCustomer(customer);
        
        // بارگذاری مجدد لیست مشتریان
        await loadAllCustomers();
        
        // پیدا کردن ایندکس مشتری جدید و باز کردن پروفایل
        const index = customers.findIndex(c => c.id === customer.id);
        if (index !== -1) {
            openCustomerProfile(index);
        }
        
        hideLoading();
        showNotification(`مشتری "${name}" با موفقیت اضافه شد`, 'success');
    } catch (error) {
        hideLoading();
        console.error('Error adding customer:', error);
        showNotification('خطا در اضافه کردن مشتری', 'error');
    }
}

async function loadAllCustomers() {
    try {
        showLoading('در حال بارگذاری مشتریان...');
        customers = await window.dbManager.getAllCustomers();
        renderCustomerList();
        updateStatistics();
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading customers:', error);
        showNotification('خطا در بارگذاری مشتریان', 'error');
    }
}

function renderCustomerList() {
    const listContainer = document.getElementById('customerList');
    if (!listContainer) return;

    if (!customers || customers.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users-slash"></i>
                <h3>هیچ مشتری ثبت نشده است</h3>
                <p>برای شروع، روی دکمه "مشتری جدید" کلیک کنید</p>
            </div>
        `;
        return;
    }

    let html = '';
    customers.forEach((customer, index) => {
        const hasNotes = customer.notes && customer.notes.trim() !== '';
        const hasPrice = customer.sewingPriceAfghani && customer.sewingPriceAfghani > 0;
        const deliveryDay = customer.deliveryDay ? ` - ${customer.deliveryDay}` : '';
        
        html += `
            <div class="customer-card" onclick="openCustomerProfile(${index})">
                <div class="customer-header">
                    <span class="customer-id">#${customer.id.substring(0, 6)}</span>
                    <span class="customer-date">${new Date(customer.createdAt).toLocaleDateString('fa-IR')}</span>
                </div>
                <div class="customer-info">
                    <h4>${customer.name || 'بدون نام'}</h4>
                    <p class="customer-phone">${customer.phone || 'بدون شماره'}</p>
                    ${hasNotes ? `<p class="customer-notes">${customer.notes.substring(0, 60)}${customer.notes.length > 60 ? '...' : ''}</p>` : ''}
                </div>
                <div class="customer-footer">
                    ${hasPrice ? `<span class="customer-price">${formatPrice(customer.sewingPriceAfghani)} افغانی</span>` : ''}
                    ${deliveryDay ? `<span class="customer-delivery">${deliveryDay}</span>` : ''}
                    <button class="btn-delete" onclick="event.stopPropagation(); deleteCustomer(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });

    listContainer.innerHTML = html;
}

async function searchCustomers() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    const searchTerm = searchInput.value.trim();
    if (searchTerm === '') {
        await loadAllCustomers();
        return;
    }

    try {
        showLoading('در حال جستجو...');
        const results = await window.dbManager.searchCustomers(searchTerm);
        
        const listContainer = document.getElementById('customerList');
        if (!listContainer) return;

        if (results.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <h3>مشتری یافت نشد</h3>
                    <p>هیچ مشتری با مشخصات "${searchTerm}" پیدا نشد</p>
                </div>
            `;
            hideLoading();
            return;
        }

        let html = '';
        results.forEach((customer, index) => {
            // پیدا کردن ایندکس واقعی در آرایه اصلی
            const realIndex = customers.findIndex(c => c.id === customer.id);
            
            html += `
                <div class="customer-card search-result" onclick="openCustomerProfile(${realIndex})">
                    <div class="customer-header">
                        <span class="customer-id">#${customer.id.substring(0, 6)}</span>
                    </div>
                    <div class="customer-info">
                        <h4>${customer.name || 'بدون نام'}</h4>
                        <p class="customer-phone">${customer.phone || 'بدون شماره'}</p>
                    </div>
                    <div class="search-highlight">
                        <i class="fas fa-search"></i> مورد جستجو
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;
        hideLoading();
        showNotification(`${results.length} مشتری یافت شد`, 'success');
    } catch (error) {
        hideLoading();
        console.error('Error searching customers:', error);
        showNotification('خطا در جستجو', 'error');
    }
}

async function deleteCustomer(index) {
    if (index < 0 || index >= customers.length) return;

    const customer = customers[index];
    if (!customer) return;

    const confirmDelete = confirm(`آیا از حذف مشتری "${customer.name}" مطمئن هستید؟`);
    if (!confirmDelete) return;

    try {
        showLoading('در حال حذف مشتری...');
        await window.dbManager.deleteCustomer(customer.id);
        await loadAllCustomers();
        hideLoading();
        showNotification('مشتری با موفقیت حذف شد', 'success');
        
        // اگر در صفحه پروفایل بودیم، به خانه برگرد
        if (document.getElementById('profilePage').style.display === 'block') {
            showHomePage();
        }
    } catch (error) {
        hideLoading();
        console.error('Error deleting customer:', error);
        showNotification('خطا در حذف مشتری', 'error');
    }
}

// ========== PROFILE MANAGEMENT ==========
function openCustomerProfile(index) {
    if (index < 0 || index >= customers.length) {
        showNotification('مشتری یافت نشد', 'error');
        return;
    }

    currentCustomerIndex = index;
    const customer = customers[index];

    // ذخیره کردن داده‌ها قبل از تغییر صفحه
    saveCurrentCustomerData();

    // به‌روزرسانی اطلاعات صفحه پروفایل
    document.getElementById('profileCustomerName').textContent = customer.name || 'بدون نام';
    document.getElementById('profileCustomerPhone').textContent = customer.phone || 'بدون شماره';
    document.getElementById('profileCustomerId').textContent = `کد: ${customer.id.substring(0, 8)}`;
    
    // یادداشت‌ها
    const notesTextarea = document.getElementById('customerNotes');
    if (notesTextarea) {
        notesTextarea.value = customer.notes || '';
    }

    // رندر بخش‌های مختلف
    renderMeasurementsSection();
    renderModelsSection();
    renderOrdersSection();
    renderPriceDeliverySection();

    // نمایش صفحه پروفایل
    showProfilePage();
}

function saveCurrentCustomerData() {
    if (currentCustomerIndex === null || currentCustomerIndex >= customers.length) return;

    const customer = customers[currentCustomerIndex];
    if (!customer) return;

    // ذخیره یادداشت‌ها
    const notesTextarea = document.getElementById('customerNotes');
    if (notesTextarea) {
        customer.notes = notesTextarea.value;
    }

    // ذخیره اندازه‌گیری‌ها
    const measurementInputs = document.querySelectorAll('.measurement-input');
    measurementInputs.forEach(input => {
        const field = input.dataset.field;
        if (field && customer.measurements) {
            customer.measurements[field] = input.value;
        }
    });

    // ذخیره قیمت
    const priceInput = document.getElementById('sewingPriceInput');
    if (priceInput) {
        customer.sewingPriceAfghani = parseInt(priceInput.value) || 0;
    }

    // ذخیره وضعیت پرداخت
    const paymentCheckbox = document.getElementById('paymentCheckbox');
    if (paymentCheckbox) {
        customer.paymentReceived = paymentCheckbox.checked;
        if (paymentCheckbox.checked && !customer.paymentDate) {
            customer.paymentDate = new Date().toISOString();
        }
    }

    // ذخیره در دیتابیس
    debouncedSaveCustomer(customer);
}

function renderMeasurementsSection() {
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

    // گروه‌بندی فیلدها
    const fieldGroups = [
        {
            title: 'قد',
            fields: [{ key: 'قد', label: 'قد (سانتی‌متر)', placeholder: '170' }]
        },
        {
            title: 'شانه',
            fields: [
                { key: 'شانه_یک', label: 'شانه یک', placeholder: '45' },
                { key: 'شانه_دو', label: 'شانه دو', placeholder: '45' }
            ]
        },
        {
            title: 'آستین',
            fields: [
                { key: 'آستین_یک', label: 'آستین یک', placeholder: '60' },
                { key: 'آستین_دو', label: 'آستین دو', placeholder: '25' },
                { key: 'آستین_سه', label: 'آستین سه', placeholder: '15' }
            ]
        },
        {
            title: 'بدنه',
            fields: [
                { key: 'بغل', label: 'بغل', placeholder: '50' },
                { key: 'دامن', label: 'دامن', placeholder: '100' },
                { key: 'گردن', label: 'گردن', placeholder: '40' },
                { key: 'دور_سینه', label: 'دور سینه', placeholder: '100' }
            ]
        },
        {
            title: 'شلوار',
            fields: [
                { key: 'شلوار', label: 'شلوار', placeholder: '110' },
                { key: 'دم_پاچه', label: 'دم پاچه', placeholder: '22' }
            ]
        },
        {
            title: 'سایر',
            fields: [
                { key: 'بر_تمبان', label: 'بر تهمان (ب)', placeholder: '40' },
                { key: 'خشتک', label: 'خشتک (خ)', placeholder: '25' },
                { key: 'چاک_پتی', label: 'چاک پتی', placeholder: '30' }
            ]
        },
        {
            title: 'سفارش',
            fields: [
                { key: 'تعداد_سفارش', label: 'تعداد سفارش', placeholder: '1' },
                { key: 'مقدار_تکه', label: 'مقدار تکه', placeholder: '2' }
            ]
        }
    ];

    fieldGroups.forEach(group => {
        html += `<div class="measurement-group">`;
        html += `<h4>${group.title}</h4>`;
        html += `<div class="measurement-fields">`;
        
        group.fields.forEach(field => {
            const value = customer.measurements ? customer.measurements[field.key] || '' : '';
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
    debouncedSaveCustomer(customer);
}

function renderModelsSection() {
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

    // مدل یخن
    html += `
        <div class="model-category">
            <h4><i class="fas fa-snowflake"></i> مدل یخن</h4>
            <div class="model-options">
    `;
    
    AppConfig.YAKHUN_MODELS.forEach(model => {
        const isSelected = customer.models.yakhun === model;
        html += `
            <div class="model-option ${isSelected ? 'selected' : ''}" 
                 onclick="selectYakhunModel('${model}')">
                ${model}
            </div>
        `;
    });
    
    html += `</div></div>`;

    // مدل آستین
    html += `
        <div class="model-category">
            <h4><i class="fas fa-hand-paper"></i> مدل آستین</h4>
            <div class="model-options">
    `;
    
    AppConfig.SLEEVE_MODELS.forEach(model => {
        const isSelected = customer.models.sleeve === model;
        html += `
            <div class="model-option ${isSelected ? 'selected' : ''}" 
                 onclick="selectSleeveModel('${model}')">
                ${model}
            </div>
        `;
    });
    
    html += `</div></div>`;

    // مدل دامن
    html += `
        <div class="model-category">
            <h4><i class="fas fa-venus"></i> مدل دامن</h4>
            <div class="model-options multi-select">
    `;
    
    AppConfig.SKIRT_MODELS.forEach(model => {
        const isSelected = customer.models.skirt && customer.models.skirt.includes(model);
        html += `
            <div class="model-option ${isSelected ? 'selected' : ''}" 
                 onclick="toggleSkirtModel('${model}')">
                ${model}
                <span class="checkmark">${isSelected ? '✓' : ''}</span>
            </div>
        `;
    });
    
    html += `</div></div>`;

    // ویژگی‌ها
    html += `
        <div class="model-category">
            <h4><i class="fas fa-star"></i> ویژگی‌ها</h4>
            <div class="model-options multi-select">
    `;
    
    AppConfig.FEATURES_LIST.forEach(feature => {
        const isSelected = customer.models.features && customer.models.features.includes(feature);
        html += `
            <div class="model-option ${isSelected ? 'selected' : ''}" 
                 onclick="toggleFeature('${feature}')">
                ${feature}
                <span class="checkmark">${isSelected ? '✓' : ''}</span>
            </div>
        `;
    });
    
    html += `</div></div>`;
    html += `</div>`;
    
    container.innerHTML = html;
}

function selectYakhunModel(model) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    customer.models.yakhun = model;
    renderModelsSection();
    debouncedSaveCustomer(customer);
    showNotification(`مدل یخن به "${model}" تغییر کرد`, 'success');
}

function selectSleeveModel(model) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    customer.models.sleeve = model;
    renderModelsSection();
    debouncedSaveCustomer(customer);
    showNotification(`مدل آستین به "${model}" تغییر کرد`, 'success');
}

function toggleSkirtModel(model) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    if (!customer.models.skirt) {
        customer.models.skirt = [];
    }
    
    const index = customer.models.skirt.indexOf(model);
    if (index > -1) {
        customer.models.skirt.splice(index, 1);
        showNotification(`مدل دامن "${model}" حذف شد`, 'info');
    } else {
        customer.models.skirt.push(model);
        showNotification(`مدل دامن "${model}" اضافه شد`, 'success');
    }
    
    renderModelsSection();
    debouncedSaveCustomer(customer);
}

function toggleFeature(feature) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    if (!customer.models.features) {
        customer.models.features = [];
    }
    
    const index = customer.models.features.indexOf(feature);
    if (index > -1) {
        customer.models.features.splice(index, 1);
        showNotification(`ویژگی "${feature}" حذف شد`, 'info');
    } else {
        customer.models.features.push(feature);
        showNotification(`ویژگی "${feature}" اضافه شد`, 'success');
    }
    
    renderModelsSection();
    debouncedSaveCustomer(customer);
}

function renderPriceDeliverySection() {
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
                           id="sewingPriceInput"
                           value="${customer.sewingPriceAfghani || ''}"
                           placeholder="مبلغ به افغانی"
                           oninput="updateSewingPrice(this.value)"
                           min="0">
                    <span class="currency">افغانی</span>
                </div>
            </div>
            
            <div class="payment-section">
                <h4><i class="fas fa-check-circle"></i> وضعیت پرداخت</h4>
                <div class="payment-toggle" onclick="togglePaymentStatus()">
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

function updateSewingPrice(price) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    customer.sewingPriceAfghani = parseInt(price) || 0;
    debouncedSaveCustomer(customer);
}

function togglePaymentStatus() {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    customer.paymentReceived = !customer.paymentReceived;
    
    if (customer.paymentReceived && !customer.paymentDate) {
        customer.paymentDate = new Date().toISOString();
    } else if (!customer.paymentReceived) {
        customer.paymentDate = null;
    }
    
    renderPriceDeliverySection();
    debouncedSaveCustomer(customer);
    showNotification(`وضعیت پرداخت تغییر کرد`, 'success');
}

function setDeliveryDay(day) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    customer.deliveryDay = day;
    renderPriceDeliverySection();
    debouncedSaveCustomer(customer);
    showNotification(`روز تحویل به ${day} تنظیم شد`, 'success');
}

function renderOrdersSection() {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    const container = document.getElementById('ordersContainer');
    if (!container) return;

    let html = `
        <div class="section-header">
            <h3><i class="fas fa-clipboard-list"></i> سفارشات</h3>
            <button class="btn-add-order" onclick="addNewOrder()">
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
            html += `
                <div class="order-item">
                    <div class="order-header">
                        <span class="order-number">سفارش #${index + 1}</span>
                        <span class="order-date">${new Date(order.date || order.createdAt).toLocaleDateString('fa-IR')}</span>
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

function addNewOrder() {
    if (currentCustomerIndex === null) return;
    
    const orderDetails = prompt('جزئیات سفارش جدید را وارد کنید:');
    if (!orderDetails || orderDetails.trim() === '') {
        showNotification('لطفاً جزئیات سفارش را وارد کنید', 'warning');
        return;
    }
    
    const customer = customers[currentCustomerIndex];
    if (!customer.orders) {
        customer.orders = [];
    }
    
    const newOrder = {
        id: Date.now().toString(),
        details: orderDetails.trim(),
        date: new Date().toISOString(),
        status: 'pending'
    };
    
    customer.orders.push(newOrder);
    renderOrdersSection();
    debouncedSaveCustomer(customer);
    showNotification('سفارش جدید اضافه شد', 'success');
}

function deleteOrder(orderIndex) {
    if (currentCustomerIndex === null) return;
    
    const customer = customers[currentCustomerIndex];
    if (!customer.orders || orderIndex >= customer.orders.length) return;
    
    if (confirm('آیا از حذف این سفارش مطمئن هستید؟')) {
        customer.orders.splice(orderIndex, 1);
        renderOrdersSection();
        debouncedSaveCustomer(customer);
        showNotification('سفارش حذف شد', 'success');
    }
}

// ========== PAGE NAVIGATION ==========
function showHomePage() {
    document.getElementById('homePage').style.display = 'block';
    document.getElementById('profilePage').style.display = 'none';
    currentCustomerIndex = null;
    
    // بارگذاری مجدد لیست
    loadAllCustomers();
}

function showProfilePage() {
    document.getElementById('homePage').style.display = 'none';
    document.getElementById('profilePage').style.display = 'block';
}

// ========== DATA MANAGEMENT ==========
function updateStatistics() {
    const totalCustomers = customers.length;
    const totalOrders = customers.reduce((sum, customer) => 
        sum + (customer.orders ? customer.orders.length : 0), 0);
    
    const paidCustomers = customers.filter(c => c.paymentReceived).length;
    
    document.getElementById('totalCustomersCount').textContent = totalCustomers;
    document.getElementById('totalOrdersCount').textContent = totalOrders;
    document.getElementById('paidCustomersCount').textContent = paidCustomers;
}

async function exportData() {
    try {
        showLoading('در حال آماده‌سازی داده‌ها...');
        const allCustomers = await window.dbManager.getAllCustomers(true);
        
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
        showNotification('خطا در ذخیره داده‌ها', 'error');
    }
}

async function importData(event) {
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
                
                // ایجاد مشتری جدید با حفظ ID اگر وجود دارد
                const customer = new Customer(customerData.name, customerData.phone);
                customer.id = customerData.id || customer.id;
                
                // کپی سایر خصوصیات
                Object.keys(customerData).forEach(key => {
                    if (!['id', 'name', 'phone'].includes(key)) {
                        customer[key] = customerData[key];
                    }
                });
                
                await window.dbManager.saveCustomer(customer);
                importedCount++;
            }
            
            hideLoading();
            showNotification(`${importedCount} مشتری با موفقیت وارد شد`, 'success');
            
            // بارگذاری مجدد
            await loadAllCustomers();
            
            // ریست کردن input فایل
            event.target.value = '';
        } catch (error) {
            hideLoading();
            console.error('Error importing data:', error);
            showNotification('خطا در وارد کردن داده‌ها: ' + error.message, 'error');
        }
    };
    
    reader.readAsText(file);
}

async function clearDatabase() {
    if (!confirm('⚠️ هشدار!\nآیا از پاک‌سازی تمام داده‌ها مطمئن هستید؟\nاین عمل قابل بازگشت نیست!')) {
        return;
    }
    
    if (!confirm('❌ هشدار نهایی!\nتمامی مشتریان، سفارشات و تاریخچه پاک خواهند شد.\nادامه می‌دهید؟')) {
        return;
    }
    
    try {
        showLoading('در حال پاک‌سازی داده‌ها...');
        await window.dbManager.clearAllData();
        
        customers = [];
        currentCustomerIndex = null;
        
        await loadAllCustomers();
        hideLoading();
        
        showNotification('تمامی داده‌ها با موفقیت پاک شدند', 'success');
        
        // برگشت به صفحه اصلی اگر در پروفایل بودیم
        if (document.getElementById('profilePage').style.display === 'block') {
            showHomePage();
        }
    } catch (error) {
        hideLoading();
        console.error('Error clearing database:', error);
        showNotification('خطا در پاک‌سازی داده‌ها', 'error');
    }
}

// ========== UTILITY FUNCTIONS ==========
const debouncedSaveCustomer = (function() {
    let timeout;
    return function(customer) {
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            try {
                await window.dbManager.saveCustomer(customer);
                console.log('Customer auto-saved:', customer.name);
            } catch (error) {
                console.error('Error auto-saving customer:', error);
            }
        }, 1000);
    };
})();

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + S برای ذخیره
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveCurrentCustomerData();
            showNotification('ذخیره شد', 'success');
        }
        
        // Escape برای بازگشت
        if (e.key === 'Escape') {
            if (document.getElementById('profilePage').style.display === 'block') {
                showHomePage();
            }
        }
        
        // Ctrl/Cmd + F برای جستجو
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
        
        // Ctrl/Cmd + N برای مشتری جدید
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            addNewCustomer();
        }
        
        // Ctrl/Cmd + E برای خروجی
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            exportData();
        }
    });
}

function setupEventListeners() {
    // جستجو
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchCustomers();
            }
        });
    }
    
    // یادداشت‌ها
    const notesTextarea = document.getElementById('customerNotes');
    if (notesTextarea) {
        notesTextarea.addEventListener('input', function() {
            if (currentCustomerIndex !== null) {
                const customer = customers[currentCustomerIndex];
                if (customer) {
                    customer.notes = this.value;
                    debouncedSaveCustomer(customer);
                }
            }
        });
    }
    
    // بارگذاری فایل
    const fileInput = document.getElementById('importFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', importData);
    }
    
    // تنظیمات تم
    const themeButtons = document.querySelectorAll('.theme-btn');
    themeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const theme = this.dataset.theme;
            document.body.className = theme + '-mode';
            window.dbManager.saveSettings('theme', theme);
        });
    });
}

// ========== INITIALIZATION ==========
async function initializeApplication() {
    console.log('Initializing ALFAJR Tailoring App...');
    
    try {
        showLoading('در حال راه‌اندازی اپلیکیشن...');
        
        // بررسی پشتیبانی IndexedDB
        if (!window.indexedDB) {
            throw new Error('مرورگر شما از IndexedDB پشتیبانی نمی‌کند. لطفاً از مرورگر جدیدتر استفاده کنید.');
        }
        
        // ایجاد مدیر دیتابیس
        window.dbManager = new DatabaseManager();
        
        // راه‌اندازی دیتابیس
        await window.dbManager.initialize();
        
        // بارگذاری مشتریان
        await loadAllCustomers();
        
        // بارگذاری تنظیمات تم
        try {
            const savedTheme = await window.dbManager.getSettings('theme') || 'dark';
            document.body.className = savedTheme + '-mode';
        } catch (themeError) {
            console.warn('Could not load theme:', themeError);
            document.body.className = 'dark-mode';
        }
        
        // تنظیم رویدادها و میانبرها
        setupEventListeners();
        setupKeyboardShortcuts();
        
        hideLoading();
        showNotification('اپلیکیشن ALFAJR با موفقیت راه‌اندازی شد', 'success');
        
        isAppInitialized = true;
        
    } catch (error) {
        hideLoading();
        console.error('Initialization error:', error);
        
        const errorMessage = error.message || 'خطای نامشخص';
        showNotification(`خطا در راه‌اندازی: ${errorMessage}`, 'error');
        
        // نمایش پیام خطا در صفحه
        const customerList = document.getElementById('customerList');
        if (customerList) {
            customerList.innerHTML = `
                <div class="error-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>خطا در راه‌اندازی</h3>
                    <p>${errorMessage}</p>
                    <button onclick="location.reload()" class="btn-retry">
                        <i class="fas fa-redo"></i> تلاش مجدد
                    </button>
                </div>
            `;
        }
    }
}

// ========== GLOBAL EXPORTS ==========
// همه توابع ضروری را در اسکوپ گلوبال قرار می‌دهیم
window.addNewCustomer = addNewCustomer;
window.searchCustomers = searchCustomers;
window.openCustomerProfile = openCustomerProfile;
window.showHomePage = showHomePage;
window.showProfilePage = showProfilePage;
window.saveCurrentCustomerData = saveCurrentCustomerData;
window.deleteCustomer = deleteCustomer;
window.addNewOrder = addNewOrder;
window.deleteOrder = deleteOrder;
window.selectYakhunModel = selectYakhunModel;
window.selectSleeveModel = selectSleeveModel;
window.toggleSkirtModel = toggleSkirtModel;
window.toggleFeature = toggleFeature;
window.updateMeasurement = updateMeasurement;
window.updateSewingPrice = updateSewingPrice;
window.togglePaymentStatus = togglePaymentStatus;
window.setDeliveryDay = setDeliveryDay;
window.exportData = exportData;
window.importData = importData;
window.clearDatabase = clearDatabase;
window.loadAllCustomers = loadAllCustomers;

// ========== START APPLICATION ==========
// راه‌اندازی وقتی DOM کاملاً بارگذاری شد
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApplication);
} else {
    // اگر DOM از قبل بارگذاری شده
    initializeApplication();
}

console.log('ALFAJR Tailoring App script loaded successfully');
