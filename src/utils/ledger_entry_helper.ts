import { xdr } from '@stellar/stellar-sdk';

export function decodeEntryKey(entryKey: xdr.ScVal): string {
  let key: string | undefined;
  switch (entryKey.switch()) {
    // Key is a ScVec[ScvSym, ScVal]
    case xdr.ScValType.scvVec(): {
      const symbol = entryKey.vec()?.at(0)?.sym();
      if (!symbol) {
        throw new Error('Expected a symbol in the vector but got none.');
      }
      key = symbol.toString();
      break;
    }
    case xdr.ScValType.scvSymbol():
      key = entryKey.sym().toString();
      break;
    case xdr.ScValType.scvLedgerKeyContractInstance():
      key = 'ContractInstance';
      break;
    default:
      throw Error(`Invalid ledger entry key type: should not contain type ${entryKey.switch()}`);
  }
  return key;
}
