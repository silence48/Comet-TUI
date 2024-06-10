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
