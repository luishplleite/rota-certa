#!/bin/bash

# ==========================================================================
# OptiRota - Script de Deploy/Atualização
# Uso: ./deploy.sh
# ==========================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

OPTIROTA_DIR="/opt/optirota"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              OptiRota - Atualização de Deploy                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════╝${NC}"

if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Erro: Execute como root (sudo ./deploy.sh)${NC}"
    exit 1
fi

cd $OPTIROTA_DIR

echo -e "\n${YELLOW}[1/5] Baixando atualizações do repositório...${NC}"
git fetch origin
git reset --hard origin/main
echo -e "${GREEN}Código atualizado!${NC}"

echo -e "\n${YELLOW}[2/5] Preservando arquivo .env...${NC}"
if [ -f ".env" ]; then
    cp .env /tmp/optirota_env_backup
    echo -e "${GREEN}Backup do .env criado!${NC}"
else
    echo -e "${RED}Aviso: Arquivo .env não encontrado!${NC}"
fi

echo -e "\n${YELLOW}[3/5] Parando container atual...${NC}"
docker compose down || docker-compose down || true
echo -e "${GREEN}Container parado!${NC}"

echo -e "\n${YELLOW}[4/5] Reconstruindo container...${NC}"
if [ -f "/tmp/optirota_env_backup" ]; then
    cp /tmp/optirota_env_backup .env
fi
docker compose build --no-cache
echo -e "${GREEN}Build concluído!${NC}"

echo -e "\n${YELLOW}[5/5] Iniciando nova versão...${NC}"
docker compose up -d
echo -e "${GREEN}Container iniciado!${NC}"

sleep 5

if docker ps | grep -q optirota-app; then
    echo -e "\n${GREEN}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              DEPLOY CONCLUÍDO COM SUCESSO!                         ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════╝${NC}"
    echo -e "O OptiRota está rodando em: https://optirota.timepulseai.com.br"
else
    echo -e "\n${RED}Erro: Container não iniciou corretamente!${NC}"
    echo -e "Verifique os logs: docker logs optirota-app"
    exit 1
fi
