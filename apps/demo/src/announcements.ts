/**
 * Indexes ERC-5564 announcements from the PANSA announcer. They're public on-chain data;
 * browsers download all of them and match locally, so this server never learns whose
 * payments are whose.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Hex, PublicClient } from 'viem';
import { ARC_MAX_LOG_RANGE } from '@pansa/core';
import { ANNOUNCER_ABI } from '@pansa/x402';

const SYNC_CONCURRENCY = 8;

export interface IndexedAnnouncement {
  schemeId: string;
  stealthAddress: Hex;
  caller: Hex;
  ephemeralPublicKey: Hex;
  metadata: Hex;
  blockNumber: string;
  transactionHash: Hex;
}

interface Saved {
  nextBlock: string;
  announcements: IndexedAnnouncement[];
}

export class AnnouncementIndex {
  private nextBlock: bigint;
  private announcements: IndexedAnnouncement[] = [];
  private head = 0n;
  private timer?: NodeJS.Timeout;
  private loaded = false;
  private syncedAt = 0;
  private syncing?: Promise<void>;

  constructor(
    private readonly client: PublicClient,
    private readonly announcer: Hex,
    fromBlock: bigint,
    private readonly file: string,
  ) {
    this.nextBlock = fromBlock;
  }

  /** Long-running servers: poll in the background. */
  async start(intervalMs = 4_000) {
    await this.load();
    const tick = async () => {
      try {
        await this.ensureFresh(0);
      } catch (err) {
        console.error('announcement sync:', (err as Error).message);
      }
      this.timer = setTimeout(tick, intervalMs);
    };
    await tick();
  }

  stop() {
    clearTimeout(this.timer);
  }

  /** Syncs if the last sync is older than `maxAgeMs`; concurrent callers share one sync. */
  async ensureFresh(maxAgeMs = 3_000) {
    if (!this.loaded) await this.load();
    if (Date.now() - this.syncedAt < maxAgeMs) return;
    this.syncing ??= this.sync().finally(() => {
      this.syncing = undefined;
    });
    await this.syncing;
  }

  /** Forces a sync that starts after now (e.g. right after we announced something). */
  async refresh() {
    await this.syncing;
    await this.ensureFresh(0);
  }

  /** Catches up to the chain head in RPC-sized chunks, a few at a time. Not reentrant: use ensureFresh. */
  async sync() {
    this.head = await this.client.getBlockNumber();
    const ranges: [bigint, bigint][] = [];
    for (let from = this.nextBlock; from <= this.head; from += ARC_MAX_LOG_RANGE) {
      const to = from + ARC_MAX_LOG_RANGE - 1n;
      ranges.push([from, to < this.head ? to : this.head]);
    }
    let found = 0;
    for (let i = 0; i < ranges.length; i += SYNC_CONCURRENCY) {
      const batch = await Promise.all(
        ranges.slice(i, i + SYNC_CONCURRENCY).map(([fromBlock, toBlock]) =>
          this.client.getContractEvents({
            address: this.announcer,
            abi: ANNOUNCER_ABI,
            eventName: 'Announcement',
            fromBlock,
            toBlock,
          }),
        ),
      );
      for (const log of batch.flat()) {
        this.announcements.push({
          schemeId: log.args.schemeId!.toString(),
          stealthAddress: log.args.stealthAddress!,
          caller: log.args.caller!,
          ephemeralPublicKey: log.args.ephemeralPubKey!,
          metadata: log.args.metadata!,
          blockNumber: log.blockNumber.toString(),
          transactionHash: log.transactionHash,
        });
        found++;
      }
      this.nextBlock = ranges[Math.min(i + SYNC_CONCURRENCY, ranges.length) - 1][1] + 1n;
    }
    this.syncedAt = Date.now();
    if (found > 0) await this.save().catch(() => {});
  }

  list() {
    return { head: this.head.toString(), announcements: this.announcements };
  }

  private async load() {
    this.loaded = true;
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8')) as Saved;
      if (BigInt(saved.nextBlock) > this.nextBlock) {
        this.nextBlock = BigInt(saved.nextBlock);
        this.announcements = saved.announcements;
      }
    } catch {
      // first run, or a read-only/ephemeral disk
    }
  }

  private async save() {
    const saved: Saved = { nextBlock: this.nextBlock.toString(), announcements: this.announcements };
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(saved));
    await rename(`${this.file}.tmp`, this.file);
  }
}
