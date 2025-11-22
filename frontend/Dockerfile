# Frontend build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY lumai/package*.json ./
RUN npm ci
COPY lumai/ ./
RUN npm run build

# Production image
FROM nginx:alpine
COPY lumai/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
