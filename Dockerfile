# ==============================================================================
# Safaeewala Booking CRM - Production Docker Container
# Lightweight, isolated, high-performance static SPA server using Alpine Nginx
# ==============================================================================
FROM nginx:alpine

LABEL maintainer="Safaeewala Cleaning & Maintenance LLC"
LABEL project="safaeewala-booking-crm"
LABEL description="Dedicated isolated container for Safaeewala Booking Dashboard & CRM"

# Remove default nginx configurations and static files
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/*

# Copy custom Nginx configuration optimized for Vite SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy production bundle
COPY dist /usr/share/nginx/html

# Expose internal container port
EXPOSE 80

# Health check to ensure nginx is serving traffic
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:80/ || exit 1

# Start nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
