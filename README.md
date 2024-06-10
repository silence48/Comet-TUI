Certainly! Below is the expanded guide with added sections on utility functions and the `comet.ts` functions.

---

# Guide: Building Functional User Interfaces for Dapps using Terminal User Interface (TUI)

## Table of Contents

- [Guide: Building Functional User Interfaces for Dapps using Terminal User Interface (TUI)](#guide-building-functional-user-interfaces-for-dapps-using-terminal-user-interface-tui)
  - [Table of Contents](#table-of-contents)
  - [Introduction](#introduction)
  - [Prerequisites](#prerequisites)
  - [Project Setup](#project-setup)
    - [Directory Structure](#directory-structure)
    - [Installing Dependencies](#installing-dependencies)
  - [Configuration](#configuration)
  - [Code Breakdown](#code-breakdown)
    - [LP\_CLI.ts](#lp_clits)
    - [Comet.ts](#cometts)
    - [Detailed Explanation](#detailed-explanation)
      - [Utility Functions](#utility-functions)
      - [CometClient Class](#cometclient-class)
    - [AddressBook.ts](#addressbookts)
    - [tsconfig.json](#tsconfigjson)
    - [package.json](#packagejson)
  - [Utility Functions](#utility-functions-1)
    - [env\_config.ts](#env_configts)
    - [tx.ts](#txts)
    - [address-book.ts](#address-bookts)
  - [Comet.ts Functions](#cometts-functions)
      - [Utility Functions](#utility-functions-2)
      - [CometClient Class](#cometclient-class-1)
    - [Example: Building and Submitting a Transaction](#example-building-and-submitting-a-transaction)
  - [Inquirer.js Overview](#inquirerjs-overview)
    - [What is Inquirer.js?](#what-is-inquirerjs)
    - [How Does Inquirer.js Work?](#how-does-inquirerjs-work)
    - [Setting Up Inquirer.js](#setting-up-inquirerjs)
    - [Creating Prompts](#creating-prompts)
      - [1. List Prompt](#1-list-prompt)
      - [2. Input Prompt](#2-input-prompt)
      - [3. Confirm Prompt](#3-confirm-prompt)
    - [Handling User Input](#handling-user-input)
    - [Example Usage](#example-usage)
  - [Running the CLI](#running-the-cli)
    - [Install and Build the Project](#install-and-build-the-project)
    - [Running the CLI](#running-the-cli-1)
  - [Example Usage](#example-usage-1)
  - [Next Steps](#next-steps)
    - [User Assignment: Accepting Custom Input for Tokens and Pool](#user-assignment-accepting-custom-input-for-tokens-and-pool)
    - [Steps to Implement:](#steps-to-implement)
    - [Assignment](#assignment)
  - [Conclusion](#conclusion)
  - [Appendix](#appendix)

## Introduction

This guide provides a comprehensive walkthrough for building a functional user interface for decentralized applications (dapps) using a Terminal User Interface (TUI). We will use an example of adding liquidity to a liquidity pool contract, specifically the 'comet' contract. This guide utilizes the Node.js library 'inquirer' for creating interactive command-line prompts.

## Prerequisites

Before you start, ensure you have the following:

- Basic knowledge of JavaScript/TypeScript.
- Familiarity with Node.js.
- Understanding of blockchain and dapps concepts.
- Node.js and npm installed on your machine.

## Project Setup

### Directory Structure

The easiest way to get started is to clone the starter repository I made at https://www.github.com/silence48/Comet-TUI
But if you like doing things from scratch, I'll try to walk through all of the code in this guide.

Organize your project directory as follows:

```
project-root/
├── src/
│   ├── cli/
│   │   └── LP_CLI.ts
│   ├── utils/
│   │   └── comet.ts
│   │   └── address-book.ts
│   │   └── tx.ts
│   │   └── env_config.ts
│   │   └── ledger_entry_helper.ts
├── package.json
├── tsconfig.json
└── .env
```

### Installing Dependencies

Run the following command to install the necessary dependencies:

```bash
npm install @stellar/stellar-sdk @blend-capital/blend-sdk dotenv inquirer typescript
```

## Configuration

Create a `.env` file in your project root and add the following environment variables:

```env
RPC_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
```

## Code Breakdown

### LP_CLI.ts

This is the main file, and in it, we use the inquirer library in Node.js to build a terminal interface for the comet contract to add liquidity. We will also utilize some helper functions for building, signing, and submitting the transactions.

```ts
import {
  Address,
  SorobanRpc,
  xdr,
  TransactionBuilder,
  Transaction,
  scValToBigInt,
  scValToNative,
} from '@stellar/stellar-sdk';
import { estJoinPool, CometClient } from '../utils/comet.js';
import { AddressBook } from '../utils/address-book.js';
import inquirer from 'inquirer';
import { TxParams, signWithKeypair, sendTransaction } from '../utils/tx.js';
import { config } from '../utils/env_config.js';
import { BackstopToken, ContractErrorType, parseError } from '@blend-capital/blend-sdk';
import { decodeEntryKey } from '../utils/ledger_entry_helper.js';

const DECIMALS = 7;

/**
 * Scales a string amount to bigint based on the specified number of decimals.
 * @param amount - The amount as a string.
 * @param decimals - The number of decimals.
 * @returns The scaled amount as bigint.
 */
function scaleInputToBigInt(amount: string, decimals: number): bigint {
  return BigInt(Math.floor(Number(amount) * Math.pow(10, decimals)));
}

/**
 * Converts a bigint amount to a string balance with the specified number of decimals.
 * @param amount - The amount as bigint.
 * @param decimals - The number of decimals.
 * @returns The balance as a string.
 */
function toBalance(amount: bigint, decimals: number): string {
  return (Number(amount) / Math.pow(10, decimals)).toFixed(decimals);
}

/**
 * Loads the BackstopToken data from the blockchain.
 * @param id - The contract ID.
 * @param blndTkn - The BLND token ID.
 * @param usdcTkn - The USDC token ID.
 * @returns A BackstopToken object containing the token data.
 */
async function loadBackstopToken(
  id: string,
  blndTkn: string,
  usdcTkn: string
): Promise<BackstopToken> {
  const rpc = config.rpc;

  // Define the ledger keys for the contract data
  const recordDataKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(id).toScAddress(),
      key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('AllRecordData')]),
      durability: xdr.ContractDataDurability.persistent(),
    })
  );
  const totalSharesKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(id).toScAddress(),
      key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('TotalShares')]),
      durability: xdr.ContractDataDurability.persistent(),
    })
  );

  // Fetch the ledger entries for the contract data
  const ledgerEntriesResp = await Promise.all([
    rpc.getLedgerEntries(recordDataKey),
    rpc.getLedgerEntries(totalSharesKey),
  ]);

  let blnd: bigint | undefined;
  let usdc: bigint | undefined;
  let totalShares: bigint | undefined;

  // Parse the ledger entries to extract the token data
  for (const response of ledgerEntriesResp) {
    for (const entry of response.entries) {
      const ledgerData = entry.val;
      const key = decodeEntryKey(ledgerData.contractData().key());
      if (key === 'AllRecordData') {
        const records = scValToNative(ledgerData.contractData().val());
        blnd = records[blndTkn]?.balance;
        usdc = records[usdcTkn]?.balance;
      } else if (key === 'TotalShares') {
        totalShares = scValToNative(ledgerData.contractData().val());
      }
    }
  }

  // Check if any data is missing
  if (blnd === undefined || usdc === undefined || totalShares === undefined) {
    throw new Error('Invalid backstop token data');
  }

  // Calculate token ratios
  const blndPerLpToken = Number(blnd) / Number(totalShares);
  const usdcPerLpToken = Number(usdc) / Number(totalShares);
  const lpTokenPrice = (Number(usdc) * 5) / Number(totalShares);

  // Return the BackstopToken object
  return new BackstopToken(
    id,
    blnd,
    usdc,
    totalShares,
    blndPerLpToken,
    usdcPerLpToken,
    lpTokenPrice
  );
}

/**
 * Mints LP tokens by adding liquidity to the pool.
 * @param addressBook - The AddressBook instance containing contract addresses.
 * @param mintAmount - The amount of LP tokens to mint.
 * @param slippage - The maximum slippage percentage.
 */
async function mintLPTokens(addressBook: AddressBook, mintAmount: bigint, slippage: number) {
  console.log('Minting LP tokens with BLND and USDC...');

  // Fetch contract addresses from the address book
  const cometAddress = addressBook.getContractId('comet');
  const blndAddress = addressBook.getContractId('BLND');
  const usdcAddress = addressBook.getContractId('USDC');

  const comet = new CometClient(cometAddress);

  // Fetch the current pool data
  const poolData = await loadBackstopToken(cometAddress, blndAddress, usdcAddress);

  // Estimate the required BLND and USDC amounts
  const { blnd, usdc } = estJoinPool(poolData, mintAmount, slippage);

  const estimatedBLND = toBalance(scaleInputToBigInt(blnd.toString(), DECIMALS), DECIMALS);
  const estimatedUSDC = toBalance(scaleInputToBigInt(usdc.toString(), DECIMALS), DECIMALS);

  console.log(`Estimated BLND: ${estimatedBLND}, Estimated USDC: ${estimatedUSDC}`);

  const txParams: TxParams = {
    account: await config.rpc.getAccount(config.admin.publicKey()),
    txBuilderOptions: {
      fee: '10000',
      timebounds: {
        minTime: 0,
        maxTime: 0,
      },
      networkPassphrase: config.passphrase,
    },
    signerFunction: async (txXdr: string) =>
      signWithKeypair(txXdr, config.passphrase, config.admin),
  };

  // Build the join operation
  const joinOp = comet.join({
    poolAmount: mintAmount,
    blndLimitAmount: scaleInputToBigInt(blnd.toString(), DECIMALS),
    usdcLimitAmount: scaleInputToBigInt(usdc.toString(), DECIMALS),
    user: config.admin.publicKey(),
  });

  // Create the transaction
  const tx = new TransactionBuilder(txParams.account, txParams.txBuilderOptions)
    .addOperation(joinOp)
    .setTimeout(30)
    .build();

  // Simulate the transaction
  const simulateResponse = await config.rpc.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simulateResponse)) {
    console.error('Simulation failed:', simulateResponse.error);
    return;
  }

  console.log('Simulation successful.');

  // Confirm with the user before proceeding
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Proceed with the transaction to mint LP tokens using ${estimatedBLND} BLND and ${estimatedUSDC}?`,
    },
  ]);

  if (!confirm) {
    console.log('Transaction cancelled.');
    return;
  }

  console.log('Proceeding to submit the transaction.');
  const assembledTx = SorobanRpc.assembleTransaction(tx, simulateResponse).build();
  // Sign and submit the transaction
  const signedTxEnvelopeXDR = await txParams.signerFunction(assembledTx.toXDR());
  const signedTx = new Transaction(signedTxEnvelopeXDR, config.passphrase);

  const sendResponse = await config.rpc.sendTransaction(signedTx);

  if (sendResponse.status === 'ERROR') {
    console.error('Minting LP tokens failed:', sendResponse.errorResult);
    return;
  }

  // Fetch and parse the transaction result
  let get_tx_response: SorobanRpc.Api.GetTransactionResponse = await config.rpc.getTransaction(
    sendResponse.hash
  );
  while (get_tx_response.status === 'NOT_FOUND') {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    get_tx_response = await config.rpc.getTransaction(sendResponse.hash);
  }

  if (get_tx_response.status === 'SUCCESS') {
    console.log('Transaction successfully submitted with hash:', sendResponse.hash);
  } else {
    console.log('Transaction failed:', get_tx_response.status, sendResponse.hash);
    const error = parseError(get_tx_response as any);
    console.error(
      'Transaction failure detail:',
      error,
      'Failure Message:',
      ContractErrorType[error.type]
    );
    throw error; // Rethrow to ensure calling code can handle it
  }
}

/**
 * Main function to prompt the user and initiate the minting of LP tokens.
 */
async function main() {
  // Prompt the user to select the network
  const { network } = await inquirer.prompt([
    {
      type: 'list',
      name: 'network',
      message: 'Select the network:',
      choices: ['testnet', 'mainnet', 'futurenet'],
    },
  ]);

  // Load the address book for the selected network
  const addressBook = await AddressBook.loadFromFile(network);

  // Prompt the user for the mint amount and slippage
  const { mintAmount, slippage } = await inquirer.prompt([
    {
      type: 'input',
      name: 'mintAmount',
      message: 'Enter the amount of LP tokens to mint:',
      validate: (input) => (!isNaN(input) && Number(input) > 0 ? true : 'Invalid amount'),
    },
    {
      type: 'input',
      name: 'slippage',
      message: 'Enter the maximum slippage percentage (e.g., 1 for 1%):',
      validate: (input) => (!isNaN(input) && Number(input) > 0 ? true : 'Invalid slippage'),
    },
  ]);

  // Mint the LP tokens
  await mintLPTokens(addressBook, scaleInputToBigInt(mintAmount, DECIMALS), Number(slippage) / 100);
}

// Run the main function and catch any errors
main().catch((error) => {
  console.error('Error:', error);
});
```

### Comet.ts

This file contains utility functions related to the Comet contract, including functions to estimate the amounts for pool operations and to interact with the contract.

```typescript
import { BackstopToken } from '@blend-capital/blend-sdk';
import { Contract, nativeToScVal, xdr } from '@stellar/stellar-sdk';

/**
 * Estimates the amount of BLND and USDC that will be deposited into the pool during a join operation.
 * @param pool_data - The current state of the pool.
 * @param toMint - The amount of LP tokens to mint.
 * @param maxSlippage - The maximum allowable slippage percentage.
 * @returns An object containing the estimated amounts of BLND and USDC to be deposited.
 */
export function estJoinPool(
  pool_data: BackstopToken,
  toMint: bigint,
  maxSlippage: number
): { blnd: number; usdc: number } {
  const ratio = Number(pool_data.shares + toMint) / Number(pool_data.shares) - 1;
  const blnd = (Number(pool_data.blnd) / 1e7) * ratio * (1 + maxSlippage);
  const usdc = (Number(pool_data.usdc) / 1e7) * ratio * (1 + maxSlippage);
  return { blnd, usdc };
}

/**
 * Estimates the amount of LP tokens that will be received during a join operation with specified amounts of BLND and USDC.
 * @param pool_data - The current state of the pool.
 * @param blnd - The amount of BLND to deposit.
 * @param usdc - The amount of USDC to deposit.
 * @param maxSlippage - The maximum allowable slippage percentage.
 * @returns The estimated amount of LP tokens to be received.
 */
export function estLPTokenViaJoin(
  pool_data: BackstopToken,
  blnd: bigint,
  usdc: bigint,
  maxSlippage: number
): number {
  const blndNetSlippage = (Number(blnd) / 1e7) * (1 - maxSlippage);
  const blndRatio = blndNetSlippage / (Number(pool_data.blnd) / 1e7);
  const blndJoinAmount = blndRatio * (Number(pool_data.shares) / 1e7);

  const usdcNetSlippage = (Number(usdc) / 1e7) * (1 - maxSlippage);
  const usdcRatio = usdcNetSlippage / (Number(pool_data.usdc) / 1e7);
  const usdcJoinAmount = usdcRatio * (Number(pool_data.shares) / 1e7);

  return Math.min(blndJoinAmount, usdcJoinAmount);
}

/**
 * Estimates the amount of BLND and USDC that will be withdrawn from the pool during an exit operation.
 * @param pool_data - The current state of the pool.
 * @param toBurn - The amount of LP tokens to burn.
 * @param maxSlippage - The maximum allowable slippage percentage.
 * @returns An object containing the estimated amounts of BLND and USDC to be withdrawn.
 */
export function estExitPool(
  pool_data: BackstopToken,
  toBurn: bigint,
  maxSlippage: number
): { blnd: number; usdc: number } {
  const ratio = 1 - Number(pool_data.shares - toBurn) / Number(pool_data.shares);
  const blnd = (Number(pool_data.blnd) / 1e7) * ratio * (1 - maxSlippage);
  const usdc = (Number(pool_data.usdc) / 1e7) * ratio * (1 - maxSlippage);
  return { blnd, usdc };
}

/**
 * Interface for the arguments required for a single-sided deposit operation in the Comet pool.
 */
export interface CometSingleSidedDepositArgs {
  depositTokenAddress: string;
  depositTokenAmount: bigint;
  minLPTokenAmount: bigint;
  user: string;
}

/**
 * Interface for the arguments required for a liquidity operation in the Comet pool.
 */
export interface CometLiquidityArgs {
  poolAmount: bigint;
  blndLimitAmount: bigint;
  usdcLimitAmount: bigint;
  user: string;
}

/**
 * Client class for interacting with the Comet liquidity pool contract.
 */
export class CometClient {
  comet: Contract;

  /**
   * Initializes the CometClient with the contract address.
   * @param address - The address of the Comet contract.
   */
  constructor(address: string) {
    this.comet = new Contract(address);
  }

  /**
   * Creates a single-sided deposit operation for the Comet pool.
   * @param args - Arguments for the deposit operation.
   * @returns An XDR operation.
   */
  public depositTokenInGetLPOut(args: CometSingleSidedDepositArgs): xdr.Operation {
    const invokeArgs = {
      method: 'dep_tokn_amt_in_get_lp_tokns_out',
      args: [
        nativeToScVal(args.depositTokenAddress, { type: 'address' }),
        nativeToScVal(args.depositTokenAmount, { type: 'i128' }),
        nativeToScVal(args.minLPTokenAmount, { type: 'i128' }),
        nativeToScVal(args.user, { type: 'address' }),
      ],
    };
    return this.comet.call(invokeArgs.method, ...invokeArgs.args);
  }

  /**
   * Creates a join operation for the Comet pool.
   * @param cometLiquidityArgs - Arguments for the join operation.
   * @returns An XDR operation.
   */
  public join(args: CometLiquidityArgs): xdr.Operation {
    const invokeArgs = {
      method: 'join_pool',
      args: [
        nativeToScVal(args.poolAmount, { type: 'i128' }),
        nativeToScVal([args.blndLimitAmount, args.usdcLimitAmount], { type: 'i128' }),
        nativeToScVal(args.user, { type: 'address' }),
      ],
    };
    return this.comet.call(invokeArgs.method, ...invokeArgs.args);
  }

  /**
   * Creates an exit operation for the Comet pool.
   * @param cometLiquidityArgs - Arguments for the exit operation.
   * @returns An XDR operation.
   */
  public exit(args: CometLiquidityArgs): xdr.Operation {
    const invokeArgs = {
      method: 'exit_pool',
      args: [
        nativeToScVal(args.poolAmount, { type: 'i128' }),
        nativeToScVal([args.blndLimitAmount, args.usdcLimitAmount], { type: 'i128' }),
        nativeToScVal(args.user, { type: 'address' }),
      ],
    };
    return this.comet.call(invokeArgs.method, ...invokeArgs.args);
  }
}
```

### Detailed Explanation

#### Utility Functions

**`estJoinPool`**
- This function estimates the amounts of BLND and USDC required to join the pool based on the desired amount of LP tokens to mint (`toMint`) and the maximum allowable slippage (`maxSlippage`).
- It calculates the ratio of new shares to existing shares and uses it to estimate the required BLND and USDC.

**`estLPTokenViaJoin`**
- This function estimates the amount of LP tokens that can be received for given amounts of BLND and USDC, considering the maximum slippage.
- It calculates the join amounts based on BLND and USDC independently and returns the minimum of the two to ensure both limits are satisfied.

**`estExitPool`**
- This function estimates the amounts of BLND and USDC that will be received upon exiting the pool by burning a specified amount of LP tokens (`toBurn`) with a maximum slippage.
- It calculates the ratio of burned shares to total shares and uses it to estimate the amounts of BLND and USDC to be withdrawn.

#### CometClient Class

**`CometClient`**
- This class provides methods to interact with the Comet liquidity pool contract.

**Constructor**
- Initializes the client with the contract address, creating an instance of the `Contract` class.

**`depositTokenInGetLPOut`**
- This method creates a single-sided deposit operation where a specified amount of a token is deposited into the pool to receive LP tokens.
- It takes arguments including the token address, deposit amount, minimum LP token amount, and user address, and returns an XDR operation.

**`join`**
- This method creates a join operation for adding liquidity to the pool.
- It takes arguments including the pool amount, BLND and USDC limits, and user address, and returns an XDR operation.

**`exit`**
- This method creates an exit operation for removing liquidity from the pool.
- It takes arguments including the pool amount, BLND and USDC limits, and user address, and returns an XDR operation.


### AddressBook.ts

This file manages contract addresses and their corresponding wasm hashes in files called network.address.json such as `testnet.address.json`.
```typescript
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AddressBook {
  private ids: Map<string, string>;
  private hashes: Map<string, string>;
  private fileName: string;

  constructor(ids: Map<string, string>, hashes: Map<string, string>, fileName: string) {
    this.ids = ids;
    this.hashes = hashes;
    this.fileName = fileName;
  }

  /**
   * Load the address book from a file or create a blank one
   *
   * @param network - The network to load the contracts for
   * @returns Contracts object loaded based on the network
   */
  static loadFromFile(network: string) {
    const fileName = `../../${network}.contracts.json`;
    try {
      const contractFile = readFileSync(path.join(__dirname, fileName));
      const contractObj = JSON.parse(contractFile.toString());
      return new AddressBook(
        new Map(Object.entries(contractObj.ids)),
        new Map(Object.entries(contractObj.hashes)),
        fileName
      );
    } catch {
      // unable to load file, it likely doesn't exist
      return new AddressBook(new Map(), new Map(), fileName);
    }
  }

  /**
   * Write the current address book to a file
   */
  writeToFile() {
    const newFile = JSON.stringify(
      this,
      (key, value) => {
        if (value instanceof Map) {
          return Object.fromEntries(value);
        } else if (key != 'fileName') {
          return value;
        }
      },
      2
    );
    writeFileSync(path.join(__dirname, this.fileName), newFile);
  }

  /**
   * Get the hex encoded contractId for a given contractKey
   * @param contractKey - The name of the contract
   * @returns Hex encoded contractId
   */
  getContractId(contractKey: string) {
    const contractId = this.ids.get(contractKey);

    if (contractId != undefined) {
      return contractId;
    } else {
      console.error(`unable to find address for ${contractKey} in ${this.fileName}`);
      throw Error();
    }
  }

  /**
   * Set the hex encoded contractId for a given contractKey
   * @param contractKey - The name of the contract
   * @param contractId Hex encoded contractId
   */
  setContractId(contractKey: string, contractId: string) {
    this.ids.set(contractKey, contractId);
    console.warn(`set contractid ${contractKey}, ${contractId}`);
    this.writeToFile();
  }

  /**
   * Get the hex encoded wasmHash for a given contractKey
   * @param contractKey - The name of the contract
   * @returns Hex encoded wasmHash
   */
  getWasmHash(contractKey: string) {
    const washHash = this.hashes.get(contractKey);

    if (washHash != undefined) {
      return washHash;
    } else {
      console.error(`unable to find hash for ${contractKey} in ${this.fileName}`);
      throw Error();
    }
  }

  /**
   * Set the hex encoded wasmHash for a given contractKey
   * @param contractKey - The name of the contract
   * @param wasmHash - Hex encoded wasmHash
   */
  setWasmHash(contractKey: string, wasmHash: string) {
    this.hashes.set(contractKey, wasmHash);
    console.warn(`set wasm hash ${contractKey}, ${wasmHash}`);
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "lib": ["es2023"],
    "module": "nodeNext",
    "target": "es2022",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "nodeNext",
    "outDir": "./lib"
  },
  "include": [
    "src",
    "lib"
  ]
}
```

### package.json
Define the project's dependencies and scripts.

```json
{
  "name": "blend-utils",
  "version": "1.0.0",
  "description": "Deployment and utility scripts for the Blend Protocol",
  "type": "module",
  "scripts": {
    "build": "rm -rf lib && tsc",
    "deploy": "npm run build && node lib/deploy/deploy.js"
  },
  "license": "MIT",
  "engines": {
    "npm": ">=8.0.0",
    "node": ">=16.0.0"
  },
  "devDependencies": {
    "@stellar/tsconfig": "^1.0.2",
    "@types/inquirer": "^9.0.7",
    "@types/node": "^20.8.2",
    "@typescript-eslint/eslint-plugin": "^5.59.0",
    "@typescript-eslint/parser": "^5.59.0",
    "eslint": "^8.38.0",
    "eslint-config-prettier": "^8.8.0",
    "eslint-plugin-prettier": "^4.2.1",
    "prettier": "^2.8.7",
    "typescript": "^5.0.4"
  },
  "dependencies": {
    "@blend-capital/blend-sdk": "^1.1.1",
    "@stellar/stellar-sdk": "12.0.0-rc.3",
    "dotenv": "^16.1.4",
    "inquirer": "^9.2.22"
  },
   "resolutions": {
    "@stellar/stellar-sdk": "12.0.0-rc.3"
  }
}
```

## Utility Functions

The utility functions play a crucial role in managing the environment configuration, handling transactions, and parsing ledger entries. Here's a detailed look at what each utility function does:

### env_config.ts

This file loads the environment configuration from a `.env` file and provides utility functions to get user Keypairs.

- **EnvConfig Class**: Loads the environment configuration.
- **loadFromFile()**: Reads the environment variables and initializes the configuration.
- **getUser(userKey: string)**: Retrieves the Keypair for a user from the environment variables.


```typescript
import { Keypair, SorobanRpc } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

class EnvConfig {
  rpc: SorobanRpc.Server;
  passphrase: string;
  admin: Keypair;

  constructor(
    rpc: SorobanRpc.Server,
    passphrase: string,
    admin: Keypair
  ) {
    this.rpc = rpc;
    this.passphrase = passphrase;
    this.admin = admin;
  }

  /**
   * Load the environment config from the .env file
   * @returns Environment config
   */
  static loadFromFile(): EnvConfig {
    const rpc_url = process.env.RPC_URL;
    const friendbot_url = process.env.FRIENDBOT_URL;
    const admin = process.env.ADMIN;

    if (
      rpc_url == undefined ||
      passphrase == undefined ||
      admin == undefined
    ) {
      throw new Error('Error: .env file is missing required fields');
    }

    return new EnvConfig(
      new SorobanRpc.Server(rpc_url, { allowHttp: true }),
      passphrase,
      Keypair.fromSecret(admin)
    );
  }

  /**
   * Get the Keypair for a user from the env file
   * @param userKey - The name of the user in the env file
   * @returns Keypair for the user
   */
  getUser(userKey: string): Keypair {
    const userSecretKey = process.env[userKey];
    if (userSecretKey != undefined) {
      return Keypair.fromSecret(userSecretKey);
    } else {
      throw new Error(`${userKey} secret key not found in .env`);
    }
  }
}

export const config = EnvConfig.loadFromFile();
```

### tx.ts

This file contains functions for handling Stellar transactions.

- **signWithKeypair(txXdr: string, passphrase: string, source: Keypair)**: Signs a Stellar transaction with a given Keypair.
- **TxParams Type**: Defines the parameters required for building and signing transactions.


```typescript
import { Account, Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';

export type TxParams = {
  account: Account;
  signerFunction: (txXdr: string) => Promise<string>;
  txBuilderOptions: TransactionBuilder.TransactionBuilderOptions;
};

/**
 * Signs a Stellar transaction with a given Keypair.
 * @param {string} txXdr - The transaction in XDR format.
 * @param {string} passphrase - The network passphrase.
 * @param {Keypair} source - The Keypair to sign the transaction with.
 * @returns {Promise<string>} The signed transaction in XDR format.
 */
export async function signWithKeypair(
  txXdr: string,
  passphrase: string,
  source: Keypair
): Promise<string> {
  const tx = new Transaction(txXdr, passphrase);
  // Retrieve the transaction hash used for signatures.
  const txHash = tx.hash();
  console.log(`txhash in signer: ${txHash.toString('hex')}`);
  const sourceKeypair = Keypair.fromPublicKey(tx.source);

  tx.sign(source);
  const signed = tx.signatures.some((signature) => {
    // Verify the signature with the source account's public key.
    return sourceKeypair.verify(txHash, signature.signature());
  });
  console.log(`Was it signed in the signer function? ${signed}`);
  return tx.toXDR();
}
```

### address-book.ts

Manages contract addresses and their corresponding wasm hashes in a JSON file.

- **AddressBook Class**: Manages the contract addresses and hashes.
- **loadFromFile(network: string)**: Loads the address book from a file based on the specified network.
- **writeToFile()**: Writes the current address book to a file.
- **getContractId(contractKey: string)**: Retrieves the contract ID for a given contract key.
- **setContractId(contractKey: string, contractId: string)**: Sets the contract ID for a given contract key.
- **getWasmHash(contractKey: string)**: Retrieves the wasm hash for a given contract key.
- **setWasmHash(contractKey: string, wasmHash: string)**: Sets the wasm hash for a given contract key.


```typescript
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AddressBook {
  private ids: Map<string, string>;
  private hashes: Map<string, string>;
  private fileName: string;

  constructor(ids: Map<string, string>, hashes: Map<string, string>, fileName: string) {
    this.ids = ids;
    this.hashes = hashes;
    this.fileName = fileName;
  }

  /**
   * Load the address book from a file or create a blank one
   *
   * @param network - The network to load the contracts for
   * @returns Contracts object loaded based on the network
   */
  static loadFromFile(network: string) {
    const fileName = `../../${network}.contracts.json`;
    try {
      const contractFile = readFileSync(path.join(__dirname, fileName));
      const contractObj = JSON.parse(contractFile.toString());
      return new AddressBook(
        new Map(Object.entries(contractObj.ids)),
        new Map(Object.entries(contractObj.hashes)),
        fileName
      );
    } catch {
      // unable to load file, it likely doesn't exist
      return new AddressBook(new Map(), new Map(), fileName);
    }
  }

  /**
   * Write the current address book to a file
   */
  writeToFile() {
    const newFile = JSON.stringify(
      this,
      (key, value) => {
        if (value instanceof Map) {
          return Object.fromEntries(value);
        } else if (key != 'fileName') {
          return value;
        }
      },
      2
    );
    writeFileSync(path.join(__dirname, this.fileName), newFile);
  }

  /**
   * Get the hex encoded contractId for a given contractKey
   * @param contractKey - The name of the contract
   * @returns Hex encoded contractId
   */
  getContractId(contractKey: string) {
    const contractId = this.ids.get(contractKey);

    if (contractId != undefined) {
      return contractId;
    } else {
      console

.error(`unable to find address for ${contractKey} in ${this.fileName}`);
      throw Error();
    }
  }

  /**
   * Set the hex encoded contractId for a given contractKey
   * @param contractKey - The name of the contract
   * @param contractId Hex encoded contractId
   */
  setContractId(contractKey: string, contractId: string) {
    this.ids.set(contractKey, contractId);
    console.warn(`set contractid ${contractKey}, ${contractId}`);
    this.writeToFile();
  }

  /**
   * Get the hex encoded wasmHash for a given contractKey
   * @param contractKey - The name of the contract
   * @returns Hex encoded wasmHash
   */
  getWasmHash(contractKey: string) {
    const washHash = this.hashes.get(contractKey);

    if (washHash != undefined) {
      return washHash;
    } else {
      console.error(`unable to find hash for ${contractKey} in ${this.fileName}`);
      throw Error();
    }
  }

  /**
   * Set the hex encoded wasmHash for a given contractKey
   * @param contractKey - The name of the contract
   * @param wasmHash - Hex encoded wasmHash
   */
  setWasmHash(contractKey: string, wasmHash: string) {
    this.hashes.set(contractKey, wasmHash);
    console.warn(`set wasm hash ${contractKey}, ${wasmHash}`);
  }
}
```

## Comet.ts Functions

The functions in `comet.ts` are used to interact with the Comet contract. These functions return operation XDRs, which are then used to build transactions. Here’s how they work:

#### Utility Functions

**`estJoinPool`**
- This function estimates the amounts of BLND and USDC required to join the pool based on the desired amount of LP tokens to mint (`toMint`) and the maximum allowable slippage (`maxSlippage`).
- It calculates the ratio of new shares to existing shares and uses it to estimate the required BLND and USDC.

**`estLPTokenViaJoin`**
- This function estimates the amount of LP tokens that can be received for given amounts of BLND and USDC, considering the maximum slippage.
- It calculates the join amounts based on BLND and USDC independently and returns the minimum of the two to ensure both limits are satisfied.

**`estExitPool`**
- This function estimates the amounts of BLND and USDC that will be received upon exiting the pool by burning a specified amount of LP tokens (`toBurn`) with a maximum slippage.
- It calculates the ratio of burned shares to total shares and uses it to estimate the amounts of BLND and USDC to be withdrawn.

#### CometClient Class

**`CometClient`**
- This class provides methods to interact with the Comet liquidity pool contract.

**Constructor**
- Initializes the client with the contract address, creating an instance of the `Contract` class.

**`depositTokenInGetLPOut`**
- This method creates a single-sided deposit operation where a specified amount of a token is deposited into the pool to receive LP tokens.
- It takes arguments including the token address, deposit amount, minimum LP token amount, and user address, and returns an XDR operation.

**`join`**
- This method creates a join operation for adding liquidity to the pool.
- It takes arguments including the pool amount, BLND and USDC limits, and user address, and returns an XDR operation.

**`exit`**
- This method creates an exit operation for removing liquidity from the pool.
- It takes arguments including the pool amount, BLND and USDC limits, and user address, and returns an XDR operation.


```typescript
import { BackstopToken } from '@blend-capital/blend-sdk';
import { Contract, nativeToScVal, xdr } from '@stellar/stellar-sdk';

/**
 * Estimates the amount of BLND and USDC that will be deposited into the pool during a join operation.
 * @param pool_data - The current state of the pool.
 * @param toMint - The amount of LP tokens to mint.
 * @param maxSlippage - The maximum allowable slippage percentage.
 * @returns An object containing the estimated amounts of BLND and USDC to be deposited.
 */
export function estJoinPool(
  pool_data: BackstopToken,
  toMint: bigint,
  maxSlippage: number
): { blnd: number; usdc: number } {
  const ratio = Number(pool_data.shares + toMint) / Number(pool_data.shares) - 1;
  const blnd = (Number(pool_data.blnd) / 1e7) * ratio * (1 + maxSlippage);
  const usdc = (Number(pool_data.usdc) / 1e7) * ratio * (1 + maxSlippage);
  return { blnd, usdc };
}

/**
 * Estimates the amount of LP tokens that will be received during a join operation with specified amounts of BLND and USDC.
 * @param pool_data - The current state of the pool.
 * @param blnd - The amount of BLND to deposit.
 * @param usdc - The amount of USDC to deposit.
 * @param maxSlippage - The maximum allowable slippage percentage.
 * @returns The estimated amount of LP tokens to be received.
 */
export function estLPTokenViaJoin(
  pool_data: BackstopToken,
  blnd: bigint,
  usdc: bigint,
  maxSlippage: number
): number {
  const blndNetSlippage = (Number(blnd) / 1e7) * (1 - maxSlippage);
  const blndRatio = blndNetSlippage / (Number(pool_data.blnd) / 1e7);
  const blndJoinAmount = blndRatio * (Number(pool_data.shares) / 1e7);

  const usdcNetSlippage = (Number(usdc) / 1e7) * (1 - maxSlippage);
  const usdcRatio = usdcNetSlippage / (Number(pool_data.usdc) / 1e7);
  const usdcJoinAmount = usdcRatio * (Number(pool_data.shares) / 1e7);

  return Math.min(blndJoinAmount, usdcJoinAmount);
}

/**
 * Estimates the amount of BLND and USDC that will be withdrawn from the pool during an exit operation.
 * @param pool_data - The current state of the pool.
 * @param toBurn - The amount of LP tokens to burn.
 * @param maxSlippage - The maximum allowable slippage percentage.
 * @returns An object containing the estimated amounts of BLND and USDC to be withdrawn.
 */
export function estExitPool(
  pool_data: BackstopToken,
  toBurn: bigint,
  maxSlippage: number
): { blnd: number; usdc: number } {
  const ratio = 1 - Number(pool_data.shares - toBurn) / Number(pool_data.shares);
  const blnd = (Number(pool_data.blnd) / 1e7) * ratio * (1 - maxSlippage);
  const usdc = (Number(pool_data.usdc) / 1e7) * ratio * (1 - maxSlippage);
  return { blnd, usdc };
}

/**
 * Interface for the arguments required for a single-sided deposit operation in the Comet pool.
 */
export interface CometSingleSidedDepositArgs {
  depositTokenAddress: string;
  depositTokenAmount: bigint;
  minLPTokenAmount: bigint;
  user: string;
}

/**
 * Interface for the arguments required for a liquidity operation in the Comet pool.
 */
export interface CometLiquidityArgs {
  poolAmount: bigint;
  blndLimitAmount: bigint;
  usdcLimitAmount: bigint;
  user: string;
}

/**
 * Client class for interacting with the Comet liquidity pool contract.
 */
export class CometClient {
  comet: Contract;

  /**
   * Initializes the CometClient with the contract address.
   * @param address - The address of the Comet contract.
   */
  constructor(address: string) {
    this.comet = new Contract(address);
  }

  /**
   * Creates a single-sided deposit operation for the Comet pool.
   * @param args - Arguments for the deposit operation.
   * @returns An XDR operation.
   */
  public depositTokenInGetLPOut(args: CometSingleSidedDepositArgs): xdr.Operation {
    const invokeArgs = {
      method: 'dep_tokn_amt_in_get_lp_tokns_out',
      args: [
        nativeToScVal(args.depositTokenAddress, { type: 'address' }),
        nativeToScVal(args.depositTokenAmount, { type: 'i128' }),
        nativeToScVal(args.minLPTokenAmount, { type: 'i128' }),
        nativeToScVal(args.user, { type: 'address' }),
      ],
    };
    return this.comet.call(invokeArgs.method, ...invokeArgs.args);
  }

  /**
   * Creates a join operation for the Comet pool.
   * @param cometLiquidityArgs - Arguments for the join operation.
   * @returns An XDR operation.
   */
  public join(args: CometLiquidityArgs): xdr.Operation {
    const invokeArgs = {
      method: 'join_pool',
      args: [
        nativeToScVal(args.poolAmount, { type: 'i128' }),
        nativeToScVal([args.blndLimitAmount, args.usdcLimitAmount], { type: 'i128' }),
        nativeToScVal(args.user, { type: 'address' }),
      ],
    };
    return this.comet.call(invokeArgs.method, ...invokeArgs.args);
  }

  /**
   * Creates an exit operation for the Comet pool.
   * @param cometLiquidityArgs - Arguments for the exit operation.
   * @returns An XDR operation.
   */
  public exit(args: CometLiquidityArgs): xdr.Operation {
    const invokeArgs = {
      method: 'exit_pool',
      args: [
        nativeToScVal(args.poolAmount, { type: 'i128' }),
        nativeToScVal([args.blndLimitAmount, args.usdcLimitAmount], { type: 'i128' }),
        nativeToScVal(args.user, { type: 'address' }),
      ],
    };
    return this.comet.call(invokeArgs.method, ...invokeArgs.args);
  }
}
```

### Example: Building and Submitting a Transaction

To illustrate how these functions are used, let’s walk through the process of creating and submitting a transaction to join a liquidity pool.

1. **Create the Join Operation**:
   - The `join` method of the `CometClient` class is used to create a join operation.
   - This operation is represented as an XDR object.

   ```typescript
   const joinOp = comet.join({
     poolAmount: mintAmount,
     blndLimitAmount: scaleInputToBigInt(blnd.toString(), DECIMALS),
     usdcLimitAmount: scaleInputToBigInt(usdc.toString(), DECIMALS),
     user: config.admin.publicKey(),
   });
   ```

2. **Build the Transaction**:
   - The `TransactionBuilder` is used to create a transaction that includes the join operation.
   - The transaction is built with a specified fee, timebounds, and network passphrase.

   ```typescript
   const tx = new TransactionBuilder(txParams.account, txParams.txBuilderOptions)
     .addOperation(joinOp)
     .setTimeout(30)
     .build();
   ```

3. **Simulate the Transaction**:
   - Before submitting, the transaction is simulated to ensure it will succeed.
   - The simulation response is checked for errors.

   ```typescript
   const simulateResponse = await config.rpc.simulateTransaction(tx);

   if (SorobanRpc.Api.isSimulationError(simulateResponse)) {
     console.error('Simulation failed:', simulateResponse.error);
     return;
   }
   ```

4. **Assemble and Submit the Transaction**:
   - The user is prompted to confirm the transaction.
   - If confirmed, the transaction is signed and submitted to the network.
   - The transaction result is monitored until it is found on the network.

   ```typescript
   const assembledTx = SorobanRpc.assembleTransaction(tx, simulateResponse).build();
   const signedTxEnvelopeXDR = await txParams.signerFunction(assembledTx.toXDR());
   const signedTx = new Transaction(signedTxEnvelopeXDR, config.passphrase);

   const sendResponse = await config.rpc.sendTransaction(signedTx);

   if (sendResponse.status === 'ERROR') {
     console.error('Minting LP tokens failed:', sendResponse.errorResult);
     return;
   }

   let get_tx_response: SorobanRpc.Api.GetTransactionResponse = await config.rpc.getTransaction(
     sendResponse.hash
   );
   while (get_tx_response.status === 'NOT_FOUND') {
     await new Promise((resolve) => setTimeout(resolve, 6000));
     get_tx_response = await config.rpc.getTransaction(sendResponse.hash);
   }

   if (get_tx_response.status === 'SUCCESS') {
     console.log('Transaction successfully submitted with hash:', sendResponse.hash);
   } else {
     console.log('Transaction failed:', get_tx_response.status, sendResponse.hash);
     const error = parseError(get_tx_response);
     console.error(
       'Transaction failure detail:',
       error,
       'Failure Message:',
       ContractErrorType[error.type]
     );
     throw error; // Rethrow to ensure calling code can handle it
   }


   ```

## Inquirer.js Overview

### What is Inquirer.js?

Inquirer.js is a collection of common interactive command-line user interfaces. It helps you create interactive command-line applications that can prompt the user with questions and receive input.

### How Does Inquirer.js Work?

Inquirer.js provides several types of prompts, such as input, confirm, list, checkbox, etc. You can define a series of questions, each specifying the type of prompt and how the user's response should be handled.

### Setting Up Inquirer.js

To start using Inquirer.js, you first need to install it via npm:

```bash
npm install inquirer
```

Then, import it into your project:

```javascript
import inquirer from 'inquirer';
```

### Creating Prompts

Here are some common types of prompts you can use with Inquirer.js:

#### 1. List Prompt

The list prompt allows the user to select one option from a list of choices.

```javascript
const { network } = await inquirer.prompt([
  {
    type: 'list',
    name: 'network',
    message: 'Select the network:',
    choices: ['testnet', 'mainnet', 'futurenet'],
  },
]);
```

#### 2. Input Prompt

The input prompt asks the user to enter a string value.

```javascript
const { mintAmount } = await inquirer.prompt([
  {
    type: 'input',
    name: 'mintAmount',
    message: 'Enter the amount of LP tokens to mint:',
    validate: (input) => (!isNaN(input) && Number(input) > 0 ? true : 'Invalid amount'),
  },
]);
```

#### 3. Confirm Prompt

The confirm prompt asks the user to confirm a yes/no question.

```javascript
const { confirm } = await inquirer.prompt([
  {
    type: 'confirm',
    name: 'confirm',
    message: `Proceed with the transaction to mint LP tokens using ${estimatedBLND} BLND and ${estimatedUSDC}?`,
  },
]);
```

### Handling User Input

After defining the prompts, Inquirer.js returns a promise that resolves with an object containing the user's answers. You can then use these answers in your application logic.

### Example Usage

Below is a step-by-step explanation of how the LP_CLI.ts file uses Inquirer.js to interact with the user:

1. **Prompt the User for Network Selection**:
   - The user is presented with a list of networks to choose from (`testnet`, `mainnet`, `futurenet`).
   - The selected network is stored in the `network` variable.

2. **Load the Address Book**:
   - Based on the selected network, the address book is loaded, which contains the contract addresses.

3. **Prompt the User for Mint Amount and Slippage**:
   - The user is asked to enter the amount of LP tokens to mint.
   - The user is also asked to specify the maximum slippage percentage.

4. **Mint LP Tokens**:
   - The `mintLPTokens` function is called with the address book, mint amount, and slippage.
   - This function handles the logic of estimating the required BLND and USDC amounts, building the transaction, simulating it, and finally submitting it.

5. **Transaction Confirmation**:
   - Before submitting the transaction, the user is asked to confirm if they want to proceed.
   - If the user confirms, the transaction is signed and submitted.

## Running the CLI

### Install and Build the Project

Run the following commands to install dependencies and build the project:

```bash
yarn install
yarn run build
```

### Running the CLI

Execute the following command to run the CLI:

```bash
yarn run CLI
```

## Example Usage

An example interaction with the CLI:

1. **Select the Network**: Choose between testnet, mainnet, and futurenet.
2. **Enter the Mint Amount**: Specify the amount of LP tokens to mint.
3. **Enter the Maximum Slippage Percentage**: Provide the maximum allowable slippage percentage.
4. **Confirm the Transaction**: Review and confirm the transaction details before submission.


## Next Steps

### User Assignment: Accepting Custom Input for Tokens and Pool

In the current implementation, the CLI adds liquidity to a single predefined pool. To make the CLI more flexible, extend it to allow users to specify the token symbols, token addresses, and the pool contract address they wish to add liquidity to.

### Steps to Implement:

1. **Extend User Prompts**:
   - Add prompts in the `main` function to gather the following information from the user:
     - First token symbol and address
     - Second token symbol and address
     - Liquidity pool contract address

    ```typescript
    const { firstTokenSymbol, firstTokenAddress, secondTokenSymbol, secondTokenAddress, poolAddress } = await inquirer.prompt([
      { type: 'input', name: 'firstTokenSymbol', message: 'Enter the first token symbol:' },
      { type: 'input', name: 'firstTokenAddress', message: 'Enter the first token contract address:' },
      { type: 'input', name: 'secondTokenSymbol', message: 'Enter the second token symbol:' },
      { type: 'input', name: 'secondTokenAddress', message: 'Enter the second token contract address:' },
      { type: 'input', name: 'poolAddress', message: 'Enter the liquidity pool contract address:' },
    ]);
    ```

2. **Modify the `mintLPTokens` Function**:
   - Update the function to use the user inputs for the pool address, first token address, and second token address.

    ```typescript
    const poolData = await loadBackstopToken(poolAddress, firstTokenAddress, secondTokenAddress);
    ```

### Assignment

1. Update the CLI to prompt the user for:
   - First token symbol and address
   - Second token symbol and address
   - Liquidity pool contract address

2. Modify the relevant parts of the script to use these inputs instead of predefined values.

3. Add additional functions to the CLI such as more liquidity pools, swaps, and more.  Feel free to make contributions to this guide and [example repository](https://www.github.com/silence48/Comet-TUI) through github!

## Conclusion

This guide provided a comprehensive walkthrough for building a functional user interface for dapps using a Terminal User Interface (TUI). The example focused on adding liquidity to a liquidity pool contract using the 'comet' contract. By following this guide, you should be able to create similar TUIs for other dapp functionalities.

## Appendix

- [Blend SDK Documentation](https://github.com/blend-capital/blend-utils/)
- [Stellar SDK Documentation](https://www.stellar.org/developers/reference/)
- [Inquirer.js Documentation](https://github.com/SBoudrias/Inquirer.js/)
- [This Guide as a ready to run repository](https://www.github.com/silence48/Comet-TUI)
- [The smart contract this code interacts with](https://github.com/CometDEX/comet-contracts-v1/tree/main/contracts/src/c_pool)
---

This concludes the guide. If you have any questions or need further assistance, feel free to ask!