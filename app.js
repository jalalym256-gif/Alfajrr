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

// ========== CUSTOMER CLASS ==========
class Customer {
    constructor(name, phone) {
        this.id = this.generateRandomFourDigitId();
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
    generateRandomFourDigitId() {
        const timestamp = Date.now().toString().slice(-4);
        const random = Math.floor(Math.random() * 9000) + 1000;
        return (timestamp + random).toString().slice(-8);
    }
    initMeasurements() {
        const measurements = {};
        AppConfig.MEASUREMENT_FIELDS.forEach(field => { measurements[field] = ""; });
        return measurements;
    }
    static fromObject(obj) {
        const customer = new Customer(obj.name, obj.phone);
        for (const key in obj) { if (obj.hasOwnProperty(key)) { customer[key] = obj[key]; } }
        if (!customer.orders) customer.orders = [];
        if (!customer.measurements) customer.measurements = customer.initMeasurements();
        if (!customer.models) customer.models = { yakhun: "", sleeve: "", skirt: [], features: [] };
        return customer;
    }
}

// ========== DATABASE MANAGER ==========
class DatabaseManager {
    constructor() { this.db = null; this.isInitialized = false; }
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(AppConfig.DATABASE_NAME, AppConfig.DATABASE_VERSION);
            request.onsuccess = (e) => { this.db = e.target.result; this.isInitialized = true; updateDBStatus(true); resolve(this.db); };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(AppConfig.STORES.CUSTOMERS)) {
                    const store = db.createObjectStore(AppConfig.STORES.CUSTOMERS, { keyPath: 'id' });
                    store.createIndex('name', 'name');
                    store.createIndex('createdAt', 'createdAt');
                }
                if (!db.objectStoreNames.contains(AppConfig.STORES.SETTINGS)) db.createObjectStore(AppConfig.STORES.SETTINGS, { keyPath: 'key' });
                if (!db.objectStoreNames.contains(AppConfig.STORES.BACKUPS)) db.createObjectStore(AppConfig.STORES.BACKUPS, { keyPath: 'id', autoIncrement: true });
            };
            request.onerror = (e) => { updateDBStatus(false); reject(e.target.error); };
        });
    }
    async saveCustomer(customer) {
        const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
        customer.updatedAt = new Date().toISOString();
        transaction.objectStore(AppConfig.STORES.CUSTOMERS).put(customer);
    }
    async getAllCustomers(includeDeleted = false) {
        return new Promise((resolve) => {
            const transaction = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
            const request = transaction.objectStore(AppConfig.STORES.CUSTOMERS).getAll();
            request.onsuccess = () => resolve(includeDeleted ? request.result : request.result.filter(c => !c.deleted));
        });
    }
    async getCustomer(id) {
        return new Promise((resolve) => {
            const request = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly').objectStore(AppConfig.STORES.CUSTOMERS).get(id);
            request.onsuccess = () => resolve(request.result);
        });
    }
    async deleteCustomer(id) {
        const cust = await this.getCustomer(id);
        if (cust) { cust.deleted = true; await this.saveCustomer(cust); }
    }
    async getDatabaseSize() {
        const customers = await this.getAllCustomers(true);
        return new Blob([JSON.stringify(customers)]).size;
    }
    async getSettings(key) {
        return new Promise((resolve) => {
            const request = this.db.transaction([AppConfig.STORES.SETTINGS], 'readonly').objectStore(AppConfig.STORES.SETTINGS).get(key);
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
        });
    }
    async saveSettings(key, value) {
        this.db.transaction([AppConfig.STORES.SETTINGS], 'readwrite').objectStore(AppConfig.STORES.SETTINGS).put({ key, value });
    }
}

const dbManager = new DatabaseManager();

// ========== UI HELPERS ==========
function showNotification(msg, type = "info") {
    const el = document.getElementById("notification");
    if (!el) return;
    el.textContent = msg; el.className = `notification ${type} show`;
    setTimeout(() => el.classList.remove("show"), 3000);
}

