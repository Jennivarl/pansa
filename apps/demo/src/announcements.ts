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

  constructor(
    private readonly client: PublicClient,
    private readonly announcer: Hex,
    fromBlock: bigint,
    private readonly file: string,
  ) {
    this.nextBlock = fromBlock;
  }

  async start(intervalMs = 4_000) {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8')) as Saved;
      if (BigInt(saved.nextBlock) > this.nextBlock) {
        this.nextBlock = BigInt(saved.nextBlock);
        this.announcements = saved.announcements;
      }
    } catch {
      // first run
    }
    const tick = async () => {
      try {
        await this.sync();
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

  /** Catches up to the chain head in RPC-sized chunks. */
  async sync() {
    this.head = await this.client.getBlockNumber();
    let changed = false;
    while (this.nextBlock <= this.head) {
      const toBlock = this.nextBlock + ARC_MAX_LOG_RANGE - 1n < this.head ? this.nextBlock + ARC_MAX_LOG_RANGE - 1n : this.head;
      const logs = await this.client.getContractEvents({
        address: this.announcer,
        abi: ANNOUNCER_ABI,
        eventName: 'Announcement',
        fromBlock: this.nextBlock,
        toBlock,
      });
      for (const log of logs) {
        this.announcements.push({
          schemeId: log.args.schemeId!.toString(),
          stealthAddress: log.args.stealthAddress!,
          caller: log.args.caller!,
          ephemeralPublicKey: log.args.ephemeralPubKey!,
          metadata: log.args.metadata!,
          blockNumber: log.blockNumber.toString(),
          transactionHash: log.transactionHash,
        });
      }
      changed ||= logs.length > 0;
      this.nextBlock = toBlock + 1n;
    }
    if (changed) await this.save();
  }

  list() {
    return { head: this.head.toString(), announcements: this.announcements };
  }

  private async save() {
    const saved: Saved = { nextBlock: this.nextBlock.toString(), announcements: this.announcements };
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(saved));
    await rename(`${this.file}.tmp`, this.file);
  }
}
