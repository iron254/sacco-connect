import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const fmt = (n: number) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const downloadCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map(r => r.map(escape).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
};

const pdfHeader = (doc: jsPDF, title: string, subtitle?: string) => {
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("SACCO", 14, 18);
  doc.setFontSize(13);
  doc.setFont("helvetica", "normal");
  doc.text(title, 14, 27);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(subtitle, 14, 33);
    doc.setTextColor(0);
  }
  doc.setDrawColor(220);
  doc.line(14, 37, 196, 37);
};

const pdfFooter = (doc: jsPDF) => {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(
      `Generated ${new Date().toLocaleString()}  ·  Page ${i} of ${pages}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
    doc.setTextColor(0);
  }
};

export type ReceiptInput = {
  tx: {
    id: string;
    tx_type: string;
    amount: number;
    currency: string;
    method: string;
    status?: string;
    reference?: string | null;
    description?: string | null;
    created_at: string;
  };
  member: { full_name?: string | null; member_number?: string | null; email?: string | null };
  walletLabel?: string;
};

export const downloadReceipt = ({ tx, member, walletLabel }: ReceiptInput) => {
  const doc = new jsPDF();
  pdfHeader(doc, "Transaction Receipt", `Receipt ID: ${tx.id}`);

  const rows: [string, string][] = [
    ["Member", member.full_name || "—"],
    ["Member No.", member.member_number || "—"],
    ["Date", new Date(tx.created_at).toLocaleString()],
    ["Type", tx.tx_type.replace(/_/g, " ")],
    ["Wallet", walletLabel || "—"],
    ["Method", tx.method.replace(/_/g, " ")],
    ["Reference", tx.reference || "—"],
    ["Status", tx.status || "completed"],
    ["Description", tx.description || "—"],
  ];

  autoTable(doc, {
    startY: 44,
    head: [["Field", "Details"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } },
  });

  const endY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFillColor(245, 247, 250);
  doc.rect(14, endY, 182, 22, "F");
  doc.setFontSize(11);
  doc.text("Amount", 20, endY + 9);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`${tx.currency} ${fmt(Number(tx.amount))}`, 190, endY + 13, { align: "right" });
  doc.setFont("helvetica", "normal");

  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(
    "This is an electronically generated receipt and does not require a signature.",
    14,
    endY + 32
  );
  doc.setTextColor(0);

  pdfFooter(doc);
  doc.save(`receipt-${tx.id.slice(0, 8)}.pdf`);
};

export type FinancialReportInput = {
  rangeLabel: string;
  totals: { savings: number; shares: number; benevolent: number; loansActive: number };
  members: { full_name: string | null; member_number: string | null; kyc_status: string; created_at: string }[];
  transactions: {
    created_at: string;
    member?: string | null;
    tx_type: string;
    method: string;
    amount: number;
    currency: string;
    status: string;
  }[];
  loans: {
    created_at: string;
    member?: string | null;
    principal: number;
    term_months: number;
    monthly_payment: number;
    status: string;
  }[];
};

export const downloadFinancialReportPDF = (data: FinancialReportInput) => {
  const doc = new jsPDF();
  pdfHeader(doc, "Financial Report", data.rangeLabel);

  autoTable(doc, {
    startY: 44,
    head: [["Metric", "Value (KES)"]],
    body: [
      ["Total Savings", fmt(data.totals.savings)],
      ["Total Share Capital", fmt(data.totals.shares)],
      ["Total Charitable Fund", fmt(data.totals.benevolent)],
      ["Grand Total Holdings", fmt(data.totals.savings + data.totals.shares + data.totals.benevolent)],
      ["Active Loan Portfolio", fmt(data.totals.loansActive)],
      ["Members", String(data.members.length)],
      ["Transactions in period", String(data.transactions.length)],
      ["Loans in period", String(data.loans.length)],
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { fontSize: 10 },
  });

  const credit = data.transactions
    .filter(t => ["deposit", "transfer_in", "interest"].includes(t.tx_type) && t.status === "completed")
    .reduce((s, t) => s + Number(t.amount), 0);
  const debit = data.transactions
    .filter(t => ["withdrawal", "transfer_out", "fee"].includes(t.tx_type) && t.status === "completed")
    .reduce((s, t) => s + Number(t.amount), 0);

  autoTable(doc, {
    head: [["Transaction Summary", "Amount (KES)"]],
    body: [
      ["Total Inflows (completed)", fmt(credit)],
      ["Total Outflows (completed)", fmt(debit)],
      ["Net Movement", fmt(credit - debit)],
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { fontSize: 10 },
  });

  doc.addPage();
  pdfHeader(doc, "Transactions", data.rangeLabel);
  autoTable(doc, {
    startY: 44,
    head: [["Date", "Member", "Type", "Method", "Amount", "Status"]],
    body: data.transactions.map(t => [
      new Date(t.created_at).toLocaleDateString(),
      t.member || "—",
      t.tx_type.replace(/_/g, " "),
      t.method.replace(/_/g, " "),
      `${t.currency} ${fmt(Number(t.amount))}`,
      t.status,
    ]),
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { fontSize: 9 },
  });

  doc.addPage();
  pdfHeader(doc, "Loans", data.rangeLabel);
  autoTable(doc, {
    startY: 44,
    head: [["Applied", "Member", "Principal", "Term", "Monthly", "Status"]],
    body: data.loans.map(l => [
      new Date(l.created_at).toLocaleDateString(),
      l.member || "—",
      `KES ${fmt(Number(l.principal))}`,
      `${l.term_months} mo`,
      `KES ${fmt(Number(l.monthly_payment))}`,
      l.status,
    ]),
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    styles: { fontSize: 9 },
  });

  pdfFooter(doc);
  doc.save(`financial-report-${new Date().toISOString().slice(0, 10)}.pdf`);
};
