#!/bin/bash

# ==========================================================================
# OptiRota - Instalador Definitivo (Debian/Ubuntu)
# Versao: 5.0 (Producao Completa - Cloudflare Tunnel + Stripe + Google Maps)
# Desenvolvido para: Luis - Santos/SP
# ==========================================================================

set -e

# GARANTIR PATH DO SISTEMA (Resolve erros de comandos não encontrados)
export PATH=$PATH:/usr/local/sbin:/usr/sbin:/sbin

# Cores para saída
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

INSTALL_DIR="/opt/optirota"
REPO_URL="https://github.com/luishplleite/rota-certa.git"

print_header() {
    clear
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║       OPTIROTA - INSTALADOR COMPLETO v5.0 (PRODUCAO)             ║${NC}"
    echo -e "${BLUE}║       Cloudflare Tunnel + Stripe + Google Maps + Supabase        ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}[$1/$2]${NC} $3"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_section() {
    echo -e "\n${CYAN}▶ $1${NC}"
}

# Verificar se é root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Erro: Execute como root (sudo ./instalador.sh)${NC}"
    exit 1
fi

print_header
TOTAL_STEPS=10

# ==========================================================================
# PASSO 1: Dependências do Sistema
# ==========================================================================
print_step 1 $TOTAL_STEPS "Instalando dependencias do sistema..."
apt-get update -qq
apt-get install -y -qq curl wget git nginx psmisc openssl ca-certificates gnupg lsb-release

# Instalar Docker se não existir
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Instalando Docker...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Instalar docker-compose plugin se não existir
if ! docker compose version &> /dev/null; then
    apt-get install -y -qq docker-compose-plugin
fi

echo -e "${GREEN}Dependencias instaladas com sucesso!${NC}"

# ==========================================================================
# PASSO 2: Instalar Cloudflared
# ==========================================================================
print_step 2 $TOTAL_STEPS "Instalando Cloudflared..."
ARCH=$(uname -m)
if [[ "$ARCH" == "x86_64" ]]; then 
    CF_BIN="cloudflared-linux-amd64"
elif [[ "$ARCH" == "aarch64" ]]; then 
    CF_BIN="cloudflared-linux-arm64"
else 
    CF_BIN="cloudflared-linux-arm"
fi

wget -q "https://github.com/cloudflare/cloudflared/releases/latest/download/$CF_BIN" -O /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
echo -e "${GREEN}Cloudflared instalado: $(cloudflared --version)${NC}"

# ==========================================================================
# PASSO 3: Limpeza de processos anteriores
# ==========================================================================
print_step 3 $TOTAL_STEPS "Limpando processos e instalacoes anteriores..."
fuser -k 5000/tcp 2>/dev/null || true
docker stop optirota-app 2>/dev/null || true
docker rm optirota-app 2>/dev/null || true

# ==========================================================================
# PASSO 4: Download do Código
# ==========================================================================
print_step 4 $TOTAL_STEPS "Baixando codigo do OptiRota..."
if [ -d "$INSTALL_DIR" ]; then 
    BACKUP_DIR="${INSTALL_DIR}_backup_$(date +%Y%m%d_%H%M%S)"
    echo -e "${YELLOW}Backup da instalacao anterior: $BACKUP_DIR${NC}"
    mv "$INSTALL_DIR" "$BACKUP_DIR"
fi
git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"
echo -e "${GREEN}Codigo baixado em: $INSTALL_DIR${NC}"

# ==========================================================================
# PASSO 5: Configuração de Variáveis de Ambiente
# ==========================================================================
print_step 5 $TOTAL_STEPS "Configurando variaveis de ambiente..."

echo -e "${YELLOW}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║           CONFIGURACAO DAS CHAVES DE API                         ║"
echo "║  Tenha em maos as credenciais dos servicos antes de continuar   ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# --- DOMÍNIO ---
print_section "DOMINIO"
echo -e "Ex: rota.seudominio.com.br (deve estar configurado no Cloudflare)"
read -p "Subdominio/Dominio: " domain_name
while [ -z "$domain_name" ]; do
    echo -e "${RED}Dominio e obrigatorio!${NC}"
    read -p "Subdominio/Dominio: " domain_name
done

# --- SUPABASE ---
print_section "SUPABASE (Backend-as-a-Service)"
echo -e "Obtenha em: https://supabase.com → Seu Projeto → Settings → API"
read -p "SUPABASE_URL: " supabase_url
while [ -z "$supabase_url" ]; do
    echo -e "${RED}SUPABASE_URL e obrigatorio!${NC}"
    read -p "SUPABASE_URL: " supabase_url
done

read -p "SUPABASE_SERVICE_ROLE_KEY (service_role secret): " supabase_key
while [ -z "$supabase_key" ]; do
    echo -e "${RED}SUPABASE_SERVICE_ROLE_KEY e obrigatorio!${NC}"
    read -p "SUPABASE_SERVICE_ROLE_KEY: " supabase_key
done

# --- STRIPE ---
print_section "STRIPE (Pagamentos PIX)"
echo -e "Obtenha em: https://dashboard.stripe.com/apikeys"
read -p "STRIPE_PUBLISHABLE_KEY (pk_live_... ou pk_test_...): " stripe_pub_key
while [ -z "$stripe_pub_key" ]; do
    echo -e "${RED}STRIPE_PUBLISHABLE_KEY e obrigatorio!${NC}"
    read -p "STRIPE_PUBLISHABLE_KEY: " stripe_pub_key
done

read -p "STRIPE_SECRET_KEY (sk_live_... ou sk_test_...): " stripe_secret_key
while [ -z "$stripe_secret_key" ]; do
    echo -e "${RED}STRIPE_SECRET_KEY e obrigatorio!${NC}"
    read -p "STRIPE_SECRET_KEY: " stripe_secret_key
done

echo -e "${YELLOW}Para webhooks, configure em: https://dashboard.stripe.com/webhooks${NC}"
echo -e "Endpoint: https://$domain_name/api/stripe/webhook"
echo -e "Eventos: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted"
read -p "STRIPE_WEBHOOK_SECRET (whsec_...): " stripe_webhook_secret
while [ -z "$stripe_webhook_secret" ]; do
    echo -e "${RED}STRIPE_WEBHOOK_SECRET e obrigatorio!${NC}"
    read -p "STRIPE_WEBHOOK_SECRET: " stripe_webhook_secret
done

# --- GOOGLE MAPS ---
print_section "GOOGLE MAPS API (Mapas, Geocoding e Rotas)"
echo -e "Obtenha em: https://console.cloud.google.com/apis/credentials"
echo -e "APIs necessarias: Maps JavaScript API, Geocoding API, Directions API"
read -p "GOOGLE_MAPS_API_KEY: " google_maps_key
while [ -z "$google_maps_key" ]; do
    echo -e "${RED}GOOGLE_MAPS_API_KEY e obrigatoria!${NC}"
    read -p "GOOGLE_MAPS_API_KEY: " google_maps_key
done

# --- Gerar SESSION_SECRET automaticamente ---
SESSION_SECRET=$(openssl rand -base64 32)

# --- Criar arquivo .env ---
cat << EOF > .env
# =================================================
# OptiRota - Variaveis de Ambiente (Producao)
# Gerado automaticamente em: $(date)
# =================================================

# Aplicacao
NODE_ENV=production
PORT=5000
DOMAIN=$domain_name
SESSION_SECRET=$SESSION_SECRET

# Supabase (PostgreSQL + Auth Backend)
SUPABASE_URL=$supabase_url
SUPABASE_SERVICE_ROLE_KEY=$supabase_key

# Stripe (Pagamentos PIX)
STRIPE_PUBLISHABLE_KEY=$stripe_pub_key
STRIPE_SECRET_KEY=$stripe_secret_key
STRIPE_WEBHOOK_SECRET=$stripe_webhook_secret

# Google Maps API (Mapas, Geocoding e Rotas)
GOOGLE_MAPS_API_KEY=$google_maps_key
VITE_GOOGLE_MAPS_API_KEY=$google_maps_key
EOF

echo -e "${GREEN}Arquivo .env criado com sucesso!${NC}"

# ==========================================================================
# PASSO 6: Criar Dockerfile e docker-compose.yml
# ==========================================================================
print_step 6 $TOTAL_STEPS "Preparando configuracao Docker..."

cat << 'DOCKERFILE' > Dockerfile
# =================================================
# OptiRota - Dockerfile de Producao
# Multi-stage build para otimizacao
# =================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm ci

# Copiar codigo fonte
COPY . .

# Build da aplicacao
RUN npm run build

# =================================================
# Imagem de Producao (menor)
# =================================================
FROM node:20-alpine

WORKDIR /app

# Instalar apenas dependencias de producao
COPY package*.json ./
RUN npm ci --only=production

# Copiar build
COPY --from=builder /app/dist ./dist

# Expor porta
EXPOSE 5000

# Iniciar aplicacao
CMD ["node", "dist/index.cjs"]
DOCKERFILE

cat << 'COMPOSE' > docker-compose.yml
# =================================================
# OptiRota - Docker Compose (Producao)
# =================================================
services:
  optirota:
    build: .
    container_name: optirota-app
    restart: unless-stopped
    ports:
      - "127.0.0.1:5000:5000"
    env_file: .env
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
COMPOSE

echo -e "${GREEN}Arquivos Docker criados!${NC}"

# ==========================================================================
# PASSO 7: Build e Iniciar Container
# ==========================================================================
print_step 7 $TOTAL_STEPS "Construindo e iniciando container Docker..."
echo -e "${YELLOW}Isso pode levar alguns minutos na primeira vez...${NC}"

docker compose build --no-cache
docker compose up -d

# Aguardar container iniciar
echo -e "${YELLOW}Aguardando aplicacao iniciar...${NC}"
sleep 10

# Verificar se container está rodando
if docker ps | grep -q optirota-app; then
    echo -e "${GREEN}Container optirota-app iniciado com sucesso!${NC}"
else
    echo -e "${RED}Erro ao iniciar container. Verifique logs: docker logs optirota-app${NC}"
    exit 1
fi

# ==========================================================================
# PASSO 8: Configurar Nginx como Reverse Proxy
# ==========================================================================
print_step 8 $TOTAL_STEPS "Configurando Nginx como Gateway..."

cat << EOF > /etc/nginx/sites-available/optirota
# =================================================
# OptiRota - Nginx Reverse Proxy
# =================================================
server {
    listen 80;
    server_name $domain_name;

    # Logs
    access_log /var/log/nginx/optirota_access.log;
    error_log /var/log/nginx/optirota_error.log;

    # Proxy para aplicacao
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket support
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Stripe Webhook (sem limite de body)
    location /api/stripe/webhook {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 10M;
    }
}
EOF

# Ativar site e desativar default
ln -sf /etc/nginx/sites-available/optirota /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Testar configuração
nginx -t

# Reiniciar Nginx
systemctl restart nginx
systemctl enable nginx

echo -e "${GREEN}Nginx configurado e iniciado!${NC}"

# ==========================================================================
# PASSO 9: Configurar Cloudflare Tunnel
# ==========================================================================
print_step 9 $TOTAL_STEPS "Configurando Cloudflare Tunnel (Acesso Externo Seguro)..."

echo -e "${YELLOW}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║              AUTENTICACAO CLOUDFLARE TUNNEL                       ║"
echo "║                                                                   ║"
echo "║  1. Sera aberto um link de autenticacao                          ║"
echo "║  2. Acesse o link e autorize o acesso                            ║"
echo "║  3. Aguarde a confirmacao no terminal                            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

read -p "Pressione ENTER para iniciar a autenticacao Cloudflare..."

# Login no Cloudflare
cloudflared tunnel login

# Nome do tunnel
TUNNEL_NAME="optirota-tunnel-$(hostname)"

# Remover tunnel existente se houver
echo -e "${YELLOW}Removendo tunnel anterior se existir...${NC}"
cloudflared tunnel delete -f "$TUNNEL_NAME" 2>/dev/null || true

# Criar novo tunnel
echo -e "${YELLOW}Criando novo tunnel: $TUNNEL_NAME${NC}"
TUNNEL_OUTPUT=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1)
echo "$TUNNEL_OUTPUT"

