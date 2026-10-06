package com.ecoletrack.webview;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class JavaScriptStringEscaperTest {
    @Test
    public void quotesAndEscapesUntrustedNotificationValues() {
        assertEquals(
                "'line\\n\\'quoted\\'\\\\value\\u2028end'",
                JavaScriptStringEscaper.quote("line\n'quoted'\\value\u2028end")
        );
    }
}
