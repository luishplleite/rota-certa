# Configuração para Servidor Externo (Locaweb/VPS)

## Problema: Erro 401 nas requisições

O erro 401 acontece porque os cookies de sessão não estão sendo mantidos corretamente através do Cloudflare Tunnel.

## Solução Completa

### 1. Configuração do Nginx

Edite `/etc/nginx/sites-available/combined`:

```nginx
server {
    listen 80;
    server_name optirota.timepulseai.com.br;
    
    location / { 
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        
        # Headers essenciais para sessão
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        
        # WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Cookies
        proxy_cookie_path / "/; SameSite=None; Secure";
        proxy_pass_header Set-Cookie;
    }
}
```

Depois execute:
```bash
sudo nginx -t && sudo systemctl restart nginx
```

### 2. Arquivo .env Correto

O arquivo `/opt/optirota/.env` deve ter:

```env
NODE_ENV=production
PORT=5000
SESSION_SECRET=<string-sem-espacos-de-32-caracteres>
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....<token-completo>
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
GOOGLE_MAPS_API_KEY=AIza...
VITE_GOOGLE_MAPS_API_KEY=AIza...
```

**IMPORTANTE:**
- SESSION_SECRET: Use `openssl rand -hex 32` para gerar (sem espaços!)
- SUPABASE_SERVICE_ROLE_KEY: Deve ser o token JWT COMPLETO (~220 caracteres)

### 3. Dockerfile Atualizado

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ pkgconfig pixman-dev cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev
COPY package*.json ./
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN npm install
COPY . .
ARG VITE_GOOGLE_MAPS_API_KEY
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache pixman cairo pango jpeg giflib librsvg
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
```

### 4. docker-compose.yml Atualizado

```yaml
services:
  optirota:
    build:
      context: .
      args:
        - VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}
    container_name: optirota-app
    restart: unless-stopped
    ports: ["127.0.0.1:5001:5000"]
    env_file: .env
```

### 5. Comandos de Deploy

```bash
cd /opt/optirota

# Atualizar código
git fetch origin
git reset --hard origin/main

# Verificar .env
cat .env

# Reconstruir
docker compose down
docker compose build --no-cache
docker compose up -d

# Verificar logs
docker logs -f optirota-app
```

### 6. Diagnóstico de Erro 401

**Passo 1: Verificar logs do container**
```bash
docker logs optirota-app 2>&1 | tail -50
```

Procure por estas linhas:
```
[SERVER] Environment: NODE_ENV=production, isProduction=true
[SERVER] Cookie config: secure=true, sameSite=none, proxy=true
```

Se aparecer `NODE_ENV=undefined` ou `isProduction=false`, o `.env` não está sendo lido.

**Passo 2: Verificar cookies no navegador**
1. Acesse https://optirota.timepulseai.com.br
2. Faça login
3. Abra DevTools (F12) > Application > Cookies
4. Procure o cookie `connect.sid`

**Se o cookie NÃO aparece após login:**
- Problema no Nginx ou Cloudflare
- Verifique se o Nginx tem `proxy_cookie_path` configurado

**Se o cookie APARECE mas requisições dão 401:**
- O cookie não está sendo enviado
- Verifique `SameSite` e `Secure` flags do cookie

**Passo 3: Verificar configuração do Nginx**
```bash
sudo nginx -T | grep -A20 "optirota"
```

Deve mostrar:
- `proxy_cookie_path / "/; SameSite=None; Secure";`
- `proxy_set_header X-Forwarded-Proto https;`

### 7. Teste de Cookie (opcional)

Execute no servidor:
```bash
curl -v -X POST https://optirota.timepulseai.com.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@email.com","password":"senha123"}' \
  2>&1 | grep -i "set-cookie"
```

Se não retornar Set-Cookie, o problema é no servidor.
