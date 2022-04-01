import { NFTStorage, File } from 'nft.storage';

type Manifest = {
  title: string;
  symbol: string;
  nfts: NftDescriptor[];
};

type NftDescriptor = {
  title?: string;
  description?: string;
  publicImage: string;
  privateData: string;
  attributes: any[];
};

export class Bundle {
  private constructor(
    public readonly manifest: Manifest,
    private readonly files: Map<string, File>,
  ) {}

  public static async create(filesList: FileList): Promise<Bundle> {
    const files = new Map<string, File>();
    for (let i = 0; i < filesList.length; ++i) {
      const f = filesList[i];
      files.set(f.name, f);
    }

    let manifestFile = files.get('manifest.json');
    if (manifestFile === undefined) {
      throw new ValidationErrors(['Missing manifest.json']);
    }
    let manifest: Manifest;
    try {
      const manifestData = await manifestFile.text();
      manifest = JSON.parse(manifestData);
    } catch (e) {
      throw new ValidationErrors([`Failed to load manifest.json: ${e}`]);
    }

    return new Bundle(manifest, files);
  }

  public async validate(): Promise<void> {
    let invalid = [];
    let missing = [];
    let seen = new Set<string>();
    let dupes = [];
    const checkMissingOrDuped = (fileName: string) => {
      if (!this.files.has(fileName)) missing.push(fileName);
      if (seen.has(fileName)) dupes.push(fileName);
      seen.add(fileName);
    };
    this.manifest.nfts.forEach((descriptor, i) => {
      if (descriptor.publicImage === undefined || descriptor.privateData === undefined) {
        invalid.push(i);
        return;
      }
      checkMissingOrDuped(descriptor.publicImage);
      checkMissingOrDuped(descriptor.privateData);
    });
    throw new ValidationErrors([
      ...invalid.map((f) => `Invalid descriptor(s) at position(s): ${f}.`),
      ...missing.map((f) => `Missing: ${f}.`),
      ...dupes.map((f) => `Duplicated: ${f}.`),
    ]);
  }

  public async mint(): Promise<void> {
    // 1. create nft contract
    // 2. upload public images
    // 3. create parcel tokens
    // 4. upload nft attributes
    // 5. upload private data, add to tokens
  }
}

export class ValidationErrors {
  constructor(public readonly validationErrors: string[]) {}

  public appending(errorOrErrors: string | string[]): ValidationErrors {
    return new ValidationErrors([
      ...this.validationErrors,
      ...(Array.isArray(errorOrErrors) ? errorOrErrors : [errorOrErrors]),
    ]);
  }
}