# Extrair ID do tunnel
TUNNEL_ID=$(echo "$TUNNEL_OUTPUT" | grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" | head -1)

if [ -z "$TUNNEL_ID" ]; then
    echo -e "${RED}Erro ao obter ID do tunnel. Verifique se a autenticacao foi bem sucedida.${NC}"
    echo -e "${YELLOW}Voce pode configurar o tunnel manualmente depois.${NC}"
else
    echo -e "${GREEN}Tunnel criado com ID: $TUNNEL_ID${NC}"
    
    # Criar configuração do tunnel
    mkdir -p /etc/cloudflared
    
    cat << EOF > /etc/cloudflared/config.yml
# =================================================
# OptiRota - Cloudflare Tunnel Config
# =================================================
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $domain_name
    service: http://localhost:80
    originRequest:
      noTLSVerify: true
  - service: http_status:404
EOF

    # Configurar rota DNS
    echo -e "${YELLOW}Configurando rota DNS para $domain_name...${NC}"
    cloudflared tunnel route dns "$TUNNEL_NAME" "$domain_name" 2>/dev/null || echo -e "${YELLOW}DNS ja configurado ou precisa ser feito manualmente no Cloudflare Dashboard${NC}"
    
    # Instalar como serviço do sistema
    cloudflared service install 2>/dev/null || true
    systemctl enable cloudflared
    systemctl restart cloudflared
    
    # Verificar status
    sleep 3
    if systemctl is-active --quiet cloudflared; then
        echo -e "${GREEN}Cloudflare Tunnel ativo e funcionando!${NC}"
    else
        echo -e "${YELLOW}Tunnel instalado. Verifique status: systemctl status cloudflared${NC}"
    fi
fi

# ==========================================================================
# PASSO 10: Finalização e Resumo
# ==========================================================================
print_step 10 $TOTAL_STEPS "Instalacao Finalizada!"

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                    INSTALACAO CONCLUIDA!                          ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${BOLD}INFORMACOES DO SISTEMA:${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  Diretorio:       ${CYAN}$INSTALL_DIR${NC}"
echo -e "  Container:       ${CYAN}optirota-app${NC}"
echo -e "  Porta Local:     ${CYAN}5000${NC}"
echo -e "  Dominio:         ${CYAN}https://$domain_name${NC}"
echo ""

echo -e "${BOLD}COMANDOS UTEIS:${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  Ver logs app:         ${YELLOW}docker logs -f optirota-app${NC}"
echo -e "  Reiniciar app:        ${YELLOW}docker compose restart${NC}"
echo -e "  Status tunnel:        ${YELLOW}systemctl status cloudflared${NC}"
echo -e "  Logs tunnel:          ${YELLOW}journalctl -u cloudflared -f${NC}"
echo -e "  Status nginx:         ${YELLOW}systemctl status nginx${NC}"
echo -e "  Editar variaveis:     ${YELLOW}nano $INSTALL_DIR/.env${NC}"
echo ""

echo -e "${BOLD}CONFIGURACOES STRIPE (IMPORTANTE):${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  Configure o webhook no Stripe Dashboard:"
echo -e "  URL: ${CYAN}https://$domain_name/api/stripe/webhook${NC}"
echo -e "  Eventos: checkout.session.completed, customer.subscription.*"
echo ""

echo -e "${GREEN}Sistema pronto para uso em: ${BOLD}https://$domain_name${NC}"
echo ""

# Verificações finais
echo -e "${BOLD}VERIFICACOES FINAIS:${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verificar Docker
if docker ps | grep -q optirota-app; then
    echo -e "  Docker:      ${GREEN}OK${NC}"
else
    echo -e "  Docker:      ${RED}FALHOU - Verifique: docker logs optirota-app${NC}"
fi

# Verificar Nginx
if systemctl is-active --quiet nginx; then
    echo -e "  Nginx:       ${GREEN}OK${NC}"
else
    echo -e "  Nginx:       ${RED}FALHOU - Verifique: systemctl status nginx${NC}"
fi

# Verificar Cloudflared
if systemctl is-active --quiet cloudflared; then
    echo -e "  Cloudflare:  ${GREEN}OK${NC}"
else
    echo -e "  Cloudflare:  ${YELLOW}VERIFICAR - systemctl status cloudflared${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Obrigado por usar o OptiRota! Suporte: Luis - Santos/SP"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
