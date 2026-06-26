document.addEventListener('DOMContentLoaded', () => {

    // ============================================================
    // ВСПОМОГАТЕЛЬНОЕ: микро-анимация "подпрыгивания" виджетов шапки
    // ============================================================
    const bumpTimeouts = new Map();
    const triggerWidgetBump = (elementId) => {
        const element = document.getElementById(elementId);
        if (!element) return;
        const wrapper = element.closest('.cart-widget') || element.closest('.fav-widget') || element;

        if (bumpTimeouts.has(wrapper)) {
            clearTimeout(bumpTimeouts.get(wrapper));
        }

        wrapper.classList.add('bump');
        const timeoutId = setTimeout(() => {
            wrapper.classList.remove('bump');
            bumpTimeouts.delete(wrapper);
        }, 200);
        bumpTimeouts.set(wrapper, timeoutId);
    };

    const formatPrice = (value) => `${value.toLocaleString('ru-RU')} ₽`;

    // ============================================================
    // МОДЕЛЬ ИЗБРАННОГО (Сохраняем в localStorage)
    // ============================================================
    const FAV_STORAGE_KEY = 'divno-honey-fav';

    const Fav = {
        read() {
            try {
                const raw = localStorage.getItem(FAV_STORAGE_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch (err) {
                return [];
            }
        },
        write(items) {
            localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(items));
            Fav.notify();
        },
        listeners: [],
        onChange(fn) { Fav.listeners.push(fn); },
        notify() { Fav.listeners.forEach(fn => fn(Fav.read())); },

        toggle({ id, name, img, link, price }) {
            let items = Fav.read();
            const exists = items.find(it => it.id === id);
            if (exists) {
                items = items.filter(it => it.id !== id); // Удаляем, если уже есть
            } else {
                items.push({ id, name, img, link, price }); // Добавляем, если нет
            }
            Fav.write(items);
            return !exists; // возвращает true, если добавлено
        },
        remove(id) {
            let items = Fav.read().filter(it => it.id !== id);
            Fav.write(items);
        },
        has(id) {
            return Fav.read().some(it => it.id === id);
        }
    };

    // ============================================================
    // МОДЕЛЬ КОРЗИНЫ
    // ============================================================
    const CART_STORAGE_KEY = 'divno-honey-cart';

    const Cart = {
        read() {
            try {
                const raw = localStorage.getItem(CART_STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed : [];
            } catch (err) {
                return [];
            }
        },
        write(items) {
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
            Cart.notify();
        },
        listeners: [],
        onChange(fn) { Cart.listeners.push(fn); },
        notify() { Cart.listeners.forEach(fn => fn(Cart.read())); },

        add({ id, name, weight, price, img }) {
            const items = Cart.read();
            const existing = items.find(it => it.id === id && it.weight === weight);
            if (existing) {
                existing.qty += 1;
            } else {
                items.push({ id, name, weight, price: Number(price), qty: 1, img: img || '' });
            }
            Cart.write(items);
        },
        setQty(id, weight, qty) {
            let items = Cart.read();
            if (qty <= 0) {
                items = items.filter(it => !(it.id === id && it.weight === weight));
            } else {
                const existing = items.find(it => it.id === id && it.weight === weight);
                if (existing) existing.qty = qty;
            }
            Cart.write(items);
        },
        remove(id, weight) {
            const items = Cart.read().filter(it => !(it.id === id && it.weight === weight));
            Cart.write(items);
        },
        clear() {
            Cart.write([]);
        },
        totalCount(items) {
            return items.reduce((sum, it) => sum + it.qty, 0);
        },
        totalPrice(items) {
            return items.reduce((sum, it) => sum + it.qty * it.price, 0);
        }
    };

    window.addEventListener('storage', (e) => {
        if (e.key === CART_STORAGE_KEY) Cart.notify();
        if (e.key === FAV_STORAGE_KEY) Fav.notify();
    });

    // ============================================================
    // СЧЁТЧИКИ В ШАПКЕ И КЛИК ПО ВИДЖЕТАМ
    // ============================================================
    const cartCountSpan = document.getElementById('cart-count');
    Cart.onChange((items) => {
        if (cartCountSpan) cartCountSpan.textContent = Cart.totalCount(items);
    });

    const favCountSpan = document.getElementById('fav-count');
    Fav.onChange((items) => {
        if (favCountSpan) favCountSpan.textContent = items.length;
    });

    // Делаем виджет Избранного кликабельным без изменения HTML
    document.querySelectorAll('.fav-widget').forEach(widget => {
        widget.addEventListener('click', () => {
            window.location.href = 'favorites.html';
        });
    });

    // ============================================================
    // ПАНЕЛЬ КОРЗИНЫ (выезжает справа)
    // ============================================================
    const cartWidget = document.getElementById('cartWidget');
    const cartDrawer = document.getElementById('cartDrawer');
    const cartDrawerOverlay = document.getElementById('cartDrawerOverlay');
    const cartDrawerClose = document.getElementById('cartDrawerClose');
    const cartDrawerBody = document.getElementById('cartDrawerBody');
    const cartDrawerFooter = document.getElementById('cartDrawerFooter');
    const cartDrawerSubtotal = document.getElementById('cartDrawerSubtotal');

    const EMPTY_CART_SVG = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
            <path d="M3 4h2l2.4 12.5a2 2 0 0 0 2 1.5h7.6a2 2 0 0 0 2-1.6L21 8H6"/>
            <circle cx="9" cy="20" r="1.3" fill="currentColor" stroke="none"/>
            <circle cx="17" cy="20" r="1.3" fill="currentColor" stroke="none"/>
        </svg>`;

    const REMOVE_ICON_SVG = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M6 6l12 12M18 6L6 18"/>
        </svg>`;

    const renderCartDrawer = (items) => {
        if (!cartDrawerBody) return;

        if (items.length === 0) {
            cartDrawerBody.innerHTML = `
                <div class="cart-drawer-empty">
                    <div class="empty-icon">${EMPTY_CART_SVG}</div>
                    <p>Корзина пока пуста. Загляните в <a href="index.html#catalog">каталог</a> — там ждёт настоящий мёд с кочевой пасеки.</p>
                </div>`;
            if (cartDrawerFooter) cartDrawerFooter.style.display = 'none';
            return;
        }

        cartDrawerBody.innerHTML = items.map(it => `
            <div class="cart-line-item" data-id="${it.id}" data-weight="${it.weight}">
                <div class="cart-line-thumb">
                    ${it.img ? `<img src="${it.img}" alt="${it.name}">` : ''}
                </div>
                <div class="cart-line-info">
                    <h4>${it.name}</h4>
                    <div class="cart-line-meta">${it.weight}</div>
                    <div class="cart-line-qty">
                        <button type="button" class="cart-qty-minus" aria-label="Уменьшить количество">−</button>
                        <span>${it.qty}</span>
                        <button type="button" class="cart-qty-plus" aria-label="Увеличить количество">+</button>
                    </div>
                </div>
                <div class="cart-line-right">
                    <button type="button" class="cart-line-remove" aria-label="Убрать из корзины">${REMOVE_ICON_SVG}</button>
                    <div class="cart-line-price">${formatPrice(it.qty * it.price)}</div>
                </div>
            </div>
        `).join('');

        if (cartDrawerFooter) cartDrawerFooter.style.display = 'block';
        if (cartDrawerSubtotal) cartDrawerSubtotal.textContent = formatPrice(Cart.totalPrice(items));
    };
    Cart.onChange(renderCartDrawer);

    if (cartDrawerBody) {
        cartDrawerBody.addEventListener('click', (e) => {
            const line = e.target.closest('.cart-line-item');
            if (!line) return;
            const { id, weight } = line.dataset;
            const items = Cart.read();
            const current = items.find(it => it.id === id && it.weight === weight);
            if (!current) return;

            if (e.target.closest('.cart-qty-plus')) {
                Cart.setQty(id, weight, current.qty + 1);
            } else if (e.target.closest('.cart-qty-minus')) {
                Cart.setQty(id, weight, current.qty - 1);
            } else if (e.target.closest('.cart-line-remove')) {
                Cart.remove(id, weight);
            }
        });
    }

    const openCartDrawer = () => {
        if (!cartDrawer) return;
        cartDrawer.classList.add('open');
        if (cartDrawerOverlay) cartDrawerOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    };
    const closeCartDrawer = () => {
        if (!cartDrawer) return;
        cartDrawer.classList.remove('open');
        if (cartDrawerOverlay) cartDrawerOverlay.classList.remove('open');
        document.body.style.overflow = '';
    };

    if (cartWidget) cartWidget.addEventListener('click', openCartDrawer);
    if (cartDrawerClose) cartDrawerClose.addEventListener('click', closeCartDrawer);
    if (cartDrawerOverlay) cartDrawerOverlay.addEventListener('click', closeCartDrawer);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCartDrawer();
    });

    // ============================================================
    // 1. ИЗМЕНЕНИЕ ЦЕНЫ В ЗАВИСИМОСТИ ОТ ВЕСА
    // ============================================================
    const formatSelectors = document.querySelectorAll('.format-select');
    formatSelectors.forEach(select => {
        select.addEventListener('change', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;
            const priceVal = card.querySelector('.price-val');
            if (priceVal) priceVal.textContent = e.target.value;
        });
    });

    // ============================================================
    // 2. ФИЛЬТРАЦИЯ СОРТОВ МЁДА
    // ============================================================
    const filterButtons = document.querySelectorAll('.filter-btn');
    const productCards = document.querySelectorAll('.product-card');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const targetCategory = btn.dataset.category;

            productCards.forEach(card => {
                const cardCategory = card.dataset.category;
                if (targetCategory === 'all' || cardCategory === targetCategory) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });

    // ============================================================
    // 3. ДОБАВЛЕНИЕ В ИЗБРАННОЕ (кнопка в карточке)
    // ============================================================
    const favButtons = document.querySelectorAll('.btn-favorite');
    
    // При загрузке проверяем, какие товары уже в избранном, и закрашиваем сердечко
    favButtons.forEach(btn => {
        const card = btn.closest('.product-card');
        if (card && Fav.has(card.dataset.productId)) {
            btn.classList.add('active');
        }

        btn.addEventListener('click', () => {
            if (!card) return;
            const id = card.dataset.productId;
            const name = card.querySelector('h3')?.textContent?.trim() || 'Сортовой мёд';
            const img = card.querySelector('.product-img')?.getAttribute('src') || '';
            const link = card.querySelector('.about-honey-link')?.getAttribute('href') || '#';
            const price = card.querySelector('.price-val')?.textContent || '0';

            // Переключаем статус товара в памяти
            const isAdded = Fav.toggle({ id, name, img, link, price });
            
            btn.classList.toggle('active', isAdded);
            triggerWidgetBump('fav-count');
        });
    });

    // ============================================================
    // 4. КНОПКА "В КОРЗИНУ" (Главная страница)
    // ============================================================
    const buyButtons = document.querySelectorAll('.product-card .btn-buy');
    const buttonTimeouts = new Map();

    buyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.product-card');
            if (!card) return;

            const id = card.dataset.productId;
            const name = card.querySelector('h3')?.textContent?.trim() || 'Сортовой мёд';
            const img = card.querySelector('.product-img')?.getAttribute('src') || '';
            const select = card.querySelector('.format-select');

            let weight = '1 кг';
            let price = card.querySelector('.price-val')?.textContent || '0';

            if (select && select.selectedOptions.length > 0) {
                const selectedOption = select.selectedOptions[0];
                weight = selectedOption.dataset.weight || selectedOption.textContent;
                price = select.value;
            }

            if (!id) return;
            Cart.add({ id, name, weight, price, img });
            triggerWidgetBump('cart-count');

            btn.classList.add('in-cart');
            const label = btn.querySelector('.btn-buy-label');
            if (label) label.textContent = 'В корзине';

            if (buttonTimeouts.has(btn)) clearTimeout(buttonTimeouts.get(btn));
            const timeoutId = setTimeout(() => {
                btn.classList.remove('in-cart');
                if (label) label.textContent = 'В корзину';
                buttonTimeouts.delete(btn);
            }, 1200);
            buttonTimeouts.set(btn, timeoutId);
        });
    });

    // ============================================================
    // 4b. КНОПКА "В КОРЗИНУ" (Страница сорта)
    // ============================================================
    const cardAddButtons = document.querySelectorAll('.btn-card-add-to-cart');
    cardAddButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const { productId, productName, productWeight, productPrice, productImg } = btn.dataset;
            if (!productId) return;

            Cart.add({
                id: productId,
                name: productName || 'Сортовой мёд',
                weight: productWeight || '1 кг',
                price: productPrice || '0',
                img: productImg || ''
            });

            triggerWidgetBump('cart-count');
            btn.classList.add('in-cart');
            if (buttonTimeouts.has(btn)) clearTimeout(buttonTimeouts.get(btn));
            const timeoutId = setTimeout(() => {
                btn.classList.remove('in-cart');
                buttonTimeouts.delete(btn);
            }, 1200);
            buttonTimeouts.set(btn, timeoutId);
        });
    });

    // ============================================================
    // 5. РЕНДЕР СТРАНИЦЫ ИЗБРАННОГО (favorites.html)
    // ============================================================
    const favPageItemsContainer = document.getElementById('favPageItems');
    const favPageEmptyState = document.getElementById('favPageEmptyState');

    const renderFavPage = (items) => {
        if (!favPageItemsContainer) return;

        const isEmpty = items.length === 0;
        if (favPageEmptyState) favPageEmptyState.style.display = isEmpty ? 'block' : 'none';
        if (favPageItemsContainer) favPageItemsContainer.style.display = isEmpty ? 'none' : 'grid';
        if (isEmpty) return;

        favPageItemsContainer.innerHTML = items.map(it => `
            <div class="product-card" style="display: flex; flex-direction: column;">
                <div class="product-image-area">
                    ${it.img ? `<img src="${it.img}" class="product-img" alt="${it.name}">` : ''}
                </div>
                <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 24px; color: var(--dark-bg);">${it.name}</h3>
                <a href="${it.link}" class="about-honey-link">Перейти к описанию сорта</a>
                
                <div class="price-block" style="margin-top: auto; padding-top: 20px;">
                    <span class="price">${it.price} ₽</span>
                </div>
                
                <div class="product-actions" style="margin-top: 15px; display: flex; flex-direction: column; gap: 10px;">
                    <button class="btn btn-buy fav-to-cart-btn" style="width: 100%;" data-id="${it.id}" data-name="${it.name}" data-img="${it.img}" data-price="${it.price}">В корзину</button>
                    <button class="btn-one-click fav-remove-btn" style="width: 100%; border-color: #eae4de; color: #a8a29e;" data-id="${it.id}">Убрать из избранного</button>
                </div>
            </div>
        `).join('');
    };

    Fav.onChange(renderFavPage);

    if (favPageItemsContainer) {
        favPageItemsContainer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.fav-remove-btn');
            if (removeBtn) {
                Fav.remove(removeBtn.dataset.id);
            }

            const cartBtn = e.target.closest('.fav-to-cart-btn');
            if (cartBtn) {
                Cart.add({
                    id: cartBtn.dataset.id,
                    name: cartBtn.dataset.name,
                    weight: '1 кг',
                    price: cartBtn.dataset.price,
                    img: cartBtn.dataset.img
                });
                triggerWidgetBump('cart-count');
                
                cartBtn.textContent = 'В корзине ✓';
                cartBtn.style.background = '#2e7d32';
                setTimeout(() => {
                    cartBtn.textContent = 'В корзину';
                    cartBtn.style.background = '';
                }, 1200);
            }
        });
    }

    // ============================================================
    // 6. СТРАНИЦА КОРЗИНЫ / ОФОРМЛЕНИЯ ЗАКАЗА (cart.html)
    // ============================================================
    const cartPageItemsContainer = document.getElementById('cartPageItems');
    const cartPageEmptyState = document.getElementById('cartPageEmptyState');
    const cartPageLayout = document.getElementById('cartPageLayout');
    const cartSummaryItemsCount = document.getElementById('cartSummaryItemsCount');
    const cartSummarySubtotal = document.getElementById('cartSummarySubtotal');
    const cartSummaryTotal = document.getElementById('cartSummaryTotal');
    const checkoutForm = document.getElementById('checkoutForm');

    const DELIVERY_COST = 350;
    const FREE_DELIVERY_THRESHOLD = 3000;

    const renderCartPage = (items) => {
        if (!cartPageItemsContainer) return; 

        const isEmpty = items.length === 0;
        if (cartPageEmptyState) cartPageEmptyState.style.display = isEmpty ? 'block' : 'none';
        if (cartPageLayout) cartPageLayout.style.display = isEmpty ? 'none' : 'grid';
        if (isEmpty) return;

        cartPageItemsContainer.innerHTML = items.map(it => `
            <div class="cart-table-row" data-id="${it.id}" data-weight="${it.weight}">
                <div class="cart-table-thumb">
                    ${it.img ? `<img src="${it.img}" alt="${it.name}">` : ''}
                </div>
                <div class="cart-table-info">
                    <h3>${it.name}</h3>
                    <div class="cart-table-meta">${it.weight}</div>
                </div>
                <div class="cart-table-unit-price">${formatPrice(it.price)} / шт</div>
                <div class="cart-line-qty">
                    <button type="button" class="cart-qty-minus" aria-label="Уменьшить количество">−</button>
                    <span>${it.qty}</span>
                    <button type="button" class="cart-qty-plus" aria-label="Увеличить количество">+</button>
                </div>
                <div class="cart-table-line-total">${formatPrice(it.qty * it.price)}</div>
            </div>
        `).join('');

        const subtotal = Cart.totalPrice(items);
        const deliveryCost = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_COST;
        const total = subtotal + deliveryCost;

        if (cartSummaryItemsCount) cartSummaryItemsCount.textContent = Cart.totalCount(items);
        if (cartSummarySubtotal) cartSummarySubtotal.textContent = formatPrice(subtotal);
        if (cartSummaryTotal) cartSummaryTotal.textContent = formatPrice(total);

        const deliveryRow = document.getElementById('cartSummaryDelivery');
        if (deliveryRow) {
            deliveryRow.textContent = deliveryCost === 0 ? 'Бесплатно' : formatPrice(deliveryCost);
        }
    };
    Cart.onChange(renderCartPage);

    if (cartPageItemsContainer) {
        cartPageItemsContainer.addEventListener('click', (e) => {
            const row = e.target.closest('.cart-table-row');
            if (!row) return;
            const { id, weight } = row.dataset;
            const items = Cart.read();
            const current = items.find(it => it.id === id && it.weight === weight);
            if (!current) return;

            if (e.target.closest('.cart-qty-plus')) {
                Cart.setQty(id, weight, current.qty + 1);
            } else if (e.target.closest('.cart-qty-minus')) {
                Cart.setQty(id, weight, current.qty - 1);
            }
        });
    }

    if (checkoutForm) {
        checkoutForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const items = Cart.read();
            if (items.length === 0) {
                alert('Корзина пуста — добавьте хотя бы один товар перед оформлением заказа.');
                return;
            }
            alert('Спасибо за заказ! Наш пчеловод свяжется с вами в течение 10 минут для подтверждения деталей доставки и оплаты.');
            Cart.clear();
            checkoutForm.reset();
        });
    }

    // ============================================================
    // 7. FAQ АККОРДЕОН И МОДАЛКА
    // ============================================================
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (!question) return;
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            faqItems.forEach(other => other.classList.remove('active'));
            if (!isActive) item.classList.add('active');
        });
    });

    const oneClickButtons = document.querySelectorAll('.btn-one-click');
    const modal = document.getElementById('oneClickModal');
    const closeModal = document.querySelector('.close-modal');
    const modalProductInfo = document.getElementById('modalProductInfo');
    const oneClickForm = document.getElementById('oneClickForm');

    if (modal) {
        oneClickButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.target.closest('.product-card');
                if (!card) return;
                const name = card.querySelector('h3')?.textContent || 'Сортовой мёд';
                const select = card.querySelector('.format-select');
                let weight = 'Не указан';
                let price = '0';
                if (select && select.selectedOptions.length > 0) {
                    const selectedOption = select.selectedOptions[0];
                    weight = selectedOption.dataset.weight || selectedOption.textContent;
                    price = select.value;
                }
                if (modalProductInfo) modalProductInfo.textContent = `${name} (${weight}) — ${price} ₽`;
                modal.classList.add('open');
            });
        });

        if (closeModal) closeModal.addEventListener('click', () => modal.classList.remove('open'));
        window.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

        if (oneClickForm) {
            oneClickForm.addEventListener('submit', (e) => {
                e.preventDefault();
                alert('Спасибо за заказ! Наш пчеловод свяжется с вами в течение 10 минут для подтверждения.');
                modal.classList.remove('open');
                oneClickForm.reset();
            });
        }
    }

    // Первичная отрисовка состояния на загрузке любой страницы сайта
    Cart.notify();
    Fav.notify();
});
