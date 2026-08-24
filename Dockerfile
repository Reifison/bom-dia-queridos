FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_ORIGIN
ENV VITE_API_ORIGIN=${VITE_API_ORIGIN}
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["npm", "run", "start"]
