#!/bin/sh
echo "🚀 Starting Safaeewala Webhook API microservice on port 3001..."
node /app/webhookServer.cjs &

echo "🌐 Starting Nginx Web Server on port 80..."
exec nginx -g "daemon off;"
