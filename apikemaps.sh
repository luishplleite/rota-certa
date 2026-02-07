#!/bin/bash

echo "=== Configuração das Credenciais do Google Maps ==="
echo ""

if [ -z "$1" ]; then
    echo "Uso: source ./apikemaps.sh SUA_CHAVE_GOOGLE_MAPS"
    echo ""
    echo "Exemplo:"
    echo "  source ./apikemaps.sh AIzaSyAbcdef123456..."
    echo ""
    echo "Ou defina manualmente:"
    echo "  export GOOGLE_MAPS_API_KEY='sua_chave'"
    echo "  export VITE_GOOGLE_MAPS_API_KEY='sua_chave'"
    exit 1
fi

export GOOGLE_MAPS_API_KEY="$1"
export VITE_GOOGLE_MAPS_API_KEY="$1"

echo "Credenciais configuradas:"
echo "  GOOGLE_MAPS_API_KEY: ****${1: -4}"
echo "  VITE_GOOGLE_MAPS_API_KEY: ****${1: -4}"
echo ""
echo "Agora inicie o aplicativo com: npm run dev"
