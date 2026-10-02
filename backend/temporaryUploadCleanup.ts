import { promises as fsPromises } from "node:fs";
import path from "node:path";

interface TemporaryUpload {
  path?: string;
}

export async function withTemporaryUploadCleanup<T>(
  files: TemporaryUpload[],
  uploadDirectory: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } finally {
    const root = path.resolve(uploadDirectory);
    await Promise.all(files.map(async (file) => {
      if (!file?.path) return;

      const filePath = path.resolve(file.path);
      if (path.dirname(filePath) !== root) return;

      try {
        await fsPromises.unlink(filePath);
      } catch (error: any) {
        if (error?.code !== "ENOENT") {
          console.error("Failed to remove a temporary absence justification file:", error?.code || "UNKNOWN");
        }
      }
    }));
  }
}