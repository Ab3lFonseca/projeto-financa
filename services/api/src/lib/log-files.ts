import { createWriteStream, mkdirSync, readdirSync, unlinkSync, type WriteStream } from "node:fs";
import { join } from "node:path";

const DAY_MS = 86_400_000;

/** "2026-10-04" no fuso do servidor. */
function localDay(date: Date): string {
  return date.toLocaleDateString("sv-SE");
}

/**
 * Arquivo de log com troca diária (`<prefixo>-AAAA-MM-DD.log`) e limpeza dos antigos.
 * Nunca derruba a API: se o disco falhar, avisa uma vez no stderr e para de gravar.
 */
export class DailyLogFile {
  private stream: WriteStream | null = null;
  private day = "";
  private broken = false;

  constructor(
    private readonly dir: string,
    private readonly prefix: string,
    private readonly retentionDays: number,
    private readonly clock: () => Date = () => new Date(),
  ) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      this.fail(err);
    }
    this.prune();
  }

  write(line: string): void {
    if (this.broken) return;
    const day = localDay(this.clock());
    if (day !== this.day) this.rotate(day);
    this.stream?.write(line);
  }

  /** Remove arquivos mais antigos que a retenção (pelo nome, que carrega a data). */
  prune(): number {
    if (this.broken) return 0;
    let removed = 0;
    try {
      const limit = localDay(new Date(this.clock().getTime() - this.retentionDays * DAY_MS));
      const re = new RegExp(`^${this.prefix}-(\\d{4}-\\d{2}-\\d{2})\\.log$`);
      for (const name of readdirSync(this.dir)) {
        const m = re.exec(name);
        if (m && m[1]! < limit) {
          unlinkSync(join(this.dir, name));
          removed++;
        }
      }
    } catch (err) {
      this.fail(err);
    }
    return removed;
  }

  close(): Promise<void> {
    const s = this.stream;
    this.stream = null;
    if (!s) return Promise.resolve();
    return new Promise((resolve) => s.end(resolve));
  }

  private rotate(day: string): void {
    this.stream?.end();
    this.day = day;
    try {
      this.stream = createWriteStream(join(this.dir, `${this.prefix}-${day}.log`), { flags: "a" });
      this.stream.on("error", (err) => this.fail(err));
    } catch (err) {
      this.fail(err);
    }
    this.prune();
  }

  private fail(err: unknown): void {
    if (this.broken) return;
    this.broken = true;
    console.error(`[log] não foi possível gravar em ${this.dir}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export type LogSinks = {
  /** Recebe cada linha de log (JSON do pino) e a distribui. */
  stream: { write(line: string): void };
  close(): Promise<void>;
};

/**
 * Distribui o log para: console (legível em desenvolvimento), `api-<dia>.log` (tudo) e
 * `errors-<dia>.log` (somente warn/error/fatal — o primeiro arquivo a abrir quando algo der errado).
 */
export function createLogSinks(opts: {
  dir?: string;
  retentionDays: number;
  console: { write(line: string): void };
  clock?: () => Date;
}): LogSinks {
  const all = opts.dir ? new DailyLogFile(opts.dir, "api", opts.retentionDays, opts.clock) : null;
  const errors = opts.dir ? new DailyLogFile(opts.dir, "errors", opts.retentionDays, opts.clock) : null;
  return {
    stream: {
      write(line: string) {
        opts.console.write(line);
        all?.write(line);
        if (errors) {
          // Nível do pino: 40 = warn, 50 = error, 60 = fatal. Leitura barata, sem parsear o JSON todo.
          const m = /"level":(\d+)/.exec(line);
          if (m && Number(m[1]) >= 40) errors.write(line);
        }
      },
    },
    async close() {
      await Promise.all([all?.close(), errors?.close()]);
    },
  };
}
