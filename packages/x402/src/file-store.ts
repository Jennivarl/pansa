import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MemoryPaymentStore, type PaymentStore, type ReceivedPayment } from './store.js';

/**
 * Append-only JSON file. Ephemeral keys are not secret on their own, but together with
 * the viewing key they reveal every payment, so keep this file private.
 */
export class JsonFilePaymentStore implements PaymentStore {
  private readonly memory = new MemoryPaymentStore();
  private loaded?: Promise<void>;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async claim(id: string) {
    await this.load();
    return this.memory.claim(id);
  }

  async release(id: string) {
    await this.memory.release(id);
  }

  async add(payment: ReceivedPayment) {
    await this.load();
    await this.memory.add(payment);
    const snapshot = await this.memory.list();
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, JSON.stringify(snapshot, null, 2));
      await rename(tmp, this.path);
    });
    await this.writing;
  }

  async list() {
    await this.load();
    return this.memory.list();
  }

  private load() {
    this.loaded ??= (async () => {
      let saved: ReceivedPayment[] = [];
      try {
        saved = JSON.parse(await readFile(this.path, 'utf8')) as ReceivedPayment[];
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
      for (const p of saved) {
        await this.memory.claim(p.authorizationId);
        await this.memory.add(p);
      }
    })();
    return this.loaded;
  }
}
