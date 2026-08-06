// script.js — версия с загрузкой файлов (сжатие) и хранением в Firebase Firestore
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// Ваш конфиг Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCl4mRL4eS7Wc9G4_UuvYBVLu0Wl6f-JME",
    authDomain: "ultra-drink-tier-list.firebaseapp.com",
    projectId: "ultra-drink-tier-list",
    storageBucket: "ultra-drink-tier-list.firebasestorage.app",
    messagingSenderId: "822887469615",
    appId: "1:822887469615:web:6b02b3b155943fd65aacda",
    measurementId: "G-5NQ7VRT3SP"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

class TierListApp {
    constructor() {
        this.state = {
            images: [], // { id, url, tier, order }
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
        this.touchTimer = null;
        this.saveTimeout = null;
    }

    async init() {
        this.renderTiers();
        this.bindEvents();
        await this.checkUrlAndAddDrink(); // Проверяем ссылку ?add=...
        await this.loadFromFirebase();    // Загружаем данные из базы
    }

    // --- Работа с Firebase Firestore (База данных) ---

    async loadFromFirebase() {
        try {
            const docRef = doc(db, "tierlist_data", "main_state");
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                this.state.images = data.images || [];
                this.render();
                this.showToast('Данные загружены из базы!', 'success');
            } else {
                // Если в базе пусто, пробуем загрузить из локального кеша
                this.loadFromLocalStorage();
            }
        } catch (error) {
            console.error('Firebase Load Error:', error);
            this.showToast('Не удалось загрузить данные. Использую локальный кеш.', 'error');
            this.loadFromLocalStorage();
        }
    }

