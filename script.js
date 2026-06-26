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
    // МОДЕЛЬ КОРЗИНЫ
    // Хранится в localStorage, поэтому переживает переход между
    // страницами сайта (index.html, страницы сортов, cart.html).
    // Формат записи: { id, name, weight, price, qty, img }
    // ============================================================
    const CART_STORAGE_KEY = 'divno-honey-cart';

    const Cart = {
        read() {
            try {
                const raw = localStorage.getItem(CART_STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed : [];
            } catch (err) {
                // Битые данные в localStorage не должны положить весь сайт —
                // просто стартуем с пустой корзиной и сообщаем в консоль
                console.warn('Не удалось прочитать корзину из localStorage:', err);
                return [];
            }
        },
        write(items) {
            try {
                localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
            } catch (err) {
                console.warn('Не удалось сохранить корзину в localStorage:', err);
            }
            Cart.notify();
        },
        // Подписчики на изменения корзины (рендер панели, рендер страницы cart.html, счётчик в шапке)
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

    // Если корзину поменяли в другой вкладке этого же сайта — обновляем UI и здесь
    window.addEventListener('storage', (e) => {
        if (e.key === CART_STORAGE_KEY) Cart.notify();
    });

    // ============================================================
    // СЧЁТЧИК КОРЗИНЫ В ШАПКЕ (есть на всех страницах сайта)
    // ============================================================
    const cartCountSpan = document.getElementById('cart-count');
    const renderCartCount = (items) => {
        if (!cartCountSpan) return;
        const count = Cart.totalCount(items);
        cartCountSpan.textContent = count;
        cartCountSpan.dataset.zero = count === 0 ? 'true' : 'false';
    };
    Cart.onChange(renderCartCount);

    // ============================================================
    // ПАНЕЛЬ КОРЗИНЫ (выезжает справа на любой странице сайта)
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

    // Делегируем клики внутри панели на +/−/удалить, чтобы не навешивать
    // обработчики заново при каждом перерендере содержимого
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
    // 1. ИЗМЕНЕНИЕ ЦЕНЫ В ЗАВИСИМОСТИ ОТ ВЕСА (карточки в каталоге на главной)
    // ============================================================
    const formatSelectors = document.querySelectorAll('.format-select');
    formatSelectors.forEach(select => {
        select.addEventListener('change', (e) => {
            const card = e.target.closest('.product-card');
            if (!card) return;

            const priceVal = card.querySelector('.price-val');
            if (priceVal) {
                priceVal.textContent = e.target.value;
            }
        });
    });

    // ============================================================
    // 2. ФИЛЬТРАЦИЯ СОРТОВ МЁДА (только на главной)
    // ============================================================
    const filterButtons = document.querySelectorAll('.filter-btn');
    const productCards = document.querySelectorAll('.product-card');

    const knownCategories = new Set(
        Array.from(filterButtons).map(b => b.dataset.category)
    );
    productCards.forEach(card => {
        const cardCategory = card.dataset.category;
        if (filterButtons.length && !knownCategories.has(cardCategory)) {
            console.warn('Карточка товара с неизвестной категорией:', cardCategory, card);
        }
    });

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
    // 3. ДОБАВЛЕНИЕ В ИЗБРАННОЕ (визуальное состояние кнопки + счётчик в шапке)
    // ============================================================
    const favButtons = document.querySelectorAll('.btn-favorite');
    const favCountSpan = document.getElementById('fav-count');
    let favCount = favCountSpan ? parseInt(favCountSpan.textContent || '0', 10) : 0;

    const renderFavCount = () => {
        if (!favCountSpan) return;
        favCountSpan.textContent = favCount;
        favCountSpan.dataset.zero = favCount === 0 ? 'true' : 'false';
    };
    renderFavCount();

    favButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');

            favCount += btn.classList.contains('active') ? 1 : -1;
            renderFavCount();
            triggerWidgetBump('fav-count');
        });
    });

    // ============================================================
    // 4. КНОПКА "В КОРЗИНУ" — карточки каталога на главной
    //    Добавляет товар в реальную модель Cart, а не только мигает.
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

            if (!id) {
                // Защита от карточек без data-product-id (опечатка в разметке) —
                // без идентификатора товар нельзя надёжно отличить от другого в корзине
                console.warn('У карточки товара нет data-product-id, добавление в корзину отменено:', card);
                return;
            }

            Cart.add({ id, name, weight, price, img });

            triggerWidgetBump('cart-count');

            btn.classList.add('in-cart');
            const label = btn.querySelector('.btn-buy-label');
            if (label) label.textContent = 'В корзине';

            if (buttonTimeouts.has(btn)) {
                clearTimeout(buttonTimeouts.get(btn));
            }
            const timeoutId = setTimeout(() => {
                btn.classList.remove('in-cart');
                if (label) label.textContent = 'В корзину';
                buttonTimeouts.delete(btn);
            }, 1200);
            buttonTimeouts.set(btn, timeoutId);
        });
    });

// ============================================================
    // 4b. КНОПКА "В КОРЗИНУ" — карточка заказа на странице отдельного сорта
    // ============================================================
    const cardAddButtons = document.querySelectorAll('.btn-card-add-to-cart');
    cardAddButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Добавили productImg в получение данных!
            const { productId, productName, productWeight, productPrice, productImg } = btn.dataset;
            if (!productId) {
                console.warn('У кнопки добавления в корзину нет data-product-id:', btn);
                return;
            }

            Cart.add({
                id: productId,
                name: productName || 'Сортовой мёд',
                weight: productWeight || '1 кг',
                price: productPrice || '0',
                img: productImg || '' // <--- ТЕПЕРЬ ФОТО БЕРЕТСЯ ИЗ КНОПКИ
            });

            triggerWidgetBump('cart-count');

            btn.classList.add('in-cart');
            if (buttonTimeouts.has(btn)) {
                clearTimeout(buttonTimeouts.get(btn));
            }
            const timeoutId = setTimeout(() => {
                btn.classList.remove('in-cart');
                buttonTimeouts.delete(btn);
            }, 1200);
            buttonTimeouts.set(btn, timeoutId);
        });
    });

    // ============================================================
    // 5. АККОРДЕОН FAQ (главная и faq.html)
    // ============================================================
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (!question) return;

        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            faqItems.forEach(other => other.classList.remove('active'));
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    // ============================================================
    // 6. МОДАЛЬНОЕ ОКНО "КУПИТЬ В 1 КЛИК" (Изолировано от ошибок)
    // ============================================================
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

                if (modalProductInfo) {
                    modalProductInfo.textContent = `${name} (${weight}) — ${price} ₽`;
                }
                modal.classList.add('open');
            });
        });

        if (closeModal) {
            closeModal.addEventListener('click', () => modal.classList.remove('open'));
        }

        window.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('open');
        });

        if (oneClickForm) {
            oneClickForm.addEventListener('submit', (e) => {
                e.preventDefault();
                alert('Спасибо за заказ! Наш пчеловод свяжется с вами в течение 10 минут для подтверждения.');
                modal.classList.remove('open');
                oneClickForm.reset();
            });
        }
    }

    // ============================================================
    // 7. СТРАНИЦА КОРЗИНЫ / ОФОРМЛЕНИЯ ЗАКАЗА (cart.html)
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
        if (!cartPageItemsContainer) return; // Этого блока нет вне cart.html

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

    // Первичная отрисовка состояния корзины на загрузке любой страницы сайта
    Cart.notify();
});