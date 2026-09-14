# 🎮 Arena Strike

> A professional 2D top-down tactical multiplayer shooter built with
> Next.js, TypeScript, and Socket.IO.

## 🚀 Play Arena Strike

**[▶ Play the Game](https://arena-strike.pages.dev)**

Arena Strike is a browser-based tactical shooter designed for desktop
gameplay, with real-time multiplayer support.

## ✨ Features

-   🎯 2D top-down tactical shooter gameplay
-   👥 Real-time multiplayer using Socket.IO
-   🕹️ Desktop-focused controls and gameplay
-   🌐 Online deployment with Cloudflare Pages
-   ⚡ Dedicated multiplayer server
-   📱 Progressive Web App (PWA) support
-   🔄 Automatic deployment from GitHub
-   🏠 Room-based multiplayer support
-   ❤️ Health and combat systems
-   🏆 Multiplayer game flow and player interaction

## 🎮 Controls

  Action          Control
  --------------- -----------------------------
  Move            `W` `A` `S` `D`
  Aim             Mouse
  Shoot           Left Mouse Button
  Other actions   Follow the in-game controls

> Controls may vary depending on the current game mode and
> implementation.

## 🌐 Live Services

### 🎮 Game

**https://arena-strike.pages.dev**

### ⚡ Multiplayer Server

**https://arena-strike-server.onrender.com**

The frontend is hosted on Cloudflare Pages, while the real-time
Socket.IO multiplayer server runs separately on Render.

## 🛠️ Tech Stack

-   **Next.js**
-   **React**
-   **TypeScript**
-   **JavaScript**
-   **Socket.IO**
-   **Node.js**
-   **PWA**
-   **Cloudflare Pages**
-   **Render**
-   **GitHub**

## 📁 Project Structure

``` text
arena-strike/
├── public/                  # Static assets and PWA files
├── src/                     # Next.js application source
├── multiplayer-server.js    # Socket.IO multiplayer server
├── capacitor.config.ts      # Capacitor configuration
├── next.config.ts           # Next.js configuration
├── package.json             # Project dependencies and scripts
└── README.md                # Project documentation
```

## 💻 Run Locally

Clone the repository:

``` bash
git clone https://github.com/rohp2205/arena-strike.git
cd arena-strike
```

Install dependencies:

``` bash
npm install
```

### Start the frontend

``` bash
npm run dev
```

The development site will normally be available at:

``` text
http://localhost:3000
```

### Start the multiplayer server

In another terminal:

``` bash
node multiplayer-server.js
```

The local multiplayer server runs on the configured local port.

## 🏗️ Production Build

Create the production static export:

``` bash
npm run build
```

The production files are generated in:

``` text
out/
```

## 🌍 Deployment

Arena Strike uses a split deployment architecture:

``` text
                    ┌──────────────────────┐
                    │   GitHub Repository   │
                    │     arena-strike      │
                    └──────────┬───────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
                 ▼                           ▼
       ┌──────────────────┐        ┌──────────────────┐
       │ Cloudflare Pages │        │      Render      │
       │    Frontend      │        │ Multiplayer API  │
       └────────┬─────────┘        └────────┬─────────┘
                │                           │
                ▼                           ▼
       arena-strike.pages.dev     arena-strike-server
                                      .onrender.com
```

The frontend connects to the multiplayer server through:

``` text
NEXT_PUBLIC_SOCKET_URL
```

## 🔐 Environment Variables

For production, configure:

``` text
NEXT_PUBLIC_SOCKET_URL=https://arena-strike-server.onrender.com
```

For local development, the application can use its local Socket.IO
server configuration.

## 🤝 Multiplayer

Arena Strike uses **Socket.IO** for real-time communication between
players.

The multiplayer server handles:

-   Player connections
-   Room management
-   Real-time player updates
-   Multiplayer game state communication
-   Player disconnections

## 📌 Project Status

**🟢 Live and playable**

The desktop version is deployed and the online multiplayer connection is
operational.

## 👨‍💻 Author

**Rohit Patil**

GitHub: [@rohp2205](https://github.com/rohp2205)

------------------------------------------------------------------------

⭐ If you like the project, consider giving the repository a star!
