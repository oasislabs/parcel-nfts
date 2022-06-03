import type { Signer } from '@ethersproject/abstract-signer';
import type { Config as ParcelConfig } from '@oasislabs/parcel';
import { Parcel } from '@oasislabs/parcel';

export { Bundle, ValidationErrors } from './create.js';
export { downloadTokenizedData } from './download.js';

/** Creates a new Parcel instance provided an `ethers.Signer` or else the MetaMask account index. */
export async function makeParcel(signer: Signer, config?: ParcelConfig): Promise<Parcel> {
  return new Parcel(
    {
      principal: await signer.getAddress(),
      signMessage: signer.signMessage.bind(signer),
      scopes: ['parcel.full'],
    },
    config,
  );
}