function updateDBStatus(connected) {
    const el = document.getElementById("dbStatus");
    if (el) el.className = connected ? "db-status connected" : "db-status disconnected";
}

function showLoading(msg) { 
    const overlay = document.getElementById("loadingOverlay");
    if(overlay) { overlay.style.display = "flex"; document.getElementById("loadingText").textContent = msg; }
}
function hideLoading() { const overlay = document.getElementById("loadingOverlay"); if(overlay) overlay.style.display = "none"; }

const debouncedSave = (function() {
    let timer;
    return function() {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            if (currentIndex !== null) await dbManager.saveCustomer(customers[currentIndex]);
        }, 1500);
    };
})();

// ========== APP LOGIC ==========
async function loadCustomersFromDB() {
    customers = await dbManager.getAllCustomers();
}

function renderCustomerList() {
    const list = document.getElementById("customerList");
    if(!list) return;
    list.innerHTML = customers.length ? "" : '<div class="empty-state">مشتری ثبت نشده</div>';
    customers.forEach((c, i) => {
        const div = document.createElement("div");
        div.className = "customer-item";
        div.innerHTML = `<div><strong>${c.name}</strong> - ${c.phone}</div><button onclick="openProfile(${i})">مشاهده</button>`;
        list.appendChild(div);
    });
}

async function addCustomer() {
    const name = prompt("نام مشتری:");
    const phone = prompt("شماره مشتری:");
    if (!name || !phone) return;
    const newCust = new Customer(name, phone);
    await dbManager.saveCustomer(newCust);
    await loadCustomersFromDB();
    renderCustomerList();
    openProfile(customers.findIndex(c => c.id === newCust.id));
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
    renderOrdersHistory(index);
    
    document.getElementById("homePage").style.display = "none";
    document.getElementById("profilePage").style.display = "block";
}

function backHome() {
    document.getElementById("homePage").style.display = "block";
    document.getElementById("profilePage").style.display = "none";
    renderCustomerList();
    updateStats();
}

// ========== MEASUREMENTS TABLE (WITH NUMERIC KEYBOARD) ==========
function getFieldLabel(field) {
    const labels = { "قد": "قد", "شانه_یک": "شانه", "شانه_دو": "شانه", "آستین_یک": "آستین", "آستین_دو": "آستین", "آستین_سه": "آستین", "بغل": "بغل", "دامن": "دامن", "گردن": "گردن", "دور_سینه": "دور سینه", "شلوار": "شلوار", "دم_پاچه": "دم پاچه", "بر_تمبان": "بر تهمان", "خشتک": "خشتک", "چاک_پتی": "چاک پتی", "تعداد_سفارش": "تعداد سفارش", "مقدار_تکه": "مقدار تکه" };
    return labels[field] || field;
}

