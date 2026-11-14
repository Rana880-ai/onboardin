# ---------- Stage 1: build the SPA ----------
FROM node:22-alpine AS build
WORKDIR /app

# Vite inlines VITE_* env vars into the bundle at build time.
# Pass them with: docker build --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=...
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000

# Only runtime deps (nodemailer used by the api/ handlers)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.cjs ./
COPY api ./api
# The api handlers are CommonJS but package.json sets "type": "module";
# rename them to .cjs inside the image so Node loads them correctly.
# (Repo files stay .js so the Vercel deployment keeps working unchanged.)
RUN cd api && for f in *.js; do [ -e "$f" ] && mv "$f" "${f%.js}.cjs"; done; true
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "server.cjs"]
