package com.ecoletrack.webview;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import org.junit.Test;

public class TemporaryFilePolicyTest {
    @Test
    public void deletesOnlyExpiredFilesFromTheProvidedAppCacheDirectory() throws IOException {
        File cacheDirectory = Files.createTempDirectory("ecoletrack-cache-test").toFile();
        try {
            File expiredPhoto = new File(cacheDirectory, "camera_20200101_000000_a.jpg");
            File recentPhoto = new File(cacheDirectory, "camera_recent.jpg");
            File childDirectory = new File(cacheDirectory, "nested");
            assertTrue(expiredPhoto.createNewFile());
            assertTrue(recentPhoto.createNewFile());
            assertTrue(childDirectory.mkdir());
            assertTrue(expiredPhoto.setLastModified(1_000L));
            assertTrue(recentPhoto.setLastModified(9_500L));

            int deleted = TemporaryFilePolicy.deleteExpiredFiles(cacheDirectory, 10_000L, 5_000L);

            assertEquals(1, deleted);
            assertFalse(expiredPhoto.exists());
            assertTrue(recentPhoto.exists());
            assertTrue(childDirectory.exists());
        } finally {
            deleteTestDirectory(cacheDirectory);
        }
    }

    @Test
    public void leavesFilesThatAreNotOlderThanRetention() throws IOException {
        File cacheDirectory = Files.createTempDirectory("ecoletrack-cache-test").toFile();
        try {
            File recentFile = new File(cacheDirectory, "recent.jpg");
            assertTrue(recentFile.createNewFile());
            assertTrue(recentFile.setLastModified(5_000L));

            int deleted = TemporaryFilePolicy.deleteExpiredFiles(cacheDirectory, 10_000L, 5_000L);

            assertEquals(0, deleted);
            assertTrue(recentFile.exists());
        } finally {
            deleteTestDirectory(cacheDirectory);
        }
    }

    @Test
    public void reportsInvalidTemporaryDirectory() throws IOException {
        File regularFile = File.createTempFile("ecoletrack-cache-test", ".tmp");

        try {
            TemporaryFilePolicy.deleteExpiredFiles(regularFile, 10_000L, 5_000L);
        } catch (IOException expected) {
            assertTrue(expected.getMessage().contains("not a directory"));
            return;
        } finally {
            assertTrue(regularFile.delete());
        }

        throw new AssertionError("Expected an IOException for a non-directory path");
    }

    private void deleteTestDirectory(File directory) throws IOException {
        File[] files = directory.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isDirectory()) {
                    deleteTestDirectory(file);
                } else {
                    Files.deleteIfExists(file.toPath());
                }
            }
        }
        Files.deleteIfExists(directory.toPath());
    }
}
