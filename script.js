// script.js — версия с хранением данных на GitHub и добавлением фото по ссылкам
// Токен берётся из переменной окружения GITHUB_TOKEN (Netlify)

class TierListApp {
    constructor() {
        // НАСТРОЙКА: замените на свои данные
        this.config = {
            // Токен берётся из переменной окружения Netlify
            githubToken: process.env.GITHUB_TOKEN || '',
            owner: 'hemo777xx',               // Ваш ник на GitHub
            repo: 'tier-data',                // Название репозитория для данных
            collection: 'tierList'            // Имя файла (коллекции)
        };

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
        await this.loadFromGitHub();
    }

    // --- Работа с GitHub как с БД ---

    async loadFromGitHub() {
        // Проверяем, есть ли токен
        if (!this.config.githubToken) {
            this.showToast('GitHub токен не настроен. Добавьте переменную GITHUB_TOKEN в Netlify.', 'error');
            this.loadFromLocalStorage();
            return;
        }

        try {
            const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${this.config.collection}.json`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${this.config.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.status === 404) {
                // Файла нет — создаём пустой
                this.state.images = [];
                this.render();
                this.showToast('Нет сохранённых данных. Начните добавлять фото!', 'info');
                return;
            }

            if (!response.ok) throw new Error(`Failed to load data from GitHub: ${response.status}`);
            
            const data = await response.json();
            const content = JSON.parse(atob(data.content));
            this.state.images = content.images || [];
            this.render();
            this.showToast('Данные загружены с GitHub!', 'success');
        } catch (error) {
            console.error('GitHub Load Error:', error);
            this.showToast('Не удалось загрузить данные с GitHub. Использую локальный кеш.', 'error');
            this.loadFromLocalStorage();
        }
    }

    async saveToGitHub() {
        // Проверяем, есть ли токен
        if (!this.config.githubToken) {
            console.warn('GitHub токен не настроен. Данные сохранены только локально.');
            localStorage.setItem('drinkTierList', JSON.stringify(this.state.images));
            this.showToast('Данные сохранены локально (токен не настроен).', 'error');
            return;
        }

        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
            try {
                const content = btoa(JSON.stringify({ images: this.state.images }, null, 2));
                const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${this.config.collection}.json`;
                
                // Сначала получаем SHA текущего файла (для обновления)
                let sha = '';
                try {
                    const getRes = await fetch(url, {
                        headers: { 'Authorization': `token ${this.config.githubToken}` }
                    });
                    if (getRes.ok) {
                        const data = await getRes.json();
                        sha = data.sha;
                    }
                } catch (e) { /* Файла нет — создаём новый */ }

                const body = JSON.stringify({
                    message: `Update tier list - ${new Date().toISOString()}`,
                    content: content,
                    sha: sha || undefined
                });

                const response = await fetch(url, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${this.config.githubToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: body
                });

                if (!response.ok) throw new Error(`Failed to save to GitHub: ${response.status}`);
                
                // Сохраняем в localStorage как резерв
                localStorage.setItem('drinkTierList', JSON.stringify(this.state.images));
                this.showToast('Данные сохранены на GitHub!', 'success');
            } catch (error) {
                console.error('GitHub Save Error:', error);
                // Сохраняем хотя бы в localStorage
                localStorage.setItem('drinkTierList', JSON.stringify(this.state.images));
                this.showToast('Не удалось сохранить на GitHub. Данные сохранены локально.', 'error');
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
                    this.showToast('Загружено из локального кеша', 'info');
                }
            } catch (e) {
                console.error('Parse error:', e);
            }
        }
    }

    // --- Добавление фото по ссылке ---

    async addImageByUrl(url) {
        if (!url || !url.trim()) {
            this.showToast('Введите ссылку на фото!', 'error');
            return;
        }

        // Простая проверка, что это похоже на URL картинки
        if (!url.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) && !url.includes('images/')) {
            this.showToast('Ссылка должна вести на изображение (JPG, PNG, WebP и т.д.)', 'error');
            return;
        }

        // Генерируем уникальный ID
        const id = `img_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        this.state.images.push({
            id: id,
            url: url.trim(),
            tier: 'library',
            order: this.state.images.length
        });

        this.render();
        await this.saveToGitHub();
        this.showToast('Фото добавлено по ссылке!', 'success');
    }

    // --- Удаление фото ---

    async deleteImage(id) {
        this.state.images = this.state.images.filter(img => img.id !== id);
        this.render();
        await this.saveToGitHub();
        this.showToast('Фото удалено.', 'success');
    }

    // --- Очистка всего ---

    clearAll() {
        if (confirm('Удалить все фото и сбросить тир-лист?')) {
            this.state.images = [];
            localStorage.removeItem('drinkTierList');
            this.render();
            this.saveToGitHub();
            this.showToast('Всё очищено!', 'success');
        }
    }

    // --- Перемещение по уровням ---

    moveToTier(id, tier) {
        const img = this.state.images.find(i => i.id === id);
        if (img) {
            img.tier = tier;
            this.render();
            this.saveToGitHub();
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
        card.addEventListener('touchmove', this.handleTouchMove.bind(this), {passive: false});
        card.addEventListener('touchend', this.handleTouchEnd.bind(this));

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
        }
    }

    handleTouchEnd() {
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

        // Старая загрузка файлов (можно оставить, но теперь это не обязательно)
        this.dom.uploadZone?.addEventListener('click', () => this.dom.fileInput?.click());
        this.dom.fileInput?.addEventListener('change', (e) => {
            this.showToast('Загрузка файлов отключена. Используйте добавление по ссылке.', 'error');
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
            this.showToast('Загрузка файлов отключена. Используйте добавление по ссылке.', 'error');
        });

        // Действия
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
