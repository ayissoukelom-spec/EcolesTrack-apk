package com.ecoletrack.webview;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

final class DocumentSelectionPolicy {
    static final String EXCEL_XLS_MIME = "application/vnd.ms-excel";
    static final String EXCEL_XLSX_MIME =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private DocumentSelectionPolicy() {}

    static String[] normalizeAcceptedMimeTypes(String[] acceptTypes) {
        Set<String> acceptedMimeTypes = new LinkedHashSet<>();
        if (acceptTypes != null) {
            for (String acceptType : acceptTypes) {
                if (acceptType == null || acceptType.trim().isEmpty()) {
                    continue;
                }

                for (String candidate : acceptType.split(",")) {
                    String normalized = candidate.trim().toLowerCase(Locale.US);
                    if (normalized.equals("application/pdf") || normalized.equals(".pdf")) {
                        acceptedMimeTypes.add("application/pdf");
                    } else if (normalized.equals("image/png") || normalized.equals(".png")) {
                        acceptedMimeTypes.add("image/png");
                    } else if (normalized.equals("image/jpeg")
                            || normalized.equals("image/jpg")
                            || normalized.equals(".jpeg")
                            || normalized.equals(".jpg")) {
                        acceptedMimeTypes.add("image/jpeg");
                    } else if (normalized.equals("image/*")) {
                        acceptedMimeTypes.add("image/png");
                        acceptedMimeTypes.add("image/jpeg");
                    } else if (normalized.equals(EXCEL_XLS_MIME) || normalized.equals(".xls")) {
                        acceptedMimeTypes.add(EXCEL_XLS_MIME);
                    } else if (normalized.equals(EXCEL_XLSX_MIME) || normalized.equals(".xlsx")) {
                        acceptedMimeTypes.add(EXCEL_XLSX_MIME);
                    }
                }
            }
        }

        if (acceptedMimeTypes.isEmpty()) {
            acceptedMimeTypes.add("application/pdf");
            acceptedMimeTypes.add("image/png");
            acceptedMimeTypes.add("image/jpeg");
            acceptedMimeTypes.add(EXCEL_XLS_MIME);
            acceptedMimeTypes.add(EXCEL_XLSX_MIME);
        }

        return acceptedMimeTypes.toArray(new String[0]);
    }

    static boolean isAllowed(String rawUri, String mimeType, String displayName, boolean hasReadPermission) {
        if (!hasReadPermission || !isContentUri(rawUri)) {
            return false;
        }

        String normalizedMimeType = normalizeMimeType(mimeType);
        String extensionMimeType = mimeTypeForFileName(displayName);
        if (normalizedMimeType.isEmpty()
                || normalizedMimeType.equals("application/octet-stream")
                || normalizedMimeType.equals("binary/octet-stream")) {
            return !extensionMimeType.isEmpty();
        }
        if (!isSupportedMimeType(normalizedMimeType)) {
            return false;
        }
        if (isExcelMimeType(normalizedMimeType) && isExcelMimeType(extensionMimeType)) {
            return true;
        }
        return extensionMimeType.isEmpty() || normalizedMimeType.equals(extensionMimeType);
    }

    private static boolean isExcelMimeType(String mimeType) {
        return EXCEL_XLS_MIME.equals(mimeType) || EXCEL_XLSX_MIME.equals(mimeType);
    }

    private static boolean isContentUri(String rawUri) {
        if (rawUri == null) {
            return false;
        }

        try {
            URI uri = new URI(rawUri);
            return "content".equalsIgnoreCase(uri.getScheme())
                    && uri.getRawAuthority() != null
                    && !uri.getRawAuthority().isEmpty()
                    && uri.getUserInfo() == null;
        } catch (URISyntaxException exception) {
            return false;
        }
    }

    private static String normalizeMimeType(String mimeType) {
        if (mimeType == null) {
            return "";
        }
        int parameterStart = mimeType.indexOf(';');
        String normalized = parameterStart >= 0 ? mimeType.substring(0, parameterStart) : mimeType;
        return normalized.trim().toLowerCase(Locale.US);
    }

    private static boolean isSupportedMimeType(String mimeType) {
        return "application/pdf".equals(mimeType)
                || "image/png".equals(mimeType)
                || "image/jpeg".equals(mimeType)
                || EXCEL_XLS_MIME.equals(mimeType)
                || EXCEL_XLSX_MIME.equals(mimeType);
    }

    private static String mimeTypeForFileName(String fileName) {
        if (fileName == null) {
            return "";
        }

        String lower = fileName.trim().toLowerCase(Locale.US);
        if (lower.endsWith(".pdf")) {
            return "application/pdf";
        }
        if (lower.endsWith(".png")) {
            return "image/png";
        }
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (lower.endsWith(".xls")) {
            return EXCEL_XLS_MIME;
        }
        if (lower.endsWith(".xlsx")) {
            return EXCEL_XLSX_MIME;
        }
        return "";
    }
}