function renderMeasurements(index) {
    const customer = customers[index];
    const container = document.getElementById("measurementsTable");
    
    container.innerHTML = `
        <h4><i class="fas fa-ruler-combined"></i> اندازه‌گیری‌ها:</h4>
        <table>
            <tbody>
                <tr>
                    <td style="font-weight:bold;color:var(--royal-gold);">قد</td>
                    <td><div class="field-input" contenteditable="true" inputmode="decimal" oninput="updateMeasurement('قد', this.innerText)">${customer.measurements.قد || ''}</div></td>
                </tr>
                <tr>
                    <td style="font-weight:bold;color:var(--royal-gold);">شانه</td>
                    <td><div class="horizontal-fields">
                        <div class="field-input" contenteditable="true" inputmode="decimal" oninput="updateMeasurement('شانه_یک', this.innerText)">${customer.measurements.شانه_یک || ''}</div>
                        <div class="field-input" contenteditable="true" inputmode="decimal" oninput="updateMeasurement('شانه_دو', this.innerText)">${customer.measurements.شانه_دو || ''}</div>
                    </div></td>
                </tr>
                <tr>
                    <td style="font-weight:bold;color:var(--royal-gold);">آستین</td>
                    <td><div class="horizontal-fields">
                        <div class="field-input" contenteditable="true" inputmode="decimal" oninput="updateMeasurement('آستین_یک', this.innerText)">${customer.measurements.آستین_یک || ''}</div>
                        <div class="field-input" contenteditable="true" inputmode="decimal" oninput="updateMeasurement('آستین_دو', this.innerText)">${customer.measurements.آستین_دو || ''}</div>
                        <div class="field-input" contenteditable="true" inputmode="decimal" oninput="updateMeasurement('آستین_سه', this.innerText)">${customer.measurements.آستین_سه || ''}</div>
                    </div></td>
                </tr>
                ${AppConfig.MEASUREMENT_FIELDS.slice(6, 12).map(f => `
                    <tr>
                        <td style="font-weight:bold;color:var(--royal-gold);">${getFieldLabel(f)}</td>
                        <td><div class="field-input" contenteditable="true" inputmode="decimal" oninput="updateMeasurement('${f}', this.innerText)">${customer.measurements[f] || ''}</div></td>
                    </tr>
                `).join('')}
                <tr>
                    <td style="font-weight:bold;color:var(--royal-gold);">خشتک</td>
                    <td><div class="horizontal-fields">
                        <span>ب</span><div class="field-input" contenteditable="true" inputmode="decimal" oninput="updateMeasurement('بر_تمبان', this.innerText)">${customer.measurements.بر_تمبان || ''}</div>
                        <span>خ</span><div class="field-input" contenteditable="true" inputmode="decimal" oninput="updateMeasurement('خشتک', this.innerText)">${customer.measurements.خشتک || ''}</div>
                    </div></td>
                </tr>
                <tr>
                    <td style="font-weight:bold;color:var(--royal-gold);">سفارش</td>
                    <td><div class="horizontal-fields">
                        <span>تعداد</span><div class="field-input" contenteditable="true" inputmode="decimal" oninput="updateMeasurement('تعداد_سفارش', this.innerText)">${customer.measurements.تعداد_سفارش || ''}</div>
                        <span>تکه</span><div class="field-input" contenteditable="true" inputmode="decimal" oninput="updateMeasurement('مقدار_تکه', this.innerText)">${customer.measurements.مقدار_تکه || ''}</div>
                    </div></td>
                </tr>
            </tbody>
        </table>`;
}

function updateMeasurement(field, val) {
    customers[currentIndex].measurements[field] = val.trim();
    debouncedSave();
}

// ========== MODELS & OPTIONS ==========
function toggleOptions(id) {
    const el = document.getElementById(id);
    const isVisible = el.style.display === "block";
    document.querySelectorAll('.model-options').forEach(opt => opt.style.display = 'none');
    el.style.display = isVisible ? "none" : "block";
}

function renderModels(index) {
    const c = customers[index];
    renderModelOptions('yakhunOptions', AppConfig.YAKHUN_MODELS, c.models.yakhun, (o) => { c.models.yakhun = o; debouncedSave(); updateSelectedModelTexts(index); });
    renderModelOptions('sleeveOptions', AppConfig.SLEEVE_MODELS, c.models.sleeve, (o) => { c.models.sleeve = o; debouncedSave(); updateSelectedModelTexts(index); });
    renderMultiSelect('skirtOptions', AppConfig.SKIRT_MODELS, c.models.skirt, (o) => {
        const idx = c.models.skirt.indexOf(o);
        if(idx > -1) c.models.skirt.splice(idx, 1); else c.models.skirt.push(o);
        debouncedSave(); updateSelectedModelTexts(index); renderModels(index);
    });
    renderMultiSelect('featuresOptions', AppConfig.FEATURES_LIST, c.models.features, (o) => {
        const idx = c.models.features.indexOf(o);
        if(idx > -1) c.models.features.splice(idx, 1); else c.models.features.push(o);
        debouncedSave(); updateSelectedModelTexts(index); renderModels(index);
    });
}

