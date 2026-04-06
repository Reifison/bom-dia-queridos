<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Bom dia queridos

SPA React (Vite) com API Node para chamadas ao Gemini. A chave da API fica **somente no servidor**, nunca no bundle do navegador.

View your app in AI Studio: https://ai.studio/apps/f084459c-2017-4407-a2a6-5486d5b5449d

## Run locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and set `GEMINI_API_KEY` (server-only; file is gitignored).
3. Start Vite and the API together: `npm run dev`
   - App: http://localhost:3000 (proxies `/api` to the API server)
   - API default port: `8787` (override with `API_PORT` in `.env.local` and the same value in `vite.config.ts` is read from `process.env.API_PORT` when you restart Vite)

## Production build

1. `npm run build`
2. `npm run start` (sets `NODE_ENV=production`; serves `dist/` and `/api` on the port from `PORT` or `8787`)

## Deploy notes

- If the static site and API share one origin, leave `VITE_API_ORIGIN` unset and use relative `/api` URLs.
- If the frontend is on another host, set `VITE_API_ORIGIN` at build time to your API origin (still no Gemini key in the client).

`npm run preview` (Vite only) does not start the API; use `npm run dev` or deploy the Node server above.

## Testar no Xcode (iOS)

O projeto usa **[Capacitor](https://capacitorjs.com/)**; a pasta `ios/` é o projeto nativo.

**Pré-requisitos:** Xcode instalado, CocoaPods à mão se o Xcode pedir (o template atual pode usar Swift Package Manager).

### Opção A — App estático + API no Mac (comum para “Gerar nova” funcionar)

1. No `.env.local` (ou `.env.production.local` só para este build), defina a origem da API **acessível pelo simulador/dispositivo**, por exemplo:
   - Simulador: `VITE_API_ORIGIN=http://127.0.0.1:8787`
   - iPhone na mesma rede: `VITE_API_ORIGIN=http://<IP-do-Mac>:8787`
2. Com a API a correr (`npm run start` ou `npm run dev:api` com a mesma porta), gere o bundle e copie para o iOS:
   - `npm run ios:sync`
3. Abra o Xcode: `npm run ios:open`
4. Escolha um simulador ou o seu iPhone e use **Run** (▶).

O `Info.plist` inclui **NSAllowsLocalNetworking** para facilitar HTTP em rede local durante testes.

### Se aparecer CORS ou “não foi possível conectar” ao gerar

No Capacitor, `fetch('/api/...')` **sem** `VITE_API_ORIGIN` no build vira pedido a `capacitor://localhost/api/...` — **não existe servidor**. O WebKit mostra erros de CORS ou de ligação mesmo com a API e a chave Gemini corretas.

**Correção:** `VITE_API_ORIGIN=http://127.0.0.1:8787` (ou IP do Mac no iPhone físico) no **`.env.local`**, depois **`npm run ios:sync`** de novo. Confirme **`npm run start`** no Mac e que a porta 8787 está livre.

### Opção B — Carregar o Vite em desenvolvimento (live reload)

1. Em [capacitor.config.ts](capacitor.config.ts), descomente `server.url` (ex.: `http://localhost:3000` no Simulador) e `cleartext: true`.
2. `npx cap sync ios`
3. Com `npm run dev` a correr, abra o Xcode e execute o app.

### Depois de alterar o front web

Sempre que mudar o React/CSS, volte a correr **`npm run ios:sync`** (ou `npm run build && npx cap sync ios`) antes de testar no Xcode, **exceto** na Opção B, onde o conteúdo vem do servidor de dev.