    async saveToFirebase() {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
            try {
                const docRef = doc(db, "tierlist_data", "main_state");
                // Сохраняем весь массив изображений в базу
                await setDoc(docRef, { images: this.state.images });
                
                // Дублируем в localStorage как резервную копию
                localStorage.setItem('drinkTierList', JSON.stringify(this.state.images));
            } catch (error) {
                console.error('Firebase Save Error:', error);
                localStorage.setItem('drinkTierList', JSON.stringify(this.state.images));
                this.showToast('Не удалось сохранить в базу. Сохранено локально.', 'error');
            }
        }, 1000); // Задержка 1 секунда, чтобы не отправлять запросы слишком часто
    }

    loadFromLocalStorage() {
        const local = localStorage.getItem('drinkTierList');
        if (local) {
            try {
                const data = JSON.parse(local);
                if (data.length > 0) {
                    this.state.images = data;
                    this.render();
                    this.showToast('Загружено из локального кеша', 'info');
                }
            } catch (e) {
                console.error('Parse error:', e);
            }
        }
    }

    // --- Чтение ссылки и добавление напитка ---

    async checkUrlAndAddDrink() {
        const urlParams = new URLSearchParams(window.location.search);
        const drinkUrl = urlParams.get('add'); // Ищем ?add=СсылкаНаКартинку
        
        if (drinkUrl) {
            await this.addImageByUrl(drinkUrl, true);
            // Очищаем ссылку, чтобы при обновлении страницы напиток не добавлялся повторно
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    // --- Добавление фото по ссылке ---

    async addImageByUrl(url, fromSharedLink = false) {
        if (!url || !url.trim()) {
            this.showToast('Введите ссылку на фото!', 'error');
            return;
        }

        // Простая проверка, что это похоже на URL картинки
        if (!url.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) && !url.includes('images/')) {
            this.showToast('Ссылка должна вести на изображение (JPG, PNG, WebP и т.д.)', 'error');
            return;
        }

        const id = `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        this.state.images.push({
            id: id,
            url: url.trim(),
            tier: 'library',
            order: this.state.images.length
        });

        this.render();
        await this.saveToFirebase();
        
        if (!fromSharedLink) {
            this.showToast('Фото добавлено по ссылке!', 'success');
        } else {
            this.showToast('Напиток из ссылки успешно добавлен!', 'success');
        }
    }

    // --- НОВАЯ ФУНКЦИЯ: Загрузка и сжатие файла ---

    async handleFileUpload(files) {
        if (!files || files.length === 0) return;

        this.dom.progressContainer.hidden = false;
        this.dom.progressBarFill.style.width = '0%';
        this.dom.progressText.textContent = '0%';

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            // Проверка размера (не даем грузить больше 10 МБ, чтобы браузер не завис)
            if (file.size > 10 * 1024 * 1024) { 
                this.showToast(`Файл ${file.name} слишком большой (макс 10 МБ).`, 'error');
                continue;
            }

            try {
                // Сжимаем картинку с помощью Canvas до 400px
                const compressedUrl = await this.compressImage(file, 400);
                
                const id = `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                this.state.images.push({
                    id: id,
                    url: compressedUrl, // Сохраняем сжатую картинку как Base64 строку
                    tier: 'library',
                    order: this.state.images.length
                });

            } catch (error) {
                console.error('Upload Error:', error);
                this.showToast(`Ошибка загрузки ${file.name}.`, 'error');
            }

            // Обновляем прогресс-бар
            const progress = Math.round(((i + 1) / files.length) * 100);
            this.dom.progressBarFill.style.width = `${progress}%`;
            this.dom.progressText.textContent = `${progress}%`;
        }

        this.dom.progressContainer.hidden = true;
        this.render();
        await this.saveToFirebase();
        this.showToast('Фото успешно загружены!', 'success');
    }

    // --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: Сжатие изображения ---
    // Берет файл, рисует на скрытом холсте (canvas) и сохраняет в сжатом виде
    compressImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxSize) {
                            height *= maxSize / width;
                            width = maxSize;
                        }
                    } else {
                        if (height > maxSize) {
                            width *= maxSize / height;
                            height = maxSize;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Сохраняем в формате JPEG с качеством 70% (очень легкий вес)
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
                img.onerror = reject;
                img.src = event.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // --- Удаление фото ---

    async deleteImage(id) {
        this.state.images = this.state.images.filter(img => img.id !== id);
        this.render();
        await this.saveToFirebase();
        this.showToast('Фото удалено.', 'success');
    }

    // --- Очистка всего ---

    async clearAll() {
        if (confirm('Удалить все фото и сбросить тир-лист для всех?')) {
            this.state.images = [];
            localStorage.removeItem('drinkTierList');
            this.render();
            await this.saveToFirebase();
            this.showToast('Всё очищено!', 'success');
        }
    }

    // --- Перемещение по уровням ---

    async moveToTier(id, tier) {
        const img = this.state.images.find(i => i.id === id);
        if (img) {
            img.tier = tier;
            this.render();
            await this.saveToFirebase();
        }
    }

    // --- Рендеринг ---

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

        if (this.state.images.length === 0) {
            this.dom.emptyState.style.display = 'block';
        } else {
            this.dom.emptyState.style.display = 'none';
        }

        const sortedImages = [...this.state.images].sort((a, b) => (a.order || 0) - (b.order || 0));

        sortedImages.forEach(img => {
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
        card.draggable = true;
        card.dataset.id = img.id;
        card.innerHTML = `
            <img src="${img.url}" loading="lazy" alt="Drink" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23666%22 stroke-width=%222%22%3E%3Crect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/%3E%3Ccircle cx=%228.5%22 cy=%228.5%22 r=%221.5%22/%3E%3Cpath d=%22M21 15l-5-5-5 5-4-4-3 3%22/%3E%3C/svg%3E';">
            <button class="drink-card__delete"><i class="fas fa-times"></i></button>
        `;
        
        card.addEventListener('dragstart', (e) => this.handleDragStart(e, img.id));
        card.addEventListener('dragend', this.handleDragEnd.bind(this));
        card.addEventListener('touchstart', (e) => this.handleTouchStart(e, img.id), {passive: true});
        card.addEventListener('touchmove', (e) => this.handleTouchMove(e), {passive: false});
        card.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        card.querySelector('.drink-card__delete').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteImage(img.id);
        });

        return card;
    }

    // --- Drag & Drop ---

    handleDragStart(e, id) {
        this.draggedItem = id;
        e.target.closest('.drink-card')?.classList.add('dragging');
    }

    handleDragEnd(e) {
        e.target.closest('.drink-card')?.classList.remove('dragging');
        this.draggedItem = null;
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

    // --- Touch (Mobile) ---

    handleTouchStart(e, id) {
        this.draggedItem = id;
        this.touchTimer = setTimeout(() => {
            this.dom.modal.classList.add('active');
            this.renderModalTiers();
        }, 500);
    }

    handleTouchMove(e) {
        if (this.touchTimer) {
            clearTimeout(this.touchTimer);
            this.touchTimer = null;
            e.preventDefault(); 
        }
    }

    handleTouchEnd(e) {
        if (this.touchTimer) {
            clearTimeout(this.touchTimer);
            this.touchTimer = null;
        }
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
        libBtn.innerHTML = '<i class="fas fa-images"></i>';
        libBtn.onclick = () => {
            this.moveToTier(this.draggedItem, 'library');
            this.dom.modal.classList.remove('active');
        };
        this.dom.modalTiers.appendChild(libBtn);
    }

    // --- Экспорт в PNG ---

    exportToPNG() {
        if (typeof html2canvas !== 'undefined') {
            html2canvas(this.dom.tierList, { backgroundColor: null }).then(canvas => {
                const link = document.createElement('a');
                link.download = 'drink-tier-list.png';
                link.href = canvas.toDataURL();
                link.click();
            }).catch(err => {
                console.error(err);
                this.showToast('Ошибка экспорта.', 'error');
            });
        } else {
            this.showToast('Библиотека html2canvas не загружена.', 'error');
        }
    }

    // --- Поделиться ---

    async share() {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: '🍺 Drink Tier List',
                    text: 'Посмотри мой тир-лист напитков!',
                    url: window.location.href
                });
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error(err);
                }
            }
        } else {
            this.showToast('Web Share не поддерживается.', 'error');
        }
    }

    // --- Тост-уведомления ---

    showToast(message, type = '') {
        const toast = document.createElement('div');
        toast.className = `toast ${type ? 'toast--' + type : ''}`;
        toast.textContent = message;
        this.dom.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // --- Переключение темы ---

    toggleTheme() {
        document.documentElement.classList.toggle('dark-theme');
        document.documentElement.classList.toggle('light-theme');
        const icon = this.dom.themeToggle.querySelector('i');
        if (document.documentElement.classList.contains('light-theme')) {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
    }

    // --- События ---

    bindEvents() {
        // Загрузка по ссылке
        this.dom.addUrlBtn?.addEventListener('click', () => {
            const url = this.dom.urlInput?.value;
            this.addImageByUrl(url);
            if (this.dom.urlInput) this.dom.urlInput.value = '';
        });

        this.dom.urlInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.addImageByUrl(e.target.value);
                e.target.value = '';
            }
        });

        // Загрузка файлов с ПК и Телефона (ЧЕРЕЗ ВЫБОР ФАЙЛА)
        this.dom.uploadZone?.addEventListener('click', () => this.dom.fileInput?.click());
        this.dom.fileInput?.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
            e.target.value = ''; // Сбрасываем, чтобы можно было выбрать тот же файл снова
        });

        // Загрузка файлов перетаскиванием (Drag & Drop)
        this.dom.uploadZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dom.uploadZone.classList.add('dragover');
        });
        this.dom.uploadZone?.addEventListener('dragleave', () => this.dom.uploadZone?.classList.remove('dragover'));
        this.dom.uploadZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dom.uploadZone?.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                this.handleFileUpload(e.dataTransfer.files);
            }
        });

        this.dom.clearBtn?.addEventListener('click', () => this.clearAll());
        this.dom.themeToggle?.addEventListener('click', () => this.toggleTheme());
        this.dom.exportBtn?.addEventListener('click', () => this.exportToPNG());
        this.dom.shareBtn?.addEventListener('click', () => this.share());
        this.dom.closeModalBtn?.addEventListener('click', () => this.dom.modal?.classList.remove('active'));

        this.setupDropZones();
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    const app = new TierListApp();
    app.init();
});
