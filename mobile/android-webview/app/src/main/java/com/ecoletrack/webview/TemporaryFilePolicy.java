package com.ecoletrack.webview;

import java.io.File;
import java.io.IOException;

final class TemporaryFilePolicy {
    private TemporaryFilePolicy() {}

    static int deleteExpiredFiles(File directory, long nowMillis, long retentionMillis) throws IOException {
        if (!directory.exists()) {
            return 0;
        }
        if (!directory.isDirectory()) {
            throw new IOException("Temporary file path is not a directory");
        }

        File[] files = directory.listFiles();
        if (files == null) {
            throw new IOException("Unable to list temporary files");
        }

        int deletedCount = 0;
        for (File file : files) {
            if (file.isFile()
                    && nowMillis - file.lastModified() > retentionMillis) {
                if (!file.delete()) {
                    throw new IOException("Unable to delete an expired temporary file");
                }
                deletedCount++;
            }
        }
        return deletedCount;
    }
}
