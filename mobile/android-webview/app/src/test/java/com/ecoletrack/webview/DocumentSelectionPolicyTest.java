package com.ecoletrack.webview;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class DocumentSelectionPolicyTest {
    @Test
    public void acceptsXlsxAndXlsMimeTypesAndExtensions() {
        assertTrue(DocumentSelectionPolicy.isAllowed(
                "content://documents/tree/primary%3ADownload/document/42",
                DocumentSelectionPolicy.EXCEL_XLSX_MIME,
                "students.xlsx",
                true
        ));
        assertTrue(DocumentSelectionPolicy.isAllowed(
                "content://com.android.providers.downloads.documents/document/42",
                DocumentSelectionPolicy.EXCEL_XLS_MIME,
                "students.xls",
                true
        ));
        assertTrue(DocumentSelectionPolicy.isAllowed(
                "content://com.example.cloud/document/42",
                "application/octet-stream",
                "students.XLSX",
                true
        ));
        assertTrue(DocumentSelectionPolicy.isAllowed(
                "content://com.example.cloud/document/42",
                DocumentSelectionPolicy.EXCEL_XLS_MIME,
                "students.xlsx",
                true
        ));
    }

    @Test
    public void requestsExcelMimeTypesForWebViewAcceptTypes() {
        assertArrayEquals(
                new String[]{
                        DocumentSelectionPolicy.EXCEL_XLSX_MIME,
                        DocumentSelectionPolicy.EXCEL_XLS_MIME
                },
                DocumentSelectionPolicy.normalizeAcceptedMimeTypes(new String[]{
                        ".xlsx,.xls",
                        DocumentSelectionPolicy.EXCEL_XLSX_MIME
                })
        );
    }

    @Test
    public void rejectsNonContentUrisAndMissingReadPermission() {
        assertFalse(DocumentSelectionPolicy.isAllowed(
                "file:///sdcard/Download/students.xlsx",
                DocumentSelectionPolicy.EXCEL_XLSX_MIME,
                "students.xlsx",
                true
        ));
        assertFalse(DocumentSelectionPolicy.isAllowed(
                "https://example.test/students.xlsx",
                DocumentSelectionPolicy.EXCEL_XLSX_MIME,
                "students.xlsx",
                true
        ));
        assertFalse(DocumentSelectionPolicy.isAllowed(
                "content://documents/document/42",
                DocumentSelectionPolicy.EXCEL_XLSX_MIME,
                "students.xlsx",
                false
        ));
    }

    @Test
    public void rejectsUnsupportedAndMismatchedFileTypes() {
        assertFalse(DocumentSelectionPolicy.isAllowed(
                "content://documents/document/42",
                "application/zip",
                "students.zip",
                true
        ));
        assertFalse(DocumentSelectionPolicy.isAllowed(
                "content://documents/document/42",
                DocumentSelectionPolicy.EXCEL_XLSX_MIME,
                "students.pdf",
                true
        ));
        assertFalse(DocumentSelectionPolicy.isAllowed(
                "content://documents/document/42",
                null,
                "students.ods",
                true
        ));
    }
}
