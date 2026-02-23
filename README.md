<div align="center">
  <img src="https://genlayer.com/logo-dark.svg" alt="GenLayer Logo" width="200" style="margin-bottom: 20px;">
  
  # AI Breakup Arbitrator
  
  **Two people. One AI judge. Fair division of shared assets — on-chain, no lawyers.**

  [![Powered by GenLayer](https://img.shields.io/badge/Powered%20by-GenLayer-8B5CF6?style=flat-square&logo=c%2B%2B&logoColor=white)](https://genlayer.com)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

  <br>
</div>

## 📌 Overview

**AI Breakup Arbitrator** is a decentralized application built on the **[GenLayer](https://genlayer.com)** network. It uses Intelligent Contracts (GenVM) to resolve disputes over shared assets after a breakup. 

Instead of hiring expensive lawyers, the two partners list their shared assets and submit their cases. The contract then prompts an **on-chain Large Language Model (LLM)** to act as an impartial judge, review the evidence, and autonomously issue an immutable, legally-binding verdict on who gets what.

### Why this is revolutionary:
1. **Zero Crypto Friction**: Users don't need MetaMask, seed phrases, or gas tokens. The app uses *auto-generated local accounts* (like GenLayer Studio).
2. **Sponsor-Pays Model**: The backend Express server holds a funder wallet and pays the gas fees for deployments and interactions.
3. **AI Consensus**: The verdict isn't produced by one centralized server. It's produced by GenLayer's network of AI validators running consensus on the LLM output (the Equivalence Principle) to ensure absolute fairness.

---

## ✨ Features

- **Frictionless Onboarding**: Auto-generates a GenLayer Studionet identity for users on their first visit.
- **Real-Time Synchronisation**: Partners can share a link and see assets/cases update in real-time.
- **Secure Server-Side Signing**: Connects a simple frontend to a secure backend that handles the complex blockchain transactions.
- **GenVM Smart Contracts**: Written in Python, leveraging GenLayer's native LLM capabilities.
- **Stunning UI**: A modern, responsive, and animated frontend built with Vanilla JS, HTML, and CSS (no heavy frameworks).

---

## 🏗 Architecture

The project is split into two halves:

1. **`contracts/`**: Contains the Python `gl.Contract` code running on GenLayer GenVM.
   - `breakup_arbitrator.py`: The core Intelligent Contract. Manages state (assets, cases, partners) and calls `gl.call_llm()` to run the arbitration.
2. **`app/`**: Contains the entire web application.
   - `server.js`: An Express.js backend that holds the Deployer private key. It handles contract deployment and acts as an API bridge for the frontend.
   - `main.js` / `index.html` / `style.css`: The Vite-powered frontend. It generates a local private key for identity, but routes transactions through the server to bypass MetaMask/gas requirements.

---

## 🚀 Local Setup & Development

### Prerequisites
- Node.js (v18+)
- GenLayer Studionet Account (Get one at [studio.genlayer.com](https://studio.genlayer.com))

### 1. Clone the repository
```bash
git clone <repository-url>
cd "GenLayer New"
```

### 2. Install Dependencies
```bash
cd app
npm install
```

### 3. Environment Variables
Create a `.env` file inside the `app/` folder based on `.env.example`:

```env
# Get a wallet private key from GenLayer Studio > Accounts
DEPLOYER_PRIVATE_KEY=0xYOUR_STUDIONET_PRIVATE_KEY
PORT=3001
```
*Note: Make sure your deployer wallet has testnet $GEN tokens from the Studio faucet.*

### 4. Run the Full Stack
Start both the Express backend and the Vite frontend simultaneously:

```bash
npm run dev2
```

- The UI will be available at `http://localhost:5173`.
- The API backend will run at `http://localhost:3001`.

---

## 🌐 Deploying to Production (Railway)

This app is specifically configured for one-click deployment on **Railway**. The `server.js` acts dual-purpose: it runs the API, but also statically serves the compiled Vite frontend.

1. Ensure the contract file is inside the `app/` directory (e.g. `app/contract.py`)
2. Log into Railway CLI: `railway login`
3. Initialize the project: `railway init`
4. Set the environment variable:
   ```bash
   railway variables set DEPLOYER_PRIVATE_KEY=your_key_here
   railway variables set NPM_CONFIG_PRODUCTION=false
   ```
5. Deploy: 
   ```bash
   railway up
   ```

Railway will automatically run `npm run build:prod` (to compile the frontend) and then `npm start` (to run the server).

---

## 🧠 How the AI Consensus Works

GenLayer is a blockchain where smart contracts can execute LLMs. 
When `request_resolution()` is called in `breakup_arbitrator.py`:

1. The transaction is proposed to the GenLayer network.
2. The Leader Validator executes the contract, passing the assets and cases to the LLM.
3. The LLM produces a structured JSON response (the verdict).
4. **The Equivalence Principle**: Other Validators independently run the exact same prompt through their LLMs. Because LLMs are non-deterministic, they will get slightly different words, but the *semantic intent* will be the same.
5. If >50% of validators agree on the semantic outcome (e.g. "Wallet A gets the Dog, Wallet B gets the Car"), the state is finalized and written immutably to the blockchain.

---

<p align="center">
  <i>Built with ❤️ for the GenLayer Developer Ecosystem</i>
</p>
