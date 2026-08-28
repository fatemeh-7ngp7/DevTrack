# --- Build stage ---
FROM docker.arvancloud.ir/library/node:20-alpine AS build

WORKDIR /app

# REACT_APP_BACKEND_URL is baked at build time (CRA). Default points to local backend.
ARG REACT_APP_BACKEND_URL=http://localhost:8001
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

# --- Serve stage ---
FROM docker.arvancloud.ir/library/nginx:1.27-alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
