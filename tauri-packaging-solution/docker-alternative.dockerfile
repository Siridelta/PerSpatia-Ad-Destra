# Multi-stage build for Julia Canvas
FROM node:20-alpine AS frontend-builder

WORKDIR /app
COPY example-react-flow/package*.json ./
RUN npm ci

COPY example-react-flow/ ./
RUN npm run build

FROM julia:1.10-alpine AS julia-builder

WORKDIR /app
COPY julia-backend/ ./
RUN julia --project=. -e "using Pkg; Pkg.instantiate(); Pkg.precompile()"

FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    nodejs \
    npm

# Copy Julia
COPY --from=julia-builder /usr/local/julia /usr/local/julia
ENV PATH="/usr/local/julia/bin:${PATH}"

# Copy backend
WORKDIR /app
COPY --from=julia-builder /app ./backend

# Copy frontend
COPY --from=frontend-builder /app/dist ./frontend

# Create startup script
RUN cat > start.sh << 'EOF'
#!/bin/sh
# Start Julia backend in background
cd /app/backend
julia server.jl &
BACKEND_PID=$!

# Start frontend server
cd /app/frontend
npx serve -s . -l 3000 &
FRONTEND_PID=$!

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
EOF

RUN chmod +x start.sh

EXPOSE 3000 8081

CMD ["./start.sh"] 