// script.js — версия с Тап-меню для мобильных и загрузкой файлов
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCl4mRL4eS7Wc9G4_UuvYBVLu0Wl6f-JME",
    authDomain: "ultra-drink-tier-list.firebaseapp.com",
    projectId: "ultra-drink-tier-list",
    storageBucket: "ultra-drink-tier-list.firebasestorage.app",
    messagingSenderId: "822887469615",
    appId: "1:822887469615:web:6b02b3b155943fd65aacda",
    measurementId: "G-5NQ7VRT3SP"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

class TierListApp {
    constructor() {
        this.state = {
            images: [],
            tiers: [
                { id: 'S', name: 'God Tier', color: 'var(--tier-s)' },
                { id: 'A', name: 'Great', color: 'var(--tier-a)' },
                { id: 'B', name: 'Good', color: 'var(--tier-b)' },
                { id: 'C', name: 'Meh', color: 'var(--tier-c)' },
                { id: 'D', name: 'Trash', color: 'var(--tier-d)' }
            ]
        };
        
        this.dom = {
            uploadZone: document.getElementById('uploadZone'),
            fileInput: document.getElementById('fileInput'),
            urlInput: document.getElementById('urlInput'),
            addUrlBtn: document.getElementById('addUrlBtn'),
            tierList: document.getElementById('tierList'),
            libraryGrid: document.getElementById('libraryGrid'),
            emptyState: document.getElementById('emptyState'),
            progressContainer: document.getElementById('progressContainer'),
            progressBarFill: document.getElementById('progressBarFill'),
            progressText: document.getElementById('progressText'),
            clearBtn: document.getElementById('clearBtn'),
            themeToggle: document.getElementById('themeToggle'),
            exportBtn: document.getElementById('exportBtn'),
            shareBtn: document.getElementById('shareBtn'),
            toastContainer: document.getElementById('toastContainer'),
            modal: document.getElementById('tierModal'),
            modalTiers: document.getElementById('modalTiers'),
            closeModalBtn: document.getElementById('closeModalBtn')
        };

        this.draggedItem = null;
        this.saveTimeout = null;
    }

    async init() {
        this.renderTiers();
        this.bindEvents();
        await this.checkUrlAndAddDrink();
        await this.loadFromFirebase();
    }

