import PDFDocument from "pdfkit";

export const buildPdf = (write: (doc: PDFKit.PDFDocument) => void) =>
	new Promise<Buffer>((resolve, reject) => {
		const doc = new PDFDocument({ margin: 50 });
		const chunks: Buffer[] = [];

		doc.on("data", (chunk: Buffer) => chunks.push(chunk));
		doc.on("end", () => resolve(Buffer.concat(chunks)));
		doc.on("error", reject);

		write(doc);
		doc.end();
	});
