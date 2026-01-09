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
        this.id = Math.floor(Math.random() * 90000000 + 10000000).toString();
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

    initMeasurements() {
        const measurements = {};
        AppConfig.MEASUREMENT_FIELDS.forEach(field => { measurements[field] = ""; });
        return measurements;
    }

    static fromObject(obj) {
        const customer = new Customer(obj.name, obj.phone);
        Object.assign(customer, obj);
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
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isInitialized = true;
                updateDBStatus(true);
                resolve(this.db);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(AppConfig.STORES.CUSTOMERS)) {
                    db.createObjectStore(AppConfig.STORES.CUSTOMERS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(AppConfig.STORES.SETTINGS)) {
                    db.createObjectStore(AppConfig.STORES.SETTINGS, { keyPath: 'key' });
                }
            };
            request.onerror = () => { updateDBStatus(false); reject("DB Error"); };
        });
    }

    async saveCustomer(customer) {
        const tx = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readwrite');
        customer.updatedAt = new Date().toISOString();
        tx.objectStore(AppConfig.STORES.CUSTOMERS).put(customer);
    }

    async getAllCustomers() {
        const tx = this.db.transaction([AppConfig.STORES.CUSTOMERS], 'readonly');
        const store = tx.objectStore(AppConfig.STORES.CUSTOMERS);
        return new Promise((res) => {
            store.getAll().onsuccess = (e) => res(e.target.result.filter(c => !c.deleted));
        });
    }
}

const dbManager = new DatabaseManager();

// ========== FUNCTIONS ==========

function showNotification(message, type = "info") {
    const n = document.getElementById("notification");
    if (!n) return;
    n.textContent = message;
    n.className = `notification ${type} show`;
    setTimeout(() => n.classList.remove("show"), 3000);
}

function updateDBStatus(connected) {
    const statusEl = document.getElementById("dbStatus");
    if (statusEl) statusEl.className = `db-status ${connected ? 'connected' : 'disconnected'}`;
}

const debouncedSave = () => {
    if (currentIndex !== null) dbManager.saveCustomer(customers[currentIndex]);
};

async function addCustomer() {
    const name = prompt("نام مشتری:");
    const phone = prompt("شماره مشتری:");
    if (!name || !phone) return;
    const newCust = new Customer(name, phone);
    await dbManager.saveCustomer(newCust);
    await loadCustomersFromDB();
    renderCustomerList();
    showNotification("مشتری اضافه شد", "success");
}

async function loadCustomersFromDB() {
    customers = await dbManager.getAllCustomers();
}

function renderCustomerList() {
    const list = document.getElementById("customerList");
    if (!list) return;
    list.innerHTML = "";
    customers.forEach((c, i) => {
        const div = document.createElement("div");
        div.className = "customer-item";
        div.innerHTML = `<div><strong>${c.name}</strong></div><button onclick="openProfile(${i})">پروفایل</button>`;
        list.appendChild(div);
    });
}

function openProfile(index) {
    currentIndex = index;
    const cust = customers[index];
    document.getElementById("profileName").textContent = cust.name;
    document.getElementById("profilePhone").textContent = cust.phone;
    document.getElementById("customerNotes").value = cust.notes || "";
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
    renderCustomerList();
}

