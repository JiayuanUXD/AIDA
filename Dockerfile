# --- Build Stage ---
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install ALL dependencies
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

# Build frontend and backend
# npm run build executes: vite build && tsc --project tsconfig.json
RUN npm run build

# --- Production Stage ---
FROM node:18-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy built assets and backend from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# Expose port (Cloud Run primarily uses the PORT environment variable)
EXPOSE 3000

# Start the server
CMD ["npm", "run", "start"]