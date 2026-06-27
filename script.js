// Глобальная функция для вывода красивых уведомлений (Toasts)
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
document.addEventListener('DOMContentLoaded', () => {

    const formatPrice = (value) => `${value.toLocaleString('ru-RU')} ₽`;
    const API_URL = 'http://127.0.0.1:8000/api';
    // ============================================================
    // 1. МОДЕЛЬ ИЗБРАННОГО (LOCALSTORAGE)
    // ============================================================
    const FAV_STORAGE_KEY = 'divno-honey-fav';
    const Fav = {
        read() {
            try { return JSON.parse(localStorage.getItem(FAV_STORAGE_KEY)) || []; } catch(e) { return []; }
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
                items = items.filter(it => it.id !== id);
            } else {
                items.push({ id, name, img, link, price });
            }
            Fav.write(items);
            return !exists;
        },
        remove(id) {
            Fav.write(Fav.read().filter(it => it.id !== id));
        },
        has(id) {
            return Fav.read().some(it => it.id === id);
        }
    };

    const favCountSpan = document.getElementById('fav-count');
    Fav.onChange(items => { if (favCountSpan) favCountSpan.textContent = items.length; });

    document.querySelectorAll('.fav-widget').forEach(w => {
        w.addEventListener('click', () => window.location.href = 'favorites.html');
    });

    // ============================================================
    // 2. МОДЕЛЬ КОРЗИНЫ (LOCALSTORAGE)
    // ============================================================
    const CART_STORAGE_KEY = 'divno-honey-cart';
    const Cart = {
        read() {
            try { return JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || []; } catch (e) { return []; }
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
            if (existing) existing.qty += 1;
            else items.push({ id, name, weight, price: Number(price), qty: 1, img: img || '' });
            Cart.write(items);
        },
        setQty(id, weight, qty) {
            let items = Cart.read();
            if (qty <= 0) items = items.filter(it => !(it.id === id && it.weight === weight));
            else {
                const existing = items.find(it => it.id === id && it.weight === weight);
                if (existing) existing.qty = qty;
            }
            Cart.write(items);
        },
        remove(id, weight) {
            Cart.write(Cart.read().filter(it => !(it.id === id && it.weight === weight)));
        },
        clear() { Cart.write([]); },
        totalCount(items) { return items.reduce((sum, it) => sum + it.qty, 0); },
        totalPrice(items) { return items.reduce((sum, it) => sum + it.qty * it.price, 0); }
    };

    const cartCountSpan = document.getElementById('cart-count');
    Cart.onChange(items => { if (cartCountSpan) cartCountSpan.textContent = Cart.totalCount(items); });

    window.addEventListener('storage', (e) => {
        if (e.key === CART_STORAGE_KEY) Cart.notify();
        if (e.key === FAV_STORAGE_KEY) Fav.notify();
    });

    // ============================================================
    // 3. ИНТЕРФЕЙС ВЫЕЗЖАЮЩЕЙ КОРЗИНЫ (DRAWER)
    // ============================================================
    const cartWidget = document.getElementById('cartWidget');
    const cartDrawer = document.getElementById('cartDrawer');
    const cartDrawerOverlay = document.getElementById('cartDrawerOverlay');
    const cartDrawerClose = document.getElementById('cartDrawerClose');
    const cartDrawerBody = document.getElementById('cartDrawerBody');
    const cartDrawerFooter = document.getElementById('cartDrawerFooter');
    const cartDrawerSubtotal = document.getElementById('cartDrawerSubtotal');

    const EMPTY_CART_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4h2l2.4 12.5a2 2 0 0 0 2 1.5h7.6a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="20" r="1.3" fill="currentColor" stroke="none"/><circle cx="17" cy="20" r="1.3" fill="currentColor" stroke="none"/></svg>`;
    const REMOVE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

    Cart.onChange(items => {
        if (!cartDrawerBody) return;
        if (items.length === 0) {
            cartDrawerBody.innerHTML = `<div class="cart-drawer-empty"><div class="empty-icon">${EMPTY_CART_SVG}</div><p>Корзина пока пуста. Загляните в <a href="index.html#catalog">каталог</a>.</p></div>`;
            if (cartDrawerFooter) cartDrawerFooter.style.display = 'none';
            return;
        }
        cartDrawerBody.innerHTML = items.map(it => `
            <div class="cart-line-item" data-id="${it.id}" data-weight="${it.weight}">
                <div class="cart-line-thumb">${it.img ? `<img src="${it.img}">` : ''}</div>
                <div class="cart-line-info">
                    <h4>${it.name}</h4><div class="cart-line-meta">${it.weight}</div>
                    <div class="cart-line-qty">
                        <button class="cart-qty-minus">−</button><span>${it.qty}</span><button class="cart-qty-plus">+</button>
                    </div>
                </div>
                <div class="cart-line-right">
                    <button class="cart-line-remove">${REMOVE_ICON_SVG}</button>
                    <div class="cart-line-price">${formatPrice(it.qty * it.price)}</div>
                </div>
            </div>
        `).join('');
        if (cartDrawerFooter) cartDrawerFooter.style.display = 'block';
        if (cartDrawerSubtotal) cartDrawerSubtotal.textContent = formatPrice(Cart.totalPrice(items));
    });

    if (cartDrawerBody) {
        cartDrawerBody.addEventListener('click', (e) => {
            const line = e.target.closest('.cart-line-item');
            if (!line) return;
            const { id, weight } = line.dataset;
            const current = Cart.read().find(it => it.id === id && it.weight === weight);
            if (!current) return;
            if (e.target.closest('.cart-qty-plus')) Cart.setQty(id, weight, current.qty + 1);
            else if (e.target.closest('.cart-qty-minus')) Cart.setQty(id, weight, current.qty - 1);
            else if (e.target.closest('.cart-line-remove')) Cart.remove(id, weight);
        });
    }

    const toggleDrawer = (open) => {
        if (cartDrawer) cartDrawer.classList.toggle('open', open);
        if (cartDrawerOverlay) cartDrawerOverlay.classList.toggle('open', open);
        document.body.style.overflow = open ? 'hidden' : '';
    };

    if (cartWidget) cartWidget.addEventListener('click', () => toggleDrawer(true));
    if (cartDrawerClose) cartDrawerClose.addEventListener('click', () => toggleDrawer(false));
    if (cartDrawerOverlay) cartDrawerOverlay.addEventListener('click', () => toggleDrawer(false));

    // ============================================================
    // 4. ИНТЕРАКТИВ КАТАЛОГА И КНОПКИ КУПИТЬ / ИЗБРАННОЕ
    // ============================================================
    document.querySelectorAll('.format-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const priceVal = e.target.closest('.product-card')?.querySelector('.price-val');
            if (priceVal) priceVal.textContent = e.target.value;
        });
    });

    const filterBtns = document.querySelectorAll('.filter-btn');
    const productCards = document.querySelectorAll('.product-card');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.category;
            productCards.forEach(card => {
                card.style.display = (target === 'all' || card.dataset.category === target) ? 'flex' : 'none';
            });
        });
    });

    document.querySelectorAll('.btn-buy').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.product-card');
            if (!card) return;
            const id = card.dataset.productId;
            if (!id) return;

            const name = card.querySelector('h3')?.textContent?.trim();
            const img = card.querySelector('.product-img')?.getAttribute('src');
            const select = card.querySelector('.format-select');
            
            let weight = '1 кг', price = card.querySelector('.price-val')?.textContent;
            if (select && select.selectedOptions.length) {
                weight = select.selectedOptions[0].dataset.weight;
                price = select.value;
            }

            Cart.add({ id, name, weight, price, img });
            
            btn.classList.add('in-cart');
            const label = btn.querySelector('.btn-buy-label');
            if (label) label.textContent = 'В корзине';
            setTimeout(() => {
                btn.classList.remove('in-cart');
                if (label) label.textContent = 'В корзину';
            }, 1200);
        });
    });

    document.querySelectorAll('.btn-card-add-to-cart').forEach(btn => {
        btn.addEventListener('click', () => {
            const { productId, productName, productWeight, productPrice, productImg } = btn.dataset;
            if (!productId) return;

            let imgSrc = productImg || '';
            if (!imgSrc) {
                const mainImage = document.querySelector('.article-sidebar img');
                if (mainImage) imgSrc = mainImage.getAttribute('src');
            }

            Cart.add({ id: productId, name: productName, weight: productWeight, price: productPrice, img: imgSrc });
            btn.classList.add('in-cart');
            setTimeout(() => btn.classList.remove('in-cart'), 1200);
        });
    });

    document.querySelectorAll('.btn-favorite').forEach(btn => {
        const card = btn.closest('.product-card');
        if (card && Fav.has(card.dataset.productId)) btn.classList.add('active');
        
        btn.addEventListener('click', () => {
            if (!card) return;
            const id = card.dataset.productId;
            const name = card.querySelector('h3')?.textContent?.trim() || 'Сортовой мёд';
            const img = card.querySelector('.product-img')?.getAttribute('src') || '';
            const link = card.querySelector('.about-honey-link')?.getAttribute('href') || '#';
            const price = card.querySelector('.price-val')?.textContent || '0';

            const isAdded = Fav.toggle({ id, name, img, link, price });
            btn.classList.toggle('active', isAdded);
        });
    });

    // ============================================================
    // 5. СТРАНИЦА ИЗБРАННОГО (favorites.html)
    // ============================================================
    const favPageItemsContainer = document.getElementById('favPageItems');
    Fav.onChange(items => {
        if (!favPageItemsContainer) return;
        const isEmpty = items.length === 0;
        const emptyState = document.getElementById('favPageEmptyState');
        if (emptyState) emptyState.style.display = isEmpty ? 'block' : 'none';
        favPageItemsContainer.style.display = isEmpty ? 'none' : 'grid';
        if (isEmpty) return;

        favPageItemsContainer.innerHTML = items.map(it => `
            <div class="product-card" style="display: flex; flex-direction: column;">
                <div class="product-image-area">${it.img ? `<img src="${it.img}" class="product-img">` : ''}</div>
                <h3 style="font-family: 'Cormorant Garamond', serif; font-size: 24px; color: var(--dark-bg);">${it.name}</h3>
                <a href="${it.link}" class="about-honey-link">Перейти к описанию</a>
                <div class="price-block" style="margin-top: auto; padding-top: 20px;"><span class="price">${it.price} ₽</span></div>
                <div class="product-actions" style="margin-top: 15px; display: flex; flex-direction: column; gap: 10px;">
                    <button class="btn btn-buy fav-to-cart-btn" style="width: 100%;" data-id="${it.id}" data-name="${it.name}" data-img="${it.img}" data-price="${it.price}">В корзину</button>
                    <button class="btn-favorite fav-remove-btn" style="width: 100%;" data-id="${it.id}">Убрать</button>
                </div>
            </div>
        `).join('');
    });

    if (favPageItemsContainer) {
        favPageItemsContainer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.fav-remove-btn');
            if (removeBtn) Fav.remove(removeBtn.dataset.id);

            const cartBtn = e.target.closest('.fav-to-cart-btn');
            if (cartBtn) {
                Cart.add({ id: cartBtn.dataset.id, name: cartBtn.dataset.name, weight: '1 кг', price: cartBtn.dataset.price, img: cartBtn.dataset.img });
                cartBtn.textContent = 'В корзине ✓';
                setTimeout(() => { cartBtn.textContent = 'В корзину'; }, 1200);
            }
        });
    }

    // ============================================================
    // 6. СТРАНИЦА КОРЗИНЫ (cart.html) И РАСЧЕТ ДОСТАВКИ
    // ============================================================
    const cartPageItemsContainer = document.getElementById('cartPageItems');
    const checkoutForm = document.getElementById('checkoutForm');
    let currentDeliveryCost = 350; 

    Cart.onChange(items => {
        if (!cartPageItemsContainer) return;
        const isEmpty = items.length === 0;
        
        if (document.getElementById('cartPageEmptyState')) document.getElementById('cartPageEmptyState').style.display = isEmpty ? 'block' : 'none';
        if (document.getElementById('cartPageLayout')) document.getElementById('cartPageLayout').style.display = isEmpty ? 'none' : 'grid';
        if (isEmpty) return;

        cartPageItemsContainer.innerHTML = items.map(it => `
            <div class="cart-table-row" data-id="${it.id}" data-weight="${it.weight}">
                <div class="cart-table-thumb">${it.img ? `<img src="${it.img}">` : ''}</div>
                <div class="cart-table-info"><h3>${it.name}</h3><div class="cart-table-meta">${it.weight}</div></div>
                <div class="cart-table-unit-price">${formatPrice(it.price)} / шт</div>
                <div class="cart-line-qty">
                    <button class="cart-qty-minus">−</button><span>${it.qty}</span><button class="cart-qty-plus">+</button>
                </div>
                <div class="cart-table-line-total">${formatPrice(it.qty * it.price)}</div>
            </div>
        `).join('');

        const updateSummary = () => {
            const subtotal = Cart.totalPrice(items);
            let delivery = subtotal >= 3000 ? 0 : currentDeliveryCost;
            const total = subtotal + delivery;

            if (document.getElementById('cartSummaryItemsCount')) document.getElementById('cartSummaryItemsCount').textContent = Cart.totalCount(items);
            if (document.getElementById('cartSummarySubtotal')) document.getElementById('cartSummarySubtotal').textContent = formatPrice(subtotal);
            if (document.getElementById('cartSummaryTotal')) document.getElementById('cartSummaryTotal').textContent = formatPrice(total);
            if (document.getElementById('cartSummaryDelivery')) document.getElementById('cartSummaryDelivery').textContent = delivery === 0 ? 'Бесплатно' : formatPrice(delivery);
        };

        updateSummary();

        document.querySelectorAll('input[name="deliveryMethod"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const method = e.target.value;
                if (method === 'cdek_pickup') currentDeliveryCost = 350;
                else if (method === 'cdek_courier') currentDeliveryCost = 450;
                else if (method === 'post') currentDeliveryCost = 300;
                updateSummary();
            });
        });
    });

    if (cartPageItemsContainer) {
        cartPageItemsContainer.addEventListener('click', (e) => {
            const row = e.target.closest('.cart-table-row');
            if (!row) return;
            const { id, weight } = row.dataset;
            const current = Cart.read().find(it => it.id === id && it.weight === weight);
            if (!current) return;
            if (e.target.closest('.cart-qty-plus')) Cart.setQty(id, weight, current.qty + 1);
            else if (e.target.closest('.cart-qty-minus')) Cart.setQty(id, weight, current.qty - 1);
        });
    }

    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const items = Cart.read();
            if (items.length === 0) return showToast('Корзина пуста.','success');

            const token = localStorage.getItem('divno_auth_token');
            if (!token) {
                showToast('Пожалуйста, войдите в аккаунт или зарегистрируйтесь для оформления заказа.', 'success');
                window.location.href = 'login.html';
                return;
            }

            const phone = document.getElementById('checkoutPhone').value;
            
            // === ЖЕЛЕЗОБЕТОННАЯ ПРОВЕРКА НОМЕРА ===
            // Метод replace(/\D/g, '') удаляет все нечисловые символы (+, пробелы, скобки, тире).
            // Оставшаяся строка содержит только цифры.
            const digitsOnly = phone.replace(/\D/g, '');
            
            // Полный российский номер телефона всегда содержит 11 цифр (например, 79991234567)
            if (digitsOnly.length !== 11) {
                showToast('Пожалуйста, введите номер телефона полностью (10 цифр после +7)', 'error');
                return; // Полностью останавливаем выполнение функции, fetch не сработает
            }
            // =====================================

            const address = document.getElementById('checkoutAddress').value;
            const subtotal = Cart.totalPrice(items);
            const delivery = subtotal >= 3000 ? 0 : currentDeliveryCost;
            const total = subtotal + delivery;

            try {
                const response = await fetch(`${API_URL}/orders`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ phone, address, total_price: total, items })
                });

                if (response.ok) {
                    showToast('Заказ успешно оформлен! Вы можете отслеживать его в Личном кабинете.', 'success');
                    Cart.clear();
                    window.location.href = 'profile.html';
                } else {
                    const data = await response.json();
                    showToast('Ошибка: ' + data.detail,'error');
                }
            } catch (err) { showToast('Ошибка соединения с сервером.', 'error'); }
        });
    }

    // ============================================================
    // 7. ЛОГИН, РЕГИСТРАЦИЯ И ПРОФИЛЬ (СВЯЗЬ С API)
    // ============================================================
    const checkAuthStatus = () => {
        const token = localStorage.getItem('divno_auth_token');
        const authLink = document.getElementById('authLink');
        const authText = document.getElementById('authText');
        if (authLink && authText) {
            if (token) { authText.textContent = 'Кабинет'; authLink.href = 'profile.html'; } 
            else { authText.textContent = 'Войти'; authLink.href = 'login.html'; }
        }
    };
    checkAuthStatus();

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = loginForm.querySelector('input[type="text"]');
            const passwordInput = loginForm.querySelector('input[type="password"]');
            
            try {
                const res = await fetch(`${API_URL}/login`, {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: emailInput.value, password: passwordInput.value })
                });
                const data = await res.json();
                if (res.ok) { 
                    localStorage.setItem('divno_auth_token', data.access_token); 
                    window.location.href = 'profile.html'; 
                } else { 
                    showToast('Ошибка: ' + data.detail, 'error'); 
                }
            } catch (err) { showToast('Ошибка соединения с сервером', 'success'); }
        });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = registerForm.querySelector('input[type="text"]');
            const emailInput = registerForm.querySelector('input[type="email"]');
            const passwordInput = registerForm.querySelector('input[type="password"]');
            
            try {
                const res = await fetch(`${API_URL}/register`, {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: nameInput.value, email: emailInput.value, password: passwordInput.value })
                });
                const data = await res.json();
                if (res.ok) { 
                    localStorage.setItem('divno_auth_token', data.access_token); 
                    window.location.href = 'profile.html'; 
                } else { 
                    showToast('Ошибка: ' + data.detail, 'success'); 
                }
            } catch (err) { showToast('Ошибка соединения с сервером', 'error'); }
        });
    }

    const loadProfileData = async () => {
        const token = localStorage.getItem('divno_auth_token');
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/profile`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                if (document.getElementById('profileNameDisplay')) document.getElementById('profileNameDisplay').textContent = data.name;
                if (document.getElementById('profileEmailText')) document.getElementById('profileEmailText').textContent = data.email;
                if (document.getElementById('profileNameInput')) document.getElementById('profileNameInput').value = data.name;
                if (document.getElementById('profilePhoneInput')) document.getElementById('profilePhoneInput').value = data.phone;
                if (document.getElementById('profileAddressInput')) document.getElementById('profileAddressInput').value = data.address;
                
                if (document.getElementById('checkoutName') && data.name) document.getElementById('checkoutName').value = data.name;
                if (document.getElementById('checkoutPhone') && data.phone) document.getElementById('checkoutPhone').value = data.phone;
                if (document.getElementById('checkoutAddress') && data.address) document.getElementById('checkoutAddress').value = data.address;
            }
        } catch (e) { console.error('Ошибка загрузки профиля'); }
    };
    loadProfileData();

    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = localStorage.getItem('divno_auth_token');
            const name = document.getElementById('profileNameInput').value;
            const phone = document.getElementById('profilePhoneInput').value;
            
            // === ЖЕЛЕЗОБЕТОННАЯ ПРОВЕРКА НОМЕРА ===
            const digitsOnly = phone.replace(/\D/g, '');
            if (digitsOnly.length !== 11) {
                showToast('Пожалуйста, введите номер телефона полностью (10 цифр после +7)', 'error');
                return; // Останавливаем сохранение
            }
            // =====================================

            const address = document.getElementById('profileAddressInput').value;

            try {
                const res = await fetch(`${API_URL}/profile`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ name, phone, address })
                });
                if (res.ok) {
                    showToast('Данные успешно сохранены!', 'success');
                    document.getElementById('profileNameDisplay').textContent = name;
                }
            } catch (e) { showToast('Ошибка соединения с сервером', 'error'); }
        });
    }

    const ordersContainer = document.getElementById('ordersContainer');
    if (ordersContainer) {
        const token = localStorage.getItem('divno_auth_token');
        if (token) {
            fetch(`${API_URL}/orders`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => {
                if (data.length === 0) {
                    ordersContainer.innerHTML = 'Вы пока ничего не заказывали.';
                } else {
                    ordersContainer.style.padding = '0';
                    ordersContainer.style.border = 'none';
                    ordersContainer.innerHTML = data.map(order => `
                        <div style="border: 1px solid #eae4de; border-radius: 8px; padding: 20px; margin-bottom: 15px; text-align: left;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid #f3ebe3; padding-bottom: 12px; margin-bottom: 15px;">
                                <strong style="white-space: nowrap; font-size: 1.05rem;">Заказ #${order.id} <span style="font-weight: 400; color: #888; font-size: 0.85rem; margin-left: 5px;">от ${order.date}</span></strong>
                                <span style="color: var(--primary-color); font-weight: 600; white-space: nowrap; background: #fdfbf7; padding: 5px 12px; border-radius: 20px; font-size: 0.85rem; border: 1px solid #f3ebe3;">${order.status}</span>
                            </div>
                            <ul style="list-style: none; padding: 0; margin: 0; font-size: 14px; color: #555;">
                                ${order.items.map(it => `<li style="margin-bottom: 6px;">— ${it.name} <span style="color: #999;">(${it.weight})</span> x${it.qty} шт.</li>`).join('')}
                            </ul>
                            <div style="margin-top: 15px; font-weight: 700; color: var(--dark-bg); text-align: right; font-size: 1.1rem;">
                                Итого: ${order.total} ₽
                            </div>
                        </div>
                    `).join('');
                }
            }).catch(err => { ordersContainer.innerHTML = 'Не удалось загрузить заказы.'; });
        }
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('divno_auth_token');
            window.location.href = 'login.html';
        });
    }

    // ============================================================
    // 8. FAQ АККОРДЕОН
    // ============================================================
    document.querySelectorAll('.faq-item').forEach(item => {
        item.querySelector('.faq-question')?.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
            if (!isActive) item.classList.add('active');
        });
    });

    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.target + 'Form')?.classList.add('active');
        });
    });

    Cart.notify();
    Fav.notify();
});