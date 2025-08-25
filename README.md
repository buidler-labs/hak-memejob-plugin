# Hedera Agent Kit - Memejob Plugin

A plugin for [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit) that provides seamless integration with the memejob protocol for memecoin operations on the Hedera network.

## Overview

The memejob plugin enables `AI agents` to interact with the protocol, providing three core functionalities for memecoin management:

- **Create** memecoins
- **Buy** memecoins
- **Sell** memecoins

## Installation

```bash
npm install @buidlerlabs/hak-memejob-plugin
```

## Quick Start

```javascript
import { HederaAIToolkit, AgentMode } from "hedera-agent-kit";
import { memejobPlugin } from "@buidlerlabs/hak-memejob-plugin";

const hederaAgentToolkit = new HederaAIToolkit({
  client,
  configuration: {
    plugins: [memejobPlugin],
    context: {
      mode: AgentMode.RETURN_BYTES,
    },
  },
});
```

## Tools

### 1. Create Memecoins

Creates a new coin on memejob.

#### Parameters

**Required:**

- `name`: The name of the token
- `symbol`: The token symbol
- `memo`: The token metadata IPFS path containing token information and assets

**Optional:**

- `amount`: The initial token amount to purchase upon creation
- `distributeRewards`: Whether to enable reward distribution for partner token holders
- `referrer`: The EVM address of the referrer who will receive referral rewards

---

### 2. Buy Memecoins

Purchases an existing coin on memejob.

> 💡 **Tip:** Ensure the Hedera account has auto associations enabled; otherwise, instruct the agent to auto-associate the token before purchasing.

#### Parameters

**Required:**

- `tokenId`: The ID of the token to purchase (e.g. '0.0.123456')
- `amount`: The quantity of tokens to buy

**Optional:**

- `autoAssociate`: Automatically associate the token with your account before purchasing (default: true)
- `referrer`: The EVM address of the referrer (format: 0x000...000)

---

### 3. Sell Memecoins

Sells memecoins on memejob.

#### Parameters

**Required:**

- `tokenId`: The ID of the token to sell (e.g. '0.0.123456')
- `amount`: The quantity of tokens to sell

**Optional:**

- `instant`: Whether to automatically approve token allowance before selling (default: true for faster transactions)

---

Made with ❤️ by [BuidlerLabs Team](https://buidlerlabs.com/)
