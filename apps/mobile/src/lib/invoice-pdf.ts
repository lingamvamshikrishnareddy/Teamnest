import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { invoiceHtml, type InvoiceDoc } from '@teamnest/ui';

export type { InvoiceDoc };

/** Renders the document to PDF and opens the share sheet (WhatsApp, email…). */
export async function shareInvoicePdf(doc: InvoiceDoc) {
  const { uri } = await Print.printToFileAsync({ html: invoiceHtml(doc) });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${doc.number}.pdf`, UTI: 'com.adobe.pdf' });
  } else {
    await Print.printAsync({ uri });
  }
}
