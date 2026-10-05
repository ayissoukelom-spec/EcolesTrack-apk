import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import ParentWhatsAppContactButton from "./ParentWhatsAppContactButton.js";

test("renders the exact server-provided WhatsApp URL", () => {
  const url = "https://wa.me/22890000000?text=Bonjour";
  const markup = renderToStaticMarkup(createElement(ParentWhatsAppContactButton, { whatsappUrl: url }));

  assert.match(markup, /Contacter l’administration sur WhatsApp/);
  assert.match(markup, /href="https:\/\/wa\.me\/22890000000\?text=Bonjour"/);
});

test("hides the button for missing or invalid WhatsApp URLs", () => {
  for (const whatsappUrl of [null, "https://example.com/22890000000", "https://wa.me/not-a-number"]) {
    const markup = renderToStaticMarkup(createElement(ParentWhatsAppContactButton, { whatsappUrl }));
    assert.equal(markup, "");
  }
});
