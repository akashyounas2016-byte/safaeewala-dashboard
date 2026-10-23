# ==============================================================================
# Safaeewala Booking CRM - Production Docker Container
# Lightweight, isolated, high-performance static SPA server using Alpine Nginx
# ==============================================================================
FROM nginx:alpine

LABEL maintainer="Safaeewala Cleaning & Maintenance LLC"
LABEL project="safaeewala-booking-crm"
LABEL description="Dedicated isolated container for Safaeewala Booking Dashboard & CRM"

# Remove default nginx configurations and static files
RUN apk add --no-cache nodejs \
    && rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/*

# Copy custom Nginx configuration optimized for Vite SPA and API proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy production bundle
COPY dist /usr/share/nginx/html

# Copy webhook microservice and startup entrypoint
WORKDIR /app
COPY webhookServer.cjs /app/webhookServer.cjs
COPY entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh && mkdir -p /data

# Expose internal container port (80 for Nginx, 3001 for microservice)
EXPOSE 80 3001

# Health check to ensure nginx is serving traffic
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:80/ || exit 1

# Start using entrypoint which launches webhook microservice and nginx
CMD ["/app/entrypoint.sh"]
