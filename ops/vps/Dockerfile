# Build frontend static + run Express API
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
RUN cd frontend && npm run build

FROM node:20-bookworm-slim AS api
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY backend ./backend
COPY --from=frontend-build /build/frontend/dist ./frontend/dist
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "src/server.js"]
