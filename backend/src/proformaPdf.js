import PDFDocument from "pdfkit";

/**
 * Stream a minimal proforma PDF (branding + invoice lines) for print / archive.
 */
export function streamInvoiceProformaPdf(res, { invoice, brand, ispName }) {
  const company = String(brand?.display_name || brand?.displayName || ispName || "—").trim();
  const addr = String(brand?.address || "").trim();
  const email = String(brand?.contact_email || brand?.contactEmail || "").trim();
  const phone = String(brand?.contact_phone || brand?.contactPhone || "").trim();
  const footerNote = String(brand?.invoice_footer || brand?.invoiceFooter || "").trim();

  const doc = new PDFDocument({ size: "A4", margin: 48 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="proforma-${String(invoice.id).slice(0, 8)}.pdf"`
  );
  doc.pipe(res);

  doc.fontSize(9).fillColor("#444444").text(new Date().toLocaleDateString("fr-FR"), { align: "right" });
  doc.moveDown(0.5);

  doc.fontSize(16).fillColor("#2d2420").font("Helvetica-Bold").text("FACTURE PROFORMA", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").fillColor("#333333").text(company, { align: "center" });
  if (addr || phone || email) {
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor("#555555");
    if (addr) doc.text(addr, { align: "center" });
    const line = [phone, email].filter(Boolean).join(" · ");
    if (line) doc.text(line, { align: "center" });
  }

  doc.moveDown(1.2);
  doc.fontSize(10).font("Helvetica-Bold").text("Client");
  doc.font("Helvetica").fontSize(10);
  doc.text(String(invoice.customer_name || invoice.customerName || "—"));
  if (invoice.customer_phone || invoice.customerPhone) {
    doc.text(String(invoice.customer_phone || invoice.customerPhone));
  }

  doc.moveDown(1);
  doc.font("Helvetica-Bold").text("Détail");
  doc.moveDown(0.3);
  doc.font("Helvetica");
  const amount = Number(invoice.amount_usd ?? invoice.amountUsd ?? 0);
  doc.text(`Montant dû : ${amount.toLocaleString("fr-FR", { style: "currency", currency: "USD" })}`);
  if (invoice.due_date || invoice.dueDate) {
    const d = new Date(invoice.due_date || invoice.dueDate);
    doc.text(`Échéance : ${d.toLocaleDateString("fr-FR")}`);
  }
  doc.text(`Réf. document : ${String(invoice.id)}`);
  doc.text(`Statut (système) : ${String(invoice.status || "—")}`);

  if (footerNote) {
    doc.moveDown(1);
    doc.fontSize(8).fillColor("#666666").text(footerNote, { align: "left", width: doc.page.width - 96 });
  }

  doc.moveDown(1.5);
  doc.fontSize(8).fillColor("#888888").font("Helvetica-Oblique").text(
    "Document informatif sans valeur fiscale définitive. Vérifiez les mentions légales auprès de votre comptable.",
    { align: "left", width: doc.page.width - 96 }
  );

  doc.end();
}
