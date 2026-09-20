import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";

interface DirectoryHandle {
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface DirectorySyncOptions {
  platform?: NodeJS.Platform;
  openDirectory?: (directory: string) => Promise<DirectoryHandle>;
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === code;
}

export async function fsyncDirectory(
  directory: string,
  options: DirectorySyncOptions = {},
): Promise<void> {
  const handle = await (options.openDirectory ?? ((path) => open(path, "r")))(directory);
  try {
    try {
      await handle.sync();
    } catch (error) {
      if ((options.platform ?? process.platform) !== "win32" || !isErrno(error, "EPERM")) {
        throw error;
      }
    }
  } finally {
    await handle.close();
  }
}

export async function writeJsonAtomically(
  path: string,
  value: unknown,
  beforeRename?: (temporaryPath: string, targetPath: string) => Promise<void>,
  directorySyncOptions?: DirectorySyncOptions,
): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await beforeRename?.(temporary, path);
    await rename(temporary, path);
    await fsyncDirectory(directory, directorySyncOptions);
  } catch (error) {
    await unlink(temporary).catch((unlinkError: unknown) => {
      if (!isErrno(unlinkError, "ENOENT")) throw unlinkError;
    });
    throw error;
  }
}

export async function quarantineFile(
  path: string,
  planId: string,
  now: number,
): Promise<string> {
  const directory = dirname(path);
  const quarantineDirectory = join(directory, "corrupt");
  await mkdir(quarantineDirectory, { recursive: true });
  const quarantinePath = join(
    quarantineDirectory,
    `${planId}.${now}.${randomUUID()}.json`,
  );
  await rename(path, quarantinePath);
  await Promise.all([
    fsyncDirectory(directory),
    fsyncDirectory(quarantineDirectory),
  ]);
  return quarantinePath;
}
