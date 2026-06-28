from fastapi.responses import StreamingResponse
import io
import csv
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, Session
import bcrypt
import jwt
from datetime import datetime, timedelta
import requests
import uuid


# --- НАСТРОЙКИ ---
SECRET_KEY = "super_secret_key_divnomed"
ALGORITHM = "HS256"

# --- БАЗА ДАННЫХ (SQLite) ---
engine = create_engine("sqlite:///./divnomed.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class UserDB(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    phone = Column(String, default="")
    address = Column(String, default="")
    # НОВАЯ КОЛОНКА: Права администратора
    is_admin = Column(Boolean, default=False)

class OrderDB(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    total_price = Column(Integer)
    address = Column(String)
    phone = Column(String)
    status = Column(String, default="В обработке")
    created_at = Column(String)

class OrderItemDB(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, index=True)
    name = Column(String)
    weight = Column(String)
    price = Column(Integer)
    qty = Column(Integer)

Base.metadata.create_all(bind=engine)

# --- ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=False, 
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

# --- СХЕМЫ ПРИЕМА ДАННЫХ ---
class UserRegister(BaseModel):
    name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserProfileUpdate(BaseModel):
    name: str
    phone: str
    address: str

class ItemSchema(BaseModel):
    name: str
    weight: str
    price: int
    qty: int

class OrderCreate(BaseModel):
    phone: str
    address: str
    total_price: int
    items: list[ItemSchema]

class OrderStatusUpdate(BaseModel):
    status: str

# --- ФУНКЦИИ ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=7)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Неверный токен")
    
    user = db.query(UserDB).filter(UserDB.email == email).first()
    if user is None:
        raise HTTPException(status_code=401)
    return user

# --- МАРШРУТЫ (АВТОРИЗАЦИЯ И ПРОФИЛЬ) ---

@app.post("/api/register")
def register(user: UserRegister, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    
    salt = bcrypt.gensalt()
    hashed_pwd = bcrypt.hashpw(user.password.encode('utf-8'), salt).decode('utf-8')
    
    # ПРОВЕРКА НА АДМИНА
    is_admin_flag = False
    if user.email.lower() == "slawa.xar@yandex.ru":
        is_admin_flag = True
    
    new_user = UserDB(name=user.name, email=user.email, hashed_password=hashed_pwd, is_admin=is_admin_flag)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    token = create_access_token(data={"sub": new_user.email})
    return {"access_token": token, "name": new_user.name, "email": new_user.email}

@app.post("/api/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(UserDB).filter(UserDB.email == user.email).first()
    if not db_user or not bcrypt.checkpw(user.password.encode('utf-8'), db_user.hashed_password.encode('utf-8')):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    
    token = create_access_token(data={"sub": db_user.email})
    return {"access_token": token, "name": db_user.name, "email": db_user.email}

@app.get("/api/profile")
def get_profile(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    # Ищем все заказы пользователя
    past_orders = db.query(OrderDB).filter(OrderDB.user_id == current_user.id).all()
    
    # Считаем общую сумму всех покупок (накопительный итог)
    total_spent = sum(o.total_price for o in past_orders)
    
    # Вычисляем накопительную скидку по нашей логике лояльности
    loyalty_discount = 0
    if total_spent >= 30000:
        loyalty_discount = 10
    elif total_spent >= 20000:
        loyalty_discount = 7
    elif total_spent >= 10000:
        loyalty_discount = 5
    elif total_spent >= 5000:
        loyalty_discount = 3

    return {
        "name": current_user.name,
        "email": current_user.email,
        "phone": current_user.phone,
        "address": current_user.address,
        "total_spent": total_spent,             # Отдаем сумму покупок на фронтенд
        "loyalty_discount": loyalty_discount    # Отдаем текущий % скидки лояльности
    }

@app.put("/api/profile")
def update_profile(profile_data: UserProfileUpdate, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.name = profile_data.name
    current_user.phone = profile_data.phone
    current_user.address = profile_data.address
    db.commit()
    return {"message": "Профиль обновлен"}
# Временное хранилище для токенов сброса пароля (в реальном проекте хранится в БД)
reset_tokens = {}

# Эндпоинт 1: Запрос на сброс
@app.post("/api/forgot-password")
def forgot_password(data: dict):
    email = data.get("email")
    # Здесь в идеале нужно проверить, есть ли такой email в БД
    
    # Генерируем уникальный токен
    token = str(uuid.uuid4())
    reset_tokens[token] = email
    
    # ИМИТАЦИЯ ОТПРАВКИ ПИСЬМА (выводим в консоль VS Code)
    reset_link = f"http://127.0.0.1:5500/reset-password.html?token={token}"
    print(f"\n[EMAIL ИМИТАЦИЯ] Письмо отправлено на {email}")
    print(f"Ссылка для сброса: {reset_link}\n")
    
    return {"message": "Если такой email существует, мы отправили на него ссылку для сброса."}

# Эндпоинт 2: Сохранение нового пароля
@app.post("/api/reset-password")
def reset_password(data: dict, db: Session = Depends(get_db)): # <-- Добавили подключение к БД
    token = data.get("token")
    new_password = data.get("new_password")
    
    if token not in reset_tokens:
        return {"error": "Неверный или устаревший токен ссылки."}
        
    email = reset_tokens[token]
    
    # 1. Находим пользователя в базе
    user = db.query(UserDB).filter(UserDB.email == email).first()
    if not user:
        return {"error": "Пользователь не найден."}
        
    # 2. Хешируем новый пароль
    salt = bcrypt.gensalt()
    hashed_pwd = bcrypt.hashpw(new_password.encode('utf-8'), salt).decode('utf-8')
    
    # 3. Сохраняем новый пароль в базу
    user.hashed_password = hashed_pwd
    db.commit()
    
    # 4. Удаляем токен, чтобы его нельзя было использовать дважды
    del reset_tokens[token]
    
    return {"message": "Пароль успешно изменен!"}

# --- МАРШРУТЫ (ЗАКАЗЫ И АДМИНКА) ---

@app.post("/api/orders")
def create_order(order: OrderCreate, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    
    # === 1. ЗАЩИТА: СЕРВЕРНЫЙ ПЕРЕСЧЕТ СТОИМОСТИ ===
    # Считаем чистую стоимость товаров по присланным данным
    subtotal = sum(item.price * item.qty for item in order.items)
    
    # Узнаем накопительную скидку пользователя из БД
    past_orders = db.query(OrderDB).filter(OrderDB.user_id == current_user.id).all()
    total_spent = sum(o.total_price for o in past_orders)
    
    loyalty_discount = 0
    if total_spent >= 30000: loyalty_discount = 10
    elif total_spent >= 20000: loyalty_discount = 7
    elif total_spent >= 10000: loyalty_discount = 5
    elif total_spent >= 5000: loyalty_discount = 3
        
    # Узнаем мгновенную скидку за объем текущей корзины
    instant_discount = 0
    if subtotal >= 30000: instant_discount = 15
    elif subtotal >= 20000: instant_discount = 10
    elif subtotal >= 10000: instant_discount = 7
    elif subtotal >= 5000: instant_discount = 5
        
    # Сервер выбирает максимально выгодную скидку для клиента
    best_discount = max(loyalty_discount, instant_discount)
    
    # Применяем скидку
    discount_amount = int(subtotal * (best_discount / 100))
    subtotal_with_discount = subtotal - discount_amount
    
    # Если итоговая цена от фронтенда МЕНЬШЕ, чем стоимость товаров со скидкой 
    # (то есть клиент попытался "сбросить" цену ниже себестоимости через консоль браузера)
    if order.total_price < subtotal_with_discount:
        raise HTTPException(status_code=400, detail="Ошибка безопасности: обнаружена подделка итоговой стоимости. Обновите страницу.")
    # ================================================

    date_str = datetime.now().strftime("%d.%m.%Y %H:%M")
    new_order = OrderDB(
        user_id=current_user.id, 
        total_price=order.total_price, # Берем проверенную цену
        address=order.address, 
        phone=order.phone, 
        created_at=date_str
    )
    
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    
    for it in order.items:
        db_item = OrderItemDB(order_id=new_order.id, name=it.name, weight=it.weight, price=it.price, qty=it.qty)
        db.add(db_item)
    db.commit()
    
    return {"message": "Заказ успешно оформлен"}

@app.get("/api/orders")
def get_orders(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    orders = db.query(OrderDB).filter(OrderDB.user_id == current_user.id).order_by(OrderDB.id.desc()).all()
    result = []
    for o in orders:
        items = db.query(OrderItemDB).filter(OrderItemDB.order_id == o.id).all()
        result.append({
            "id": o.id, "date": o.created_at, "total": o.total_price, "status": o.status,
            "items": [{"name": i.name, "qty": i.qty, "weight": i.weight} for i in items]
        })
    return result

# ЗАЩИЩЕННЫЕ АДМИНСКИЕ МАРШРУТЫ
@app.get("/api/admin/orders")
def admin_get_all_orders(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Доступ запрещен. Требуются права администратора.")
        
    orders = db.query(OrderDB).order_by(OrderDB.id.desc()).all()
    result = []
    for o in orders:
        items = db.query(OrderItemDB).filter(OrderItemDB.order_id == o.id).all()
        user = db.query(UserDB).filter(UserDB.id == o.user_id).first()
        result.append({
            "id": o.id, "customer_name": user.name if user else "Удаленный", "date": o.created_at,
            "phone": o.phone, "address": o.address, "total": o.total_price, "status": o.status,
            "items": [{"name": i.name, "qty": i.qty, "weight": i.weight} for i in items]
        })
    return result

@app.put("/api/admin/orders/{order_id}/status")
def admin_update_order_status(order_id: int, status_data: OrderStatusUpdate, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Доступ запрещен. Требуются права администратора.")
        
    order = db.query(OrderDB).filter(OrderDB.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    
    order.status = status_data.status
    db.commit()
    return {"message": "Статус заказа успешно обновлен"}

@app.post("/api/calculate-delivery")
def mock_delivery(data: dict):
    # Вместо запроса в СДЭК просто возвращаем фиксированные данные
    return {
        "price": 350,
        "pvz_address": "Москва, ул. Ленина, 10",
        "status": "success"
    }
# --- НОВЫЕ АДМИНСКИЕ МАРШРУТЫ (УДАЛЕНИЕ И ЭКСПОРТ) ---

@app.delete("/api/admin/orders/{order_id}")
def admin_delete_order(order_id: int, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")
        
    order = db.query(OrderDB).filter(OrderDB.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    
    # Удаляем товары заказа и сам заказ
    db.query(OrderItemDB).filter(OrderItemDB.order_id == order_id).delete()
    db.delete(order)
    db.commit()
    
    return {"message": "Заказ успешно удален"}

@app.get("/api/admin/orders/export")
def admin_export_orders(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Доступ запрещен.")
    
    orders = db.query(OrderDB).order_by(OrderDB.id.desc()).all()
    
    # Создаем CSV в памяти
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';') # Точка с запятой нужна для корректного открытия в русском Excel
    writer.writerow(["ID Заказа", "Клиент", "Телефон", "Адрес", "Дата", "Сумма", "Статус", "Товары"])
    
    for o in orders:
        items = db.query(OrderItemDB).filter(OrderItemDB.order_id == o.id).all()
        user = db.query(UserDB).filter(UserDB.id == o.user_id).first()
        customer_name = user.name if user else "Удаленный пользователь"
        items_str = ", ".join([f"{i.name} ({i.weight}) - {i.qty} шт." for i in items])
        
        writer.writerow([o.id, customer_name, o.phone, o.address, o.created_at, o.total_price, o.status, items_str])
    
    output.seek(0)
    
    # Отдаем файл в кодировке UTF-8 с BOM (чтобы Excel правильно читал русские буквы)
    return StreamingResponse(
        iter([output.getvalue().encode('utf-8-sig')]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=divnomed_orders.csv"}
    )