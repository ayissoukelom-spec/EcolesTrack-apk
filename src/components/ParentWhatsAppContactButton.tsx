import { MessageCircle } from "lucide-react";

export const isValidWhatsAppUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "wa.me"
      && /^\/[1-9]\d{1,14}$/.test(url.pathname);
  } catch {
    return false;
  }
};

interface ParentWhatsAppContactButtonProps {
  whatsappUrl: string | null;
}

export default function ParentWhatsAppContactButton({ whatsappUrl }: ParentWhatsAppContactButtonProps) {
  if (!isValidWhatsAppUrl(whatsappUrl)) return null;

  return (
    <a
      href={whatsappUrl}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2"
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      Contacter l’administration sur WhatsApp
    </a>
  );
}
