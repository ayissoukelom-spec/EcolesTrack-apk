package com.ecoletrack.webview;

final class JavaScriptStringEscaper {
    private JavaScriptStringEscaper() {}

    static String quote(String value) {
        StringBuilder escaped = new StringBuilder(value.length() + 2);
        escaped.append('\'');
        for (int i = 0; i < value.length(); i++) {
            char character = value.charAt(i);
            switch (character) {
                case '\\':
                    escaped.append("\\\\");
                    break;
                case '\'':
                    escaped.append("\\'");
                    break;
                case '\n':
                    escaped.append("\\n");
                    break;
                case '\r':
                    escaped.append("\\r");
                    break;
                case '\t':
                    escaped.append("\\t");
                    break;
                case '\b':
                    escaped.append("\\b");
                    break;
                case '\f':
                    escaped.append("\\f");
                    break;
                case '\u2028':
                    escaped.append("\\u2028");
                    break;
                case '\u2029':
                    escaped.append("\\u2029");
                    break;
                default:
                    if (character < 0x20) {
                        escaped.append(String.format("\\u%04x", (int) character));
                    } else {
                        escaped.append(character);
                    }
            }
        }
        escaped.append('\'');
        return escaped.toString();
    }
}
