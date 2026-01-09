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
        "قد", "شانه_یک", "شانه_دو", "آستین_یک", "آستین_دو", "آستین_سه",
        "بغل", "دامن", "گردن", "دور_سینه", "شلوار", "دم_پاچه",
        "بر_تمبان", "خشتک", "چاک_پتی", "تعداد_سفارش", "مقدار_تکه"
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
        this.id = this.generateRandomEightDigitId();
        this.name = name;
        this.phone = phone;
        this.measurements = this.initMeasurements();
        this.orders = [];
        this.notes = "";
        this.models = { yakhun: "", sleeve: "", skirt: [], features: [] };
        this.sewingPriceAfghani = null;
        this.deliveryDay = "";
        this.paymentReceived = false;
        this.paymentDate = null;
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
        this.deleted = false;
        this.version = 1;
    }

    generateRandomEightDigitId() {
        return Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    initMeasurements() {
        const measurements = {};
        AppConfig.MEASUREMENT_FIELDS.forEach(field => measurements[field] = "");
        return measurements;
    }

    static fromObject(obj) {
        const customer = new Customer(obj.name, obj.phone);
        Object.assign(customer, obj);
        if (!customer.models) customer.models = { yakhun: "", sleeve: "", skirt: [], features: [] };
        if (!customer.models.skirt) customer.models.skirt = [];
        if (!customer.models.features) customer.models.features = [];
        return customer;
    }
}

// ========== DATABASE MANAGER ==========
class DatabaseManager {
    constructor() { this.db = null; this.isInitialized = false; }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(AppConfig.DATABASE_NAME, AppConfig.DATABASE_VERSION);
            request.onsuccess = (e) => { 
                this.db = e.target.result; this.isInitialized = true; 
                updateDBStatus(true); resolve(this.db); 
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(AppConfig.STORES.CUSTOMERS)) {
                    const store = db.createObjectStore(AppConfig.STORES.CUSTOMERS, { keyPath: 'id' });
                    store.createIndex('name', 'name');
                    store.createIndex('createdAt', 'createdAt');
                }
                if (!db.objectStoreNames.contains(AppConfig.STORES.SETTINGS)) db.createObjectStore(AppConfig.STORES.SETTINGS, { keyPath: 'key' });
            };
            request.onerror = (e) => { updateDBStatus(false); reject(e.target.error); };
        });
    }

    async saveCustomer(customer) {
        const tx = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
        customer.updatedAt = new Date().toISOString();
        tx.objectStore(AppConfig.STORES.CUSTOMERS).put(customer);
        return new Promise((res) => tx.oncomplete = res);
    }

    async getAllCustomers() {
        const tx = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
        const store = tx.objectStore(AppConfig.STORES.CUSTOMERS);
        return new Promise((res) => {
            store.getAll().onsuccess = (e) => res(e.target.result.filter(c => !c.deleted));
        });
    }

    async getCustomer(id) {
        const tx = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
        return new Promise((res) => { tx.objectStore(AppConfig.STORES.CUSTOMERS).get(id).onsuccess = (e) => res(e.target.result); });
    }

    async deleteCustomer(id) {
        const customer = await this.getCustomer(id);
        if (customer) { customer.deleted = true; await this.saveCustomer(customer); }
    }

    async getSettings(key) {
        const tx = this.db.transaction([AppConfig.STORES.SETTINGS], 'readonly');
        return new Promise((res) => { tx.objectStore(AppConfig.STORES.SETTINGS).get(key).onsuccess = (e) => res(e.target.result?.value); });
    }

    async saveSettings(key, value) {
        const tx = this.db.transaction([AppConfig.STORES.SETTINGS], 'readwrite');
        tx.objectStore(AppConfig.STORES.SETTINGS).put({ key, value });
    }
    
    async getDatabaseSize() {
        const customers = await this.getAllCustomers();
        return new Blob([JSON.stringify(customers)]).size;
    }

    async clearAllData() {
        const tx = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
        tx.objectStore(AppConfig.STORES.CUSTOMERS).clear();
    }
}

const dbManager = new DatabaseManager();

