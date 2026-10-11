# Tokenized Compute Yield (TCY)

**A Web3 platform for tokenizing compute resources and distributing revenue on-chain.**

Tokenized Compute Yield is a decentralized application (dApp) that connects computing resources, such as GPUs, with blockchain-based asset tokens and revenue distribution.

The project combines a web interface, backend APIs, a database, and smart contracts to explore how compute infrastructure can be represented and managed on-chain.

## 🌐 Live Demo

- **Frontend:** https://compute-tokenized-yield-web.onrender.com
- **Backend API:** https://tokenized-compute-yield-api.onrender.com/health
- **Blockchain:** Monad Testnet

> Note: The application is actively developed. Some features may require a connected wallet, testnet funds, or configured backend services.

## ✨ Features

- **Compute Marketplace:** Explore available GPU and compute offers.
- **Live Offers:** View offers retrieved from the provider integration.
- **Saved Offers:** Browse offers synchronized and stored in the database.
- **Wallet Integration:** Connect a compatible wallet to interact with supported blockchain features.
- **Tokenized Compute Assets:** Support for representing compute assets through blockchain tokens.
- **On-chain Transactions:** Interact with deployed smart contracts on Monad Testnet.
- **Revenue Distribution:** Explore revenue distribution records and supported claiming workflows.
- **Backend API:** Provides endpoints for marketplace data and application functionality.
- **Persistent Storage:** Uses PostgreSQL through Prisma ORM to manage application data.

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Fastify, TypeScript |
| Database | PostgreSQL, Prisma ORM |
| Smart Contracts | Solidity, Foundry |
| Blockchain | Monad Testnet |
| Wallet Integration | MetaMask, viem |
| Deployment | Render |

## 🏗️ How It Works

1. **Discover compute resources:** Retrieve available compute offers from the provider integration.
2. **Save marketplace data:** Synchronize offers into the backend database for later access.
3. **Explore assets:** Use the web interface to view available compute resources and related information.
4. **Connect a wallet:** Connect a compatible wallet configured for Monad Testnet.
5. **Interact with smart contracts:** Use the supported token and revenue features.
6. **Track revenue distributions:** View available distribution information and interact with supported claiming functionality.

## 📁 Project Structure

```text
tokenized-compute-yield/
├── apps/
│   ├── api/          # Backend API and Prisma schema
│   └── web/          # React frontend
├── packages/         # Shared packages, if configured
├── package.json      # Root scripts and workspaces
└── README.md
```

The exact contents may vary as the project evolves.

## 🚀 Run Locally

### Prerequisites

Install the following:

- Node.js and npm, compatible with the project's `package.json`
- Git
- PostgreSQL
- MetaMask or another compatible EVM wallet for blockchain features

### 1. Clone the repository

```bash
git clone https://github.com/Chirag126/tokenized-compute-yield.git
cd tokenized-compute-yield
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Configure environment variables

Create the required environment files based on the project's configuration and any provided `.env.example` files.

Configure the necessary database connection, API settings, blockchain RPC endpoints, and other required credentials.

**Never commit private keys, API secrets, or real `.env` files to GitHub.**

### 4. Set up the database

Configure PostgreSQL and the database connection string expected by the API.

Generate the Prisma client:

```bash
npx prisma generate --schema apps/api/prisma/schema.prisma
```

Apply the database migrations using the migration workflow configured for this project.

### 5. Start the backend

Open a terminal in the project root:

```bash
npm run dev --workspace=apps/api
```

The API is expected to run at:

```text
http://localhost:4000
```

### 6. Start the frontend

Open a second terminal in the project root:

```bash
npm run dev --workspace=apps/web
```

Vite will display the local frontend URL, usually:

```text
http://localhost:5173
```

If needed, configure `VITE_API_BASE_URL` in the frontend environment to point to the backend API.

## ⛓️ Blockchain

The project uses **Monad Testnet** for supported smart contract interactions.

- **Network:** Monad Testnet
- **Chain ID:** `10143`
- **RPC URL:** `https://testnet-rpc.monad.xyz`
- **Block Explorer:** https://testnet.monadexplorer.com

Add the network to your wallet and obtain testnet funds before testing transactions that require gas.

Testnet tokens have no guaranteed real-world monetary value.

## 🧪 Development

Build the frontend:

```bash
npm run build --workspace=apps/web
```

Build the backend:

```bash
npx prisma generate --schema apps/api/prisma/schema.prisma
npm run build --workspace=apps/api
```

Run these commands from the repository root. Additional tests or scripts may be available in the respective workspace `package.json` files.

## ☁️ Deployment

The frontend and backend are deployed separately on Render.

For a deployment to work correctly:

- The frontend must use the correct backend API URL.
- The backend must have the required environment variables.
- CORS must allow requests from the deployed frontend.
- The database and blockchain RPC services must be reachable.
- Smart contract addresses must match the intended network.

## 🔐 Security Notes

- Never publish wallet private keys or seed phrases.
- Keep production credentials in environment variables or a secure secret manager.
- Use testnet funds when experimenting with blockchain transactions.
- Validate API inputs and handle transaction failures carefully.
- Verify smart contract addresses and network settings before interacting with contracts.

## 🎯 Project Goal

The goal of Tokenized Compute Yield is to explore the intersection of **compute infrastructure, tokenization, and on-chain revenue distribution** through a usable Web3 application.

## 📄 License

Add your chosen open-source license here if you intend to publish the project under one.