function renderModelOptions(id, opts, selected, cb) {
    const el = document.getElementById(id); el.innerHTML = "";
    opts.forEach(o => {
        const div = document.createElement("div"); div.className = "model-option" + (selected === o ? " selected" : "");
        div.textContent = o; div.onclick = () => { cb(o); el.style.display = "none"; };
        el.appendChild(div);
    });
}

function renderMultiSelect(id, opts, selectedArr, cb) {
    const el = document.getElementById(id); el.innerHTML = "";
    opts.forEach(o => {
        const isSelected = selectedArr.includes(o);
        const div = document.createElement("div"); div.className = "multi-select-option" + (isSelected ? " selected" : "");
        div.innerHTML = `<span>${o}</span><div class="checkmark"></div>`;
        div.onclick = () => cb(o);
        el.appendChild(div);
    });
}

function updateSelectedModelTexts(index) {
    const c = customers[index];
    document.getElementById("yakhunSelectedText").textContent = "مدل یخن: " + (c.models.yakhun || "---");
    document.getElementById("sleeveSelectedText").textContent = "مدل آستین: " + (c.models.sleeve || "---");
    document.getElementById("skirtSelectedText").textContent = "مدل دامن: " + (c.models.skirt.join(", ") || "---");
    document.getElementById("featuresSelectedText").textContent = "ویژگی‌ها: " + (c.models.features.join(", ") || "---");
}

// ========== PRICE, DELIVERY & ORDERS ==========
function renderPriceAndDeliverySection(index) {
    const c = customers[index];
    const container = document.getElementById("priceDeliverySection");
    container.innerHTML = `
        <div class="price-input-group">
            <input type="number" class="price-input" value="${c.sewingPriceAfghani || ''}" oninput="updateAfghaniPrice(${index}, this.value)" placeholder="قیمت (افغانی)">
            <div class="payment-checkbox ${c.paymentReceived ? 'checked' : ''}" onclick="togglePayment(${index})">
                ${c.paymentReceived ? 'پول رسید شد' : 'پول نرسید'}
            </div>
        </div>
        <div class="delivery-grid">
            ${['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'].map(day => `
                <div class="day-button ${c.deliveryDay === day ? 'selected' : ''}" onclick="setDeliveryDay(${index}, '${day}')">${day}</div>
            `).join('')}
        </div>`;
}

function updateAfghaniPrice(i, v) { customers[i].sewingPriceAfghani = v; debouncedSave(); }
function togglePayment(i) { customers[i].paymentReceived = !customers[i].paymentReceived; renderPriceAndDeliverySection(i); debouncedSave(); }
function setDeliveryDay(i, d) { customers[i].deliveryDay = d; renderPriceAndDeliverySection(i); debouncedSave(); }

function renderOrdersHistory(index) {
    const container = document.getElementById("ordersHistory");
    const c = customers[index];
    container.innerHTML = (c.orders && c.orders.length) ? 
        c.orders.map((o, i) => `<div class="order-item">سفارش ${i+1}: ${o.details}</div>`).join('') : 
        '<div class="empty-state">سفارش ثبت نشده</div>';
}

async function updateStats() {
    const size = await dbManager.getDatabaseSize();
    document.getElementById("totalCustomers").textContent = customers.length;
    document.getElementById("dbSize").textContent = (size / 1024).toFixed(2) + " KB";
}

// ========== INITIALIZATION ==========
async function initializeApp() {
    await dbManager.init();
    await loadCustomersFromDB();
    renderCustomerList();
    const theme = await dbManager.getSettings('theme');
    if (theme) document.body.className = theme + "-mode";
    updateStats();
    
    document.getElementById("customerNotes").oninput = (e) => {
        customers[currentIndex].notes = e.target.value;
        debouncedSave();
    };
}

document.addEventListener('DOMContentLoaded', initializeApp);

// Export to Global
window.addCustomer = addCustomer; window.openProfile = openProfile; window.backHome = backHome;
window.toggleOptions = toggleOptions; window.updateMeasurement = updateMeasurement;
window.updateAfghaniPrice = updateAfghaniPrice; window.togglePaymentReceived = togglePayment;
window.setDeliveryDay = setDeliveryDay;