// ========== UI HELPERS ==========
function showNotification(msg, type = "info") {
    const n = document.getElementById("notification");
    if (!n) return;
    n.textContent = msg; n.className = `notification ${type} show`;
    setTimeout(() => n.classList.remove("show"), 3000);
}

function updateDBStatus(connected) {
    const el = document.getElementById("dbStatus");
    if (el) el.className = `db-status ${connected ? 'connected' : 'disconnected'}`;
}

function showLoading(msg) { 
    const o = document.getElementById("loadingOverlay"); 
    const t = document.getElementById("loadingText");
    if(o && t) { t.textContent = msg; o.style.display = "flex"; }
}
function hideLoading() { const o = document.getElementById("loadingOverlay"); if(o) o.style.display = "none"; }

const debouncedSave = debounce(async () => {
    if (currentIndex !== null) await dbManager.saveCustomer(customers[currentIndex]);
}, 1000);

function debounce(func, wait) {
    let timeout;
    return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); };
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + ['Bytes', 'KB', 'MB'][i];
}

// ========== MAIN FUNCTIONS ==========
async function addCustomer() {
    const name = prompt("نام مشتری:");
    const phone = prompt("شماره مشتری:");
    if (!name || !phone) return;
    const newCust = new Customer(name.trim(), phone.trim());
    await dbManager.saveCustomer(newCust);
    await loadCustomersFromDB();
    renderCustomerList();
    openProfile(customers.findIndex(c => c.id === newCust.id));
}

