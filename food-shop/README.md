# Food Shop

## Run locally

```bash
cd food-shop
npm install
npm run start
```

Open `http://localhost:3000`.

## Admin / User

- Login page: `/login.html`
- Admin page: `/admin.html` (requires role `admin`)

Default (dev):
- `admin@local` / `admin123`
- `user@local` / `user123`

Env vars:
- `PORT`
- `SESSION_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `USER_EMAIL`
- `USER_PASSWORD`

Users are stored in `food-shop/data/users.json`.

## Orders (RBAC)

- User:
  - `POST /api/orders` (đặt hàng)
  - `GET /api/orders` (xem đơn của chính mình)
- Admin:
  - `GET /api/admin/orders`
  - `POST /api/admin/orders`
  - `PATCH /api/admin/orders/:id`
  - `DELETE /api/admin/orders/:id`

Admin orders UI: `/admin-orders.html`

## Docker

```bash
cd food-shop
docker compose up --build
```