    // --- Firebase ---
    async loadFromFirebase() {
        try {
            const docRef = doc(db, "tierlist_data", "main_state");
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                this.state.images = docSnap.data().images || [];
                this.render();
            } else {
                this.loadFromLocalStorage();
            }
        } catch (error) {
            console.error('Firebase Load Error:', error);
            this.loadFromLocalStorage();
        }
    }

    async saveToFirebase() {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
            try {
                await setDoc(doc(db, "tierlist_data", "main_state"), { images: this.state.images });
                localStorage.setItem('drinkTierList', JSON.stringify(this.state.images));
            } catch (error) {
                console.error('Firebase Save Error:', error);
                localStorage.setItem('drinkTierList', JSON.stringify(this.state.images));
            }
        }, 1000);
    }

    loadFromLocalStorage() {
        const local = localStorage.getItem('drinkTierList');
        if (local) {
            try {
                const data = JSON.parse(local);
                if (data.length > 0) {
                    this.state.images = data;
                    this.render();
                }
            } catch (e) { console.error('Parse error:', e); }
        }
    }

    async checkUrlAndAddDrink() {
        const urlParams = new URLSearchParams(window.location.search);
        const drinkUrl = urlParams.get('add');
        if (drinkUrl) {
            await this.addImageByUrl(drinkUrl, true);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    async addImageByUrl(url, fromSharedLink = false) {
        if (!url || !url.trim()) return this.showToast('Введите ссылку!', 'error');
        if (!url.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) && !url.includes('images/')) {
            return this.showToast('Ссылка должна вести на изображение', 'error');
        }
        this.state.images.push({
            id: `img_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            url: url.trim(),
            tier: 'library',
            order: this.state.images.length
        });
        this.render();
        await this.saveToFirebase();
        this.showToast(fromSharedLink ? 'Напиток из ссылки добавлен!' : 'Фото добавлено!', 'success');
    }

    async handleFileUpload(files) {
        if (!files || files.length === 0) return;
        this.dom.progressContainer.hidden = false;
        this.dom.progressBarFill.style.width = '0%';
        this.dom.progressText.textContent = '0%';

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.size > 10 * 1024 * 1024) {
                this.showToast(`Файл ${file.name} слишком большой (макс 10 МБ).`, 'error');
                continue;
            }
            try {
                const compressedUrl = await this.compressImage(file, 400);
                this.state.images.push({
                    id: `img_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                    url: compressedUrl,
                    tier: 'library',
                    order: this.state.images.length
                });
            } catch (error) {
                console.error('Upload Error:', error);
            }
            const progress = Math.round(((i + 1) / files.length) * 100);
            this.dom.progressBarFill.style.width = `${progress}%`;
            this.dom.progressText.textContent = `${progress}%`;
        }
        this.dom.progressContainer.hidden = true;
        this.render();
        await this.saveToFirebase();
        this.showToast('Фото успешно загружены!', 'success');
    }

    compressImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width, height = img.height;
                    if (width > height) {
                        if (width > maxSize) { height *= maxSize / width; width = maxSize; }
                    } else {
                        if (height > maxSize) { width *= maxSize / height; height = maxSize; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
                img.onerror = reject;
                img.src = event.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async deleteImage(id) {
        this.state.images = this.state.images.filter(img => img.id !== id);
        this.render();
        await this.saveToFirebase();
        this.showToast('Фото удалено.', 'success');
    }

    async clearAll() {
        if (confirm('Удалить ВСЕ фото и сбросить тир-лист для всех пользователей?')) {
            this.state.images = [];
            localStorage.removeItem('drinkTierList');
            this.render();
            await this.saveToFirebase();
            this.showToast('Всё очищено!', 'success');
        }
    }

    async moveToTier(id, tier) {
        const img = this.state.images.find(i => i.id === id);
        if (img) {
            img.tier = tier;
            this.render();
            await this.saveToFirebase();
        }
    }

    // --- Render ---
    renderTiers() {
        this.dom.tierList.innerHTML = '';
        this.state.tiers.forEach(tier => {
            const row = document.createElement('div');
            row.className = 'tier-row';
            row.innerHTML = `
                <div class="tier-row__label" style="background-color: ${tier.color}">
                    <span>${tier.id}</span>
                    <small style="font-size: 0.7rem; font-weight: 400;">${tier.name}</small>
                </div>
                <div class="tier-row__content" data-tier="${tier.id}"></div>
            `;
            this.dom.tierList.appendChild(row);
        });
    }

    render() {
        document.querySelectorAll('.tier-row__content').forEach(c => c.innerHTML = '');
        this.dom.libraryGrid.innerHTML = '';
        this.dom.emptyState.style.display = this.state.images.length === 0 ? 'block' : 'none';

        [...this.state.images].sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(img => {
            const card = this.createCard(img);
            if (img.tier === 'library') {
                this.dom.libraryGrid.appendChild(card);
            } else {
                const container = document.querySelector(`.tier-row__content[data-tier="${img.tier}"]`);
                if (container) container.appendChild(card);
            }
        });
    }

    createCard(img) {
        const card = document.createElement('div');
        card.className = 'drink-card';
        card.draggable = true; // Для ПК
        card.dataset.id = img.id;
        card.innerHTML = `
            <img src="${img.url}" loading="lazy" alt="Drink" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23666%22 stroke-width=%222%22%3E%3Crect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/%3E%3Ccircle cx=%228.5%22 cy=%228.5%22 r=%221.5%22/%3E%3Cpath d=%22M21 15l-5-5-5 5-4-4-3 3%22/%3E%3C/svg%3E';">
            <button class="drink-card__delete"><i class="fas fa-times"></i></button>
        `;
        
        // Для ПК: перетаскивание
        card.addEventListener('dragstart', (e) => {
            this.draggedItem = img.id;
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            this.draggedItem = null;
        });

        // ДЛЯ ВСЕХ (особенно мобильных): Тап / Клик открывает меню выбора тира
        card.addEventListener('click', (e) => {
            // Если нажали на крестик (удалить), не открываем меню
            if (e.target.closest('.drink-card__delete')) return;
            this.openTierModal(img.id);
        });

        card.querySelector('.drink-card__delete').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteImage(img.id);
        });

        return card;
    }

    // --- Модальное окно (Меню выбора тира) ---
    openTierModal(id) {
        this.draggedItem = id; // Используем эту же переменную для запоминания карточки
        this.dom.modal.classList.add('active');
        this.renderModalTiers();
    }

    renderModalTiers() {
        this.dom.modalTiers.innerHTML = '';
        this.state.tiers.forEach(tier => {
            const btn = document.createElement('button');
            btn.className = 'modal__tier-btn';
            btn.style.backgroundColor = tier.color;
            btn.textContent = tier.id;
            btn.onclick = () => {
                this.moveToTier(this.draggedItem, tier.id);
                this.dom.modal.classList.remove('active');
            };
            this.dom.modalTiers.appendChild(btn);
        });
        
        const libBtn = document.createElement('button');
        libBtn.className = 'modal__tier-btn';
        libBtn.style.backgroundColor = 'var(--color-surface-alt)';
        libBtn.innerHTML = '<i class="fas fa-images"></i> В библиотеку';
        libBtn.onclick = () => {
            this.moveToTier(this.draggedItem, 'library');
            this.dom.modal.classList.remove('active');
        };
        this.dom.modalTiers.appendChild(libBtn);
    }

    setupDropZones() {
        const zones = [...document.querySelectorAll('.tier-row__content'), this.dom.libraryGrid];
        zones.forEach(zone => {
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('drag-over');
            });
            zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                const tier = zone.dataset.tier || 'library';
                if (this.draggedItem) {
                    this.moveToTier(this.draggedItem, tier);
                }
            });
        });
    }

         exportToPNG() {
        if (typeof html2canvas !== 'undefined') {
            // Узнаем текущую тему, чтобы задать правильный общий фон картинки
            const isLightTheme = document.documentElement.classList.contains('light-theme');
            const bgColor = isLightTheme ? '#ffffff' : '#1a1a1a'; 

            html2canvas(this.dom.tierList, { 
                backgroundColor: bgColor, // Жестко задаем фон (никакой прозрачности)
                useCORS: true, 
                allowTaint: true,
                scale: 2, // Увеличиваем разрешение в 2 раза для четкости
                logging: false // Убираем лишние логи в консоль
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = 'drink-tier-list.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            }).catch(err => {
                console.error('Экспорт ошибки:', err);
                this.showToast('Ошибка экспорта (картинка может быть защищена от копирования).', 'error');
            });
        } else {
            this.showToast('Библиотека html2canvas не загружена.', 'error');
        }
    }

    async share() {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: '🍺 Drink Tier List',
                    text: 'Посмотри мой тир-лист напитков!',
                    url: window.location.href
                });
            } catch (err) { if (err.name !== 'AbortError') console.error(err); }
        } else {
            this.showToast('Web Share не поддерживается.', 'error');
        }
    }

    showToast(message, type = '') {
        const toast = document.createElement('div');
        toast.className = `toast ${type ? 'toast--' + type : ''}`;
        toast.textContent = message;
        this.dom.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    toggleTheme() {
        document.documentElement.classList.toggle('dark-theme');
        document.documentElement.classList.toggle('light-theme');
        const icon = this.dom.themeToggle.querySelector('i');
        icon.className = document.documentElement.classList.contains('light-theme') ? 'fas fa-sun' : 'fas fa-moon';
    }

    bindEvents() {
        this.dom.addUrlBtn?.addEventListener('click', () => {
            this.addImageByUrl(this.dom.urlInput?.value);
            if (this.dom.urlInput) this.dom.urlInput.value = '';
        });

        this.dom.urlInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.addImageByUrl(e.target.value);
                e.target.value = '';
            }
        });

        this.dom.uploadZone?.addEventListener('click', () => this.dom.fileInput?.click());
        this.dom.fileInput?.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
            e.target.value = '';
        });

        this.dom.uploadZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dom.uploadZone.classList.add('dragover');
        });
        this.dom.uploadZone?.addEventListener('dragleave', () => this.dom.uploadZone?.classList.remove('dragover'));
        this.dom.uploadZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dom.uploadZone?.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.handleFileUpload(e.dataTransfer.files);
        });

        this.dom.clearBtn?.addEventListener('click', () => this.clearAll());
        this.dom.themeToggle?.addEventListener('click', () => this.toggleTheme());
        this.dom.exportBtn?.addEventListener('click', () => this.exportToPNG());
        this.dom.shareBtn?.addEventListener('click', () => this.share());
        this.dom.closeModalBtn?.addEventListener('click', () => this.dom.modal?.classList.remove('active'));
        
        // Закрытие модалки при клике мимо нее
        this.dom.modal?.addEventListener('click', (e) => {
            if (e.target === this.dom.modal) this.dom.modal.classList.remove('active');
        });

        this.setupDropZones();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new TierListApp();
    app.init();
});