async function loadCustomersFromDB() {
    customers = await dbManager.getAllCustomers();
    customers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderCustomerList() {
    const list = document.getElementById("customerList");
    if (!list) return;
    list.innerHTML = customers.length ? "" : '<div class="empty-state">مشتری ثبت نشده است</div>';
    customers.forEach((c, i) => {
        const div = document.createElement("div");
        div.className = "customer-item";
        div.innerHTML = `<div><strong>${c.name}</strong> - ${c.phone}</div><button onclick="openProfile(${i})">پروفایل</button>`;
        list.appendChild(div);
    });
}

function openProfile(index) {
    currentIndex = index;
    const c = customers[index];
    document.getElementById("profileName").textContent = c.name;
    document.getElementById("profilePhone").textContent = c.phone;
    document.getElementById("customerNotes").value = c.notes || "";
    renderMeasurements(index);
    renderModels(index);
    updateSelectedModelTexts(index);
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

function renderMeasurements(index) {
    const c = customers[index];
    const container = document.getElementById("measurementsTable");
    container.innerHTML = `
        <table>
            <tbody>
                ${AppConfig.MEASUREMENT_FIELDS.map(f => `
                    <tr>
                        <td>${f.replace('_', ' ')}</td>
                        <td><div class="field-input" contenteditable="true" oninput="updateMeasurement('${f}', this.innerText)">${c.measurements[f] || ''}</div></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

function updateMeasurement(field, val) {
    customers[currentIndex].measurements[field] = val.trim();
    debouncedSave();
}

function updateNotes(val) {
    customers[currentIndex].notes = val;
    debouncedSave();
}

// ========== MODELS SECTION (FIXED) ==========
function renderModels(index) {
    const cust = customers[index];
    
    // یخن
    renderModelOptions('yakhunOptions', AppConfig.YAKHUN_MODELS, cust.models.yakhun, (opt) => {
        cust.models.yakhun = opt;
        debouncedSave();
        updateSelectedModelTexts(index);
    });

    // آستین
    renderModelOptions('sleeveOptions', AppConfig.SLEEVE_MODELS, cust.models.sleeve, (opt) => {
        cust.models.sleeve = opt;
        debouncedSave();
        updateSelectedModelTexts(index);
    });

    // دامن (چند انتخابی)
    renderMultiSelectOptions('skirtOptions', AppConfig.SKIRT_MODELS, cust.models.skirt, (opt) => {
        const idx = cust.models.skirt.indexOf(opt);
        if (idx > -1) cust.models.skirt.splice(idx, 1); else cust.models.skirt.push(opt);
        debouncedSave();
        updateSelectedModelTexts(index);
    });

    // ویژگی‌ها (چند انتخابی)
    renderMultiSelectOptions('featuresOptions', AppConfig.FEATURES_LIST, cust.models.features, (opt) => {
        const idx = cust.models.features.indexOf(opt);
        if (idx > -1) cust.models.features.splice(idx, 1); else cust.models.features.push(opt);
        debouncedSave();
        updateSelectedModelTexts(index);
    });
}

function renderModelOptions(id, opts, selected, onClick) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = opts.map(o => `<div class="model-option ${o===selected?'selected':''}" onclick="handleModelClick('${id}', '${o}', ${onClick})">${o}</div>`).join('');
}

// تابع کمکی برای مدیریت کلیک و بستن منو
window.handleModelClick = (containerId, opt, callback) => {
    callback(opt);
    document.getElementById(containerId).style.display = "none";
};

function renderMultiSelectOptions(id, opts, selectedArray, onClick) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = opts.map(o => {
        const isSel = selectedArray.includes(o);
        return `<div class="multi-select-option ${isSel?'selected':''}" onclick="this.classList.toggle('selected'); handleMultiClick('${o}', ${onClick})">${o}</div>`;
    }).join('');
}

window.handleMultiClick = (opt, callback) => callback(opt);

function updateSelectedModelTexts(index) {
    const c = customers[index].models;
    document.getElementById("yakhunSelectedText").textContent = "یخن: " + (c.yakhun || "انتخاب نشده");
    document.getElementById("sleeveSelectedText").textContent = "آستین: " + (c.sleeve || "انتخاب نشده");
    document.getElementById("skirtSelectedText").textContent = "دامن: " + (c.skirt.join(", ") || "انتخاب نشده");
    document.getElementById("featuresSelectedText").textContent = "ویژگی‌ها: " + (c.features.join(", ") || "انتخاب نشده");
}

function toggleOptions(id) {
    const el = document.getElementById(id);
    const isVisible = el.style.display === "block";
    document.querySelectorAll('.model-options').forEach(d => d.style.display = "none");
    el.style.display = isVisible ? "none" : "block";
}

// ========== PRICE & DELIVERY ==========
function renderPriceAndDeliverySection(index) {
    const c = customers[index];
    const container = document.getElementById("priceDeliverySection");
    container.innerHTML = `
        <input type="number" value="${c.sewingPriceAfghani || ''}" placeholder="قیمت (افغانی)" oninput="updatePrice(${index}, this.value)">
        <div class="payment-toggle ${c.paymentReceived?'checked':''}" onclick="togglePayment(${index})">
            ${c.paymentReceived ? 'پول رسید شد' : 'پول نرسید'}
        </div>
        <div class="delivery-grid">
            ${['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'].map(d => `
                <div class="day-button ${c.deliveryDay===d?'selected':''}" onclick="setDay(${index},'${d}')">${d}</div>
            `).join('')}
        </div>`;
}

window.updatePrice = (i, v) => { customers[i].sewingPriceAfghani = v; debouncedSave(); };
window.togglePayment = (i) => { 
    customers[i].paymentReceived = !customers[i].paymentReceived; 
    customers[i].paymentDate = customers[i].paymentReceived ? new Date().toISOString() : null;
    renderPriceAndDeliverySection(i); debouncedSave(); 
};
window.setDay = (i, d) => { customers[i].deliveryDay = d; renderPriceAndDeliverySection(i); debouncedSave(); };

// ========== UTILS & INIT ==========
async function updateStats() {
    const size = await dbManager.getDatabaseSize();
    document.getElementById("totalCustomers").textContent = customers.length;
    document.getElementById("dbSize").textContent = formatBytes(size);
}

async function initializeApp() {
    showLoading("در حال بارگذاری...");
    await dbManager.init();
    await loadCustomersFromDB();
    renderCustomerList();
    updateStats();
    hideLoading();
}

document.addEventListener('DOMContentLoaded', initializeApp);

// Export to Global
Object.assign(window, {
    addCustomer, openProfile, backHome, toggleOptions, updateNotes, updateMeasurement, 
    toggleDarkMode: () => { document.body.className = "dark-mode"; dbManager.saveSettings('theme','dark'); },
    toggleLightMode: () => { document.body.className = "light-mode"; dbManager.saveSettings('theme','light'); }
});
                        