function renderMeasurements(index) {
    const customer = customers[index];
    const container = document.getElementById("measurementsTable");
    container.innerHTML = `
        <table>
            <tbody>
                ${AppConfig.MEASUREMENT_FIELDS.map(f => `
                    <tr>
                        <td>${f}</td>
                        <td><div class="field-input" contenteditable="true" oninput="updateMeasurement('${f}', this.innerText)">${customer.measurements[f] || ''}</div></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

function updateMeasurement(field, val) {
    customers[currentIndex].measurements[field] = val;
    debouncedSave();
}

function updateNotes(val) {
    customers[currentIndex].notes = val;
    debouncedSave();
}

// اصلاح شده: بخش مدل‌ها
function renderModels(index) {
    const cust = customers[index];
    
    renderModelOptions('yakhunOptions', AppConfig.YAKHUN_MODELS, cust.models.yakhun, (opt) => {
        cust.models.yakhun = opt;
        debouncedSave();
        updateSelectedModelTexts(index);
    });

    renderModelOptions('sleeveOptions', AppConfig.SLEEVE_MODELS, cust.models.sleeve, (opt) => {
        cust.models.sleeve = opt;
        debouncedSave();
        updateSelectedModelTexts(index);
    });

    renderMultiSelectOptions('skirtOptions', AppConfig.SKIRT_MODELS, cust.models.skirt || [], (opt) => {
        const idx = cust.models.skirt.indexOf(opt);
        if (idx > -1) cust.models.skirt.splice(idx, 1); else cust.models.skirt.push(opt);
        debouncedSave();
        updateSelectedModelTexts(index);
    });

    renderMultiSelectOptions('featuresOptions', AppConfig.FEATURES_LIST, cust.models.features || [], (opt) => {
        const idx = cust.models.features.indexOf(opt);
        if (idx > -1) cust.models.features.splice(idx, 1); else cust.models.features.push(opt);
        debouncedSave();
        updateSelectedModelTexts(index);
    });
}

function renderModelOptions(containerId, options, selectedValue, onClick) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = options.map(opt => `
        <div class="model-option ${opt === selectedValue ? 'selected' : ''}" onclick="selectSingleModel('${containerId}', '${opt}', ${onClick})">${opt}</div>
    `).join('');
}

window.selectSingleModel = (id, opt, callback) => {
    callback(opt);
    document.getElementById(id).style.display = "none";
};

function renderMultiSelectOptions(containerId, options, selectedArray, onClick) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = options.map(opt => `
        <div class="multi-select-option ${selectedArray.includes(opt) ? 'selected' : ''}" onclick="toggleMulti(this, '${opt}', ${onClick})">${opt}</div>
    `).join('');
}

window.toggleMulti = (el, opt, callback) => {
    el.classList.toggle('selected');
    callback(opt);
};

function updateSelectedModelTexts(index) {
    const m = customers[index].models;
    document.getElementById("yakhunSelectedText").textContent = "یخن: " + (m.yakhun || "---");
    document.getElementById("sleeveSelectedText").textContent = "آستین: " + (m.sleeve || "---");
    document.getElementById("skirtSelectedText").textContent = "دامن: " + (m.skirt.join(", ") || "---");
    document.getElementById("featuresSelectedText").textContent = "ویژگی‌ها: " + (m.features.join(", ") || "---");
}

function toggleOptions(id) {
    const el = document.getElementById(id);
    const isVisible = el.style.display === "block";
    document.querySelectorAll('.model-options').forEach(d => d.style.display = "none");
    el.style.display = isVisible ? "none" : "block";
}

function renderPriceAndDeliverySection(index) {
    const c = customers[index];
    const container = document.getElementById("priceDeliverySection");
    if(!container) return;
    container.innerHTML = `
        <input type="number" value="${c.sewingPriceAfghani || ''}" placeholder="قیمت" oninput="customers[${index}].sewingPriceAfghani=this.value; debouncedSave();">
        <div class="delivery-grid">
            ${['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'].map(d => `
                <div class="day-button ${c.deliveryDay===d?'selected':''}" onclick="setDay(${index},'${d}')">${d}</div>
            `).join('')}
        </div>`;
}

window.setDay = (i, d) => { customers[i].deliveryDay = d; renderPriceAndDeliverySection(i); debouncedSave(); };

async function initializeApp() {
    await dbManager.init();
    await loadCustomersFromDB();
    renderCustomerList();
}

document.addEventListener('DOMContentLoaded', initializeApp);

// توابع گلوبال برای دکمه‌های HTML
window.addCustomer = addCustomer;
window.openProfile = openProfile;
window.backHome = backHome;
window.toggleOptions = toggleOptions;
window.updateNotes = updateNotes;
window.updateMeasurement = updateMeasurement;
